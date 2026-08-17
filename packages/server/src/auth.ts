import crypto from "node:crypto";
import type { Request, Response } from "express";

// === Token primitives ===

interface TokenEnvelope {
  p: unknown;
  exp?: number;
}

interface RequestWithSession extends Request {
  session?: Record<string, unknown>;
}

interface KalloAbortError extends Error {
  isKalloAbort?: boolean;
  statusCode?: number;
}

export function signToken(
  payload: unknown,
  secret: string,
  expiresInMs?: number,
): string {
  const envelope: TokenEnvelope = { p: payload };
  if (typeof expiresInMs === "number") {
    envelope.exp = Date.now() + expiresInMs;
  }
  const data = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  const signature = hmac.digest("base64url");
  return `${data}.${signature}`;
}

/**
 * verifyToken — validates the HMAC and expiry of a token and returns its
 * payload, or null if the signature is invalid, the token is malformed, or it
 * has expired.
 *
 * Only enveloped tokens (produced by signToken) are accepted. Legacy
 * non-enveloped tokens are rejected so that a token which never carried an
 * expiry cannot live forever.
 */
export function verifyToken(token: string, secret: string): unknown | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  const data = parts[0];
  const signature = parts[1];
  if (!data || !signature || parts.length !== 2) return null;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(data);
  const expectedSignature = hmac.digest("base64url");

  const signatureBuf = Buffer.from(signature, "base64url");
  const expectedSignatureBuf = Buffer.from(expectedSignature, "base64url");

  if (signatureBuf.length !== expectedSignatureBuf.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(signatureBuf, expectedSignatureBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || !("p" in parsed)) {
      return null;
    }
    const envelope = parsed as TokenEnvelope;
    if (typeof envelope.exp === "number" && Date.now() > envelope.exp) {
      return null;
    }
    return envelope.p;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const COOKIE_NAME = "kallo.session";

/**
 * Minimum acceptable secret length. Below this the HMAC is brute-forceable;
 * in production a shorter secret is a hard error, in dev it warns.
 */
const RECOMMENDED_SECRET_LENGTH = 32;
const MIN_SECRET_LENGTH = 16;

const warnedSecrets = new Set<string>();

/**
 * $resolveAuthSecret — single source of truth for the signing secret used by
 * BOTH the built-in /api/auth endpoints and the page-protection helpers.
 * Prefers an explicit config secret, then KALLO_AUTH_SECRET. This removes the
 * old footgun where the endpoints and helpers could sign/verify with different
 * secrets and silently invalidate every session.
 */
export function $resolveAuthSecret(explicit?: string): string {
  const secret = explicit || process.env.KALLO_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "No auth secret set. Provide config.auth.secret or set KALLO_AUTH_SECRET in your .env.local to enable authentication.",
    );
  }
  const isProduction = process.env.NODE_ENV === "production";
  if (secret.length < MIN_SECRET_LENGTH) {
    if (isProduction) {
      throw new Error(
        `Auth secret is too short (${secret.length} chars). Use at least ${RECOMMENDED_SECRET_LENGTH} random characters.`,
      );
    }
    if (!warnedSecrets.has(secret)) {
      warnedSecrets.add(secret);
      console.warn(
        `[kallo] Auth secret is only ${secret.length} chars; use at least ${RECOMMENDED_SECRET_LENGTH} in production.`,
      );
    }
  } else if (
    secret.length < RECOMMENDED_SECRET_LENGTH &&
    !warnedSecrets.has(secret)
  ) {
    warnedSecrets.add(secret);
    console.warn(
      `[kallo] Auth secret is ${secret.length} chars; ${RECOMMENDED_SECRET_LENGTH}+ is recommended.`,
    );
  }
  return secret;
}

/**
 * $getAuthSecret — returns config.auth.secret or KALLO_AUTH_SECRET, or throws
 * if neither is set. Kept for backwards compatibility; delegates to
 * $resolveAuthSecret.
 */
