import type { Request, Response, NextFunction } from "express";
import { BadRequestError, KalloError } from "./errors.js";

export interface UploadedFile {
  field: string;
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  files: UploadedFile[];
}

export interface UploadOptions {
  maxFileSize?: number;
  maxFiles?: number;
  allowedMimeTypes?: string[];
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

interface ParsedDisposition {
  name?: string;
  filename?: string;
}

function parseContentDisposition(header: string): ParsedDisposition {
  const result: ParsedDisposition = {};
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (key === "name") result.name = value;
    else if (key === "filename") result.filename = value;
  }
  return result;
}

function parsePartHeaders(headerBlock: Buffer): {
  disposition: ParsedDisposition;
  contentType: string;
} {
  const text = headerBlock.toString("utf8");
  const lines = text.split("\r\n");
  let disposition: ParsedDisposition = {};
  let contentType = "application/octet-stream";
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === "content-disposition") {
      disposition = parseContentDisposition(value);
    } else if (name === "content-type") {
      contentType = value;
    }
  }
  return { disposition, contentType };
}

function indexOfBuffer(haystack: Buffer, needle: Buffer, from: number): number {
  return haystack.indexOf(needle, from);
}

/**
 * parseMultipart — pure, dependency-free parser for multipart/form-data
 * request bodies. Splits the raw body on the boundary, separates each part's
 * headers from its body, and returns text fields plus binary-safe files.
 *
 * Usage:
 *   const { fields, files } = parseMultipart(rawBody, boundary);
 */
export function parseMultipart(body: Buffer, boundary: string): ParsedMultipart {
  if (!boundary) {
    throw new BadRequestError("Missing multipart boundary");
  }

  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];

  const delimiter = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from("\r\n\r\n");

  let start = indexOfBuffer(body, delimiter, 0);
  if (start === -1) {
    throw new BadRequestError("Malformed multipart body: boundary not found");
  }

  while (start !== -1) {
    let cursor = start + delimiter.length;

    if (
      body[cursor] === 0x2d &&
      body[cursor + 1] === 0x2d
    ) {
      break;
    }

    if (body[cursor] === 0x0d && body[cursor + 1] === 0x0a) {
      cursor += 2;
    }

    const next = indexOfBuffer(body, delimiter, cursor);
    if (next === -1) {
      break;
    }

    let partEnd = next;
    if (
      body[partEnd - 2] === 0x0d &&
      body[partEnd - 1] === 0x0a
    ) {
      partEnd -= 2;
    }

    const headerEnd = indexOfBuffer(body, headerSeparator, cursor);
    if (headerEnd === -1 || headerEnd > partEnd) {
      start = next;
      continue;
    }

    const headerBlock = body.subarray(cursor, headerEnd);
    const contentStart = headerEnd + headerSeparator.length;
    const content = body.subarray(contentStart, partEnd);

    const { disposition, contentType } = parsePartHeaders(headerBlock);
    const fieldName = disposition.name ?? "";

    if (disposition.filename !== undefined) {
      const data = Buffer.from(content);
      files.push({
        field: fieldName,
        filename: disposition.filename,
        mimeType: contentType,
        size: data.length,
        data,
      });
    } else {
      fields[fieldName] = content.toString("utf8");
    }

    start = next;
  }

  return { fields, files };
}

/**
 * extractBoundary — reads the boundary token from a Content-Type header value.
 * Returns undefined when the request is not multipart/form-data.
 */
export function extractBoundary(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined;
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return undefined;
  }
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return undefined;
  const value = (match[1] ?? match[2] ?? "").trim();
  return value.length > 0 ? value : undefined;
}

function readRawBody(req: Request): Promise<Buffer> {
  const existing = (req as Request & { rawBody?: Buffer }).rawBody;
  if (Buffer.isBuffer(existing)) {
    return Promise.resolve(existing);
  }
  const preParsed = (req as Request & { body?: unknown }).body;
  if (Buffer.isBuffer(preParsed)) {
    return Promise.resolve(preParsed);
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function applyConstraints(parsed: ParsedMultipart, options: UploadOptions): void {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  if (options.maxFiles !== undefined && parsed.files.length > options.maxFiles) {
    throw new KalloError(
      `Too many files: ${parsed.files.length} exceeds limit of ${options.maxFiles}`,
      413,
    );
  }
  for (const file of parsed.files) {
    if (file.size > maxFileSize) {
      throw new KalloError(
        `File "${file.filename}" exceeds maximum size of ${maxFileSize} bytes`,
        413,
      );
    }
    if (
      options.allowedMimeTypes !== undefined &&
      !options.allowedMimeTypes.includes(file.mimeType)
    ) {
      throw new BadRequestError(
        `File "${file.filename}" has disallowed type "${file.mimeType}"`,
      );
    }
  }
}

interface RequestWithFiles extends Request {
  files?: UploadedFile[];
}

/**
 * $uploads — Express middleware for typed multipart/form-data uploads.
 * On a multipart request it reads the raw body, parses it, enforces the
 * configured limits, then populates req.files and merges text fields into
 * req.body. Non-multipart requests pass through untouched. Surface parsed
 * files inside a $action with $file/$files.
 *
 * Usage:
 *   app.use($uploads({ maxFileSize: 5 * 1024 * 1024, allowedMimeTypes: ["image/png"] }));
 */
export function $uploads(options: UploadOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const boundary = extractBoundary(req.headers["content-type"]);
    if (!boundary) {
      next();
      return;
    }
    try {
      const raw = await readRawBody(req);
      const parsed = parseMultipart(raw, boundary);
      applyConstraints(parsed, options);

      const reqWithFiles = req as RequestWithFiles;
      reqWithFiles.files = parsed.files;

      const body = (req.body as Record<string, unknown> | undefined) ?? {};
      for (const [key, value] of Object.entries(parsed.fields)) {
        body[key] = value;
      }
      req.body = body;

      next();
    } catch (err) {
      next(err);
    }
  };
}

interface FileContext {
  req: Request & { files?: UploadedFile[] };
}

/**
 * $file — typed accessor for a single uploaded file by field name inside a
 * $action. Returns undefined when no file was uploaded for that field.
 *
 * Usage:
 *   const avatar = $file(ctx, "avatar");
 */
export function $file(ctx: FileContext, field: string): UploadedFile | undefined {
  const files = ctx.req.files;
  if (!files) return undefined;
  return files.find((f) => f.field === field);
}

/**
 * $files — typed accessor for all uploaded files for a field name inside a
 * $action. Returns an empty array when none were uploaded.
 *
 * Usage:
 *   const photos = $files(ctx, "photos");
 */
export function $files(ctx: FileContext, field: string): UploadedFile[] {
  const files = ctx.req.files;
  if (!files) return [];
  return files.filter((f) => f.field === field);
}
