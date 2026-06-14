import test from "node:test";
import assert from "node:assert";
import type { Request, Response, NextFunction } from "express";
import {
  parseMultipart,
  extractBoundary,
  $uploads,
  $file,
  $files,
  type UploadedFile,
} from "./uploads.js";
import { BadRequestError, KalloError } from "./errors.js";

const BOUNDARY = "----KalloTestBoundary";

function part(headers: string, body: Buffer | string): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\n`),
    Buffer.from(`${headers}\r\n\r\n`),
    typeof body === "string" ? Buffer.from(body) : body,
    Buffer.from("\r\n"),
  ]);
}

function buildBody(parts: Buffer[]): Buffer {
  return Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}--\r\n`)]);
}

test("parseMultipart parses a single file", () => {
  const body = buildBody([
    part(
      'Content-Disposition: form-data; name="avatar"; filename="hi.txt"\r\nContent-Type: text/plain',
      "hello world",
    ),
  ]);
  const { fields, files } = parseMultipart(body, BOUNDARY);
  assert.strictEqual(Object.keys(fields).length, 0);
  assert.strictEqual(files.length, 1);
  const file = files[0]!;
  assert.strictEqual(file.field, "avatar");
  assert.strictEqual(file.filename, "hi.txt");
  assert.strictEqual(file.mimeType, "text/plain");
  assert.strictEqual(file.size, 11);
  assert.strictEqual(file.data.toString("utf8"), "hello world");
});

test("parseMultipart parses multiple files and text fields", () => {
  const body = buildBody([
    part('Content-Disposition: form-data; name="title"', "My Title"),
    part(
      'Content-Disposition: form-data; name="doc"; filename="a.txt"\r\nContent-Type: text/plain',
      "AAA",
    ),
    part(
      'Content-Disposition: form-data; name="doc"; filename="b.txt"\r\nContent-Type: text/plain',
      "BBBB",
    ),
    part('Content-Disposition: form-data; name="desc"', "some desc"),
  ]);
  const { fields, files } = parseMultipart(body, BOUNDARY);
  assert.strictEqual(fields.title, "My Title");
  assert.strictEqual(fields.desc, "some desc");
  assert.strictEqual(files.length, 2);
  assert.deepStrictEqual(
    files.map((f) => f.filename),
    ["a.txt", "b.txt"],
  );
  assert.strictEqual(files[0]!.field, "doc");
  assert.strictEqual(files[1]!.field, "doc");
});

test("parseMultipart is binary-safe", () => {
  const binary = Buffer.from([0x00, 0x0d, 0x0a, 0xff, 0x42, 0x00, 0x2d, 0x2d]);
  const body = buildBody([
    part(
      'Content-Disposition: form-data; name="blob"; filename="data.bin"\r\nContent-Type: application/octet-stream',
      binary,
    ),
  ]);
  const { files } = parseMultipart(body, BOUNDARY);
  assert.strictEqual(files.length, 1);
  assert.deepStrictEqual(files[0]!.data, binary);
  assert.strictEqual(files[0]!.size, binary.length);
  assert.strictEqual(files[0]!.mimeType, "application/octet-stream");
});

test("parseMultipart throws on missing boundary argument", () => {
  const body = buildBody([part('Content-Disposition: form-data; name="x"', "1")]);
  assert.throws(() => parseMultipart(body, ""), BadRequestError);
});

test("parseMultipart throws when boundary is absent from body", () => {
  assert.throws(
    () => parseMultipart(Buffer.from("not multipart at all"), BOUNDARY),
    BadRequestError,
  );
});

test("extractBoundary reads boundary from content-type", () => {
  assert.strictEqual(
    extractBoundary("multipart/form-data; boundary=----KalloTestBoundary"),
    "----KalloTestBoundary",
  );
  assert.strictEqual(
    extractBoundary('multipart/form-data; boundary="quoted-boundary"'),
    "quoted-boundary",
  );
  assert.strictEqual(extractBoundary("application/json"), undefined);
  assert.strictEqual(extractBoundary(undefined), undefined);
  assert.strictEqual(extractBoundary("multipart/form-data"), undefined);
});

function mockReq(body: Buffer, contentType: string): Request {
  return {
    headers: { "content-type": contentType },
    body: undefined,
    rawBody: body,
  } as unknown as Request;
}

