import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "./errors.js";

const CSRF_COOKIE = "kallo.csrf";
const CSRF_HEADER = "x-kallo-csrf";
const CSRF_FIELD = "_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface RequestWithCsrf extends Request {
  csrfToken?: () => string;
}

function readCookie(req: Request, name: string): string | undefined {
  const fromParser = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  if (fromParser && fromParser[name]) return fromParser[name];
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * $csrf — double-submit-cookie CSRF protection.
 * Issues a per-session token cookie on safe requests and exposes
 * req.csrfToken() for forms; rejects unsafe requests (POST/PUT/PATCH/DELETE)
 * whose submitted token (header X-Kallo-CSRF or body._csrf) does not match.
 *
 * Usage:
 *   app.use($csrf());
 */
export function $csrf(
  options: { ignorePaths?: (string | RegExp)[] } = {},
) {
  const ignore = options.ignorePaths ?? [];

  return (req: Request, res: Response, next: NextFunction) => {
    let token = readCookie(req, CSRF_COOKIE);
    if (!token) {
      token = crypto.randomBytes(32).toString("base64url");
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
      });
    }
    (req as RequestWithCsrf).csrfToken = () => token!;
    res.locals.csrfToken = token;

    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const isIgnored = ignore.some((p) =>
      typeof p === "string" ? req.path === p : p.test(req.path),
    );
    if (isIgnored) {
      next();
      return;
    }

    const headerToken = req.headers[CSRF_HEADER];
    const bodyToken = (req as Request & { body?: Record<string, unknown> })
      .body?.[CSRF_FIELD];
    const submitted =
      (typeof headerToken === "string" ? headerToken : undefined) ??
      (typeof bodyToken === "string" ? bodyToken : undefined);

    if (!submitted || !constantTimeEqual(submitted, token)) {
      next(new ForbiddenError("Invalid or missing CSRF token"));
      return;
    }

    next();
  };
}

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string | false;
  hsts?: boolean;
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  noSniff?: boolean;
  referrerPolicy?: string | false;
}

/**
 * $securityHeaders — sets sensible security response headers.
 * CSP defaults to a CSP-safe policy (no unsafe-eval), matching Kallo's
 * compiled handler model. HSTS is only sent in production over HTTPS.
 *
 * Usage:
 *   app.use($securityHeaders());
 */
export function $securityHeaders(options: SecurityHeadersOptions = {}) {
  const {
    contentSecurityPolicy = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    hsts = true,
    frameOptions = "SAMEORIGIN",
    noSniff = true,
    referrerPolicy = "strict-origin-when-cross-origin",
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (contentSecurityPolicy !== false) {
      res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    }
    if (noSniff) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
    if (frameOptions !== false) {
      res.setHeader("X-Frame-Options", frameOptions);
    }
    if (referrerPolicy !== false) {
      res.setHeader("Referrer-Policy", referrerPolicy);
    }
    if (hsts && process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    next();
  };
}

export const __csrfInternals = {
  CSRF_COOKIE,
  CSRF_HEADER,
  CSRF_FIELD,
};