export function $getAuthSecret(explicit?: string): string {
  return $resolveAuthSecret(explicit);
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

// === Cookie helpers ===

export interface SessionCookieOptions {
  cookieName?: string;
  maxAgeMs?: number;
  domain?: string;
  /** Override secure flag; defaults to true in production. */
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

/**
 * $setSessionCookie — signs a payload and sets a secure httpOnly session
 * cookie. For stateless sessions the payload is embedded directly; prefer the
 * adapter-backed session manager (createKalloAuth) so sessions can be revoked.
 *
 * Never pass raw database rows here — run them through $sanitizeUser first so a
 * password hash is never embedded in the (readable) token.
 */
export function $setSessionCookie(
  res: Response,
  payload: Record<string, unknown>,
  options: SessionCookieOptions & { secret?: string } = {},
): void {
  const secret = $resolveAuthSecret(options.secret);
  const maxAge = options.maxAgeMs ?? SESSION_MAX_AGE_MS;
  const token = signToken(payload, secret, maxAge);
  res.cookie(options.cookieName ?? COOKIE_NAME, token, {
    httpOnly: true,
    secure: options.secure ?? isProductionEnv(),
    sameSite: options.sameSite ?? "lax",
    maxAge,
    path: "/",
    domain: options.domain,
  });
}

function readCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {
    ...((req as Request & { cookies?: Record<string, string> }).cookies || {}),
  };
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    // Merge header-parsed cookies per key (fills gaps the upstream parser
    // missed) and guard decodeURIComponent so one malformed value can't throw
    // and break page-protection helpers for the whole request.
    for (const c of cookieHeader.split(";")) {
      const idx = c.indexOf("=");
      if (idx === -1) continue;
      const k = c.slice(0, idx).trim();
      if (!k || k in cookies) continue;
      const raw = c.slice(idx + 1).trim();
      try {
        cookies[k] = decodeURIComponent(raw);
      } catch {
        cookies[k] = raw;
      }
    }
  }
  return cookies;
}

/**
 * $currentUser — reads the stateless session cookie and returns the decoded
 * payload, or null if there is no valid session or no secret is configured.
 *
 * This is the stateless path (payload embedded in the cookie). When an adapter
 * is configured via createKalloAuth, the request already has ctx.req.user set
 * by the session middleware; read that instead for revocable sessions.
 */
export function $currentUser(
  ctx: { req: Request },
  options: { secret?: string; cookieName?: string } = {},
): Record<string, unknown> | null {
  const preset = (ctx.req as Request & { user?: unknown }).user;
  if (preset && typeof preset === "object") {
    return preset as Record<string, unknown>;
  }
  let secret: string;
  try {
    secret = $resolveAuthSecret(options.secret);
  } catch {
    return null;
  }
  const token = readCookies(ctx.req)[options.cookieName ?? COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token, secret) as Record<string, unknown> | null;
}

/**
 * $sessionPush — set arbitrary data in the request session object (server only).
 */
export function $sessionPush(
  ctx: { req: Request },
  data: Record<string, unknown>,
): void {
  const req = ctx.req as RequestWithSession;
  const session = req.session || {};
  Object.assign(session, data);
  req.session = session;
}

/**
 * $sessionGet — read a key from the request session object (server only).
 */
export function $sessionGet<T = unknown>(
  ctx: { req: Request },
  key: string,
): T | undefined {
  const session = (ctx.req as RequestWithSession).session || {};
  return session[key] as T | undefined;
}

/**
 * $requireAuth — throws a redirect abort if no user is logged in. Use inside
 * $serverPage to protect a page.
 */
export function $requireAuth(
  ctx: {
    req: Request;
    res: Response;
  },
  options: { redirectTo?: string; secret?: string; cookieName?: string } = {},
): Record<string, unknown> {
  const user = $currentUser(ctx, options);
  if (!user) {
    const err = new Error("Unauthorized") as KalloAbortError;
    err.isKalloAbort = true;
    err.statusCode = 302;
    ctx.res.setHeader("Location", options.redirectTo ?? "/login");
    throw err;
  }
  return user;
}

/**
 * $signOut — clears the session cookie server-side (for API routes). Note this
 * only clears the cookie; with an adapter, also delete the server session so
 * the token cannot be replayed (createKalloAuth's signout does both).
 */
export function $signOut(
  res: Response,
  options: SessionCookieOptions = {},
): void {
  res.clearCookie(options.cookieName ?? COOKIE_NAME, {
    httpOnly: true,
    secure: options.secure ?? isProductionEnv(),
    sameSite: options.sameSite ?? "lax",
    path: "/",
    domain: options.domain,
  });
}