const noopRes = {} as unknown as Response;

test("$uploads populates req.files and merges fields", async () => {
  const body = buildBody([
    part('Content-Disposition: form-data; name="title"', "Hello"),
    part(
      'Content-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png',
      "imgdata",
    ),
  ]);
  const req = mockReq(body, `multipart/form-data; boundary=${BOUNDARY}`);
  let err: unknown = "untouched";
  await $uploads()(req, noopRes, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.strictEqual(err, undefined);
  const files = (req as Request & { files?: UploadedFile[] }).files;
  assert.strictEqual(files?.length, 1);
  assert.strictEqual(files[0]!.filename, "a.png");
  assert.strictEqual((req.body as Record<string, unknown>).title, "Hello");
});

test("$uploads passes through non-multipart requests", async () => {
  const req = mockReq(Buffer.from("{}"), "application/json");
  let called = false;
  let err: unknown = "untouched";
  await $uploads()(req, noopRes, ((e?: unknown) => {
    called = true;
    err = e;
  }) as NextFunction);
  assert.ok(called);
  assert.strictEqual(err, undefined);
  assert.strictEqual(
    (req as Request & { files?: UploadedFile[] }).files,
    undefined,
  );
});

test("$uploads enforces maxFileSize with a 413", async () => {
  const body = buildBody([
    part(
      'Content-Disposition: form-data; name="big"; filename="big.bin"\r\nContent-Type: application/octet-stream',
      "0123456789",
    ),
  ]);
  const req = mockReq(body, `multipart/form-data; boundary=${BOUNDARY}`);
  let err: unknown;
  await $uploads({ maxFileSize: 4 })(req, noopRes, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.ok(err instanceof KalloError);
  assert.strictEqual((err as KalloError).statusCode, 413);
});

test("$uploads enforces maxFiles with a 413", async () => {
  const body = buildBody([
    part(
      'Content-Disposition: form-data; name="f"; filename="a.txt"\r\nContent-Type: text/plain',
      "a",
    ),
    part(
      'Content-Disposition: form-data; name="f"; filename="b.txt"\r\nContent-Type: text/plain',
      "b",
    ),
  ]);
  const req = mockReq(body, `multipart/form-data; boundary=${BOUNDARY}`);
  let err: unknown;
  await $uploads({ maxFiles: 1 })(req, noopRes, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.ok(err instanceof KalloError);
  assert.strictEqual((err as KalloError).statusCode, 413);
});

test("$uploads rejects disallowed mime types", async () => {
  const body = buildBody([
    part(
      'Content-Disposition: form-data; name="doc"; filename="x.exe"\r\nContent-Type: application/x-msdownload',
      "MZ",
    ),
  ]);
  const req = mockReq(body, `multipart/form-data; boundary=${BOUNDARY}`);
  let err: unknown;
  await $uploads({ allowedMimeTypes: ["image/png"] })(req, noopRes, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.ok(err instanceof BadRequestError);
});

test("$file and $files read from ctx.req.files", () => {
  const files: UploadedFile[] = [
    { field: "doc", filename: "a.txt", mimeType: "text/plain", size: 1, data: Buffer.from("a") },
    { field: "doc", filename: "b.txt", mimeType: "text/plain", size: 1, data: Buffer.from("b") },
    { field: "avatar", filename: "c.png", mimeType: "image/png", size: 1, data: Buffer.from("c") },
  ];
  const ctx = { req: { files } as unknown as Request & { files?: UploadedFile[] } };

  const avatar = $file(ctx, "avatar");
  assert.strictEqual(avatar?.filename, "c.png");
  assert.strictEqual($file(ctx, "missing"), undefined);

  const docs = $files(ctx, "doc");
  assert.strictEqual(docs.length, 2);
  assert.deepStrictEqual(docs.map((f) => f.filename), ["a.txt", "b.txt"]);
  assert.deepStrictEqual($files(ctx, "missing"), []);
});

test("$file and $files return empty when no files present", () => {
  const ctx = { req: {} as unknown as Request & { files?: UploadedFile[] } };
  assert.strictEqual($file(ctx, "x"), undefined);
  assert.deepStrictEqual($files(ctx, "x"), []);
});
