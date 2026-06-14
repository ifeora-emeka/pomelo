import crypto from "node:crypto";
import type { Request, Response } from "express";

// === Token primitives ===

interface TokenEnvelope {
  p: unknown;
  exp?: number;
}

export function signToken(
  payload: any,
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

export function verifyToken(token: string, secret: string): any | null {
  const parts = token.split(".");
  const data = parts[0];
  const signature = parts[1];
  if (!data || !signature) return null;

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
    // Enveloped token with optional expiry; fall back to the raw payload for
    // any legacy non-enveloped token.
    if (parsed && typeof parsed === "object" && "p" in parsed) {
      const envelope = parsed as TokenEnvelope;
      if (typeof envelope.exp === "number" && Date.now() > envelope.exp) {
        return null;
      }
      return envelope.p;
    }
    return parsed;
  } catch {
    return null;
  }
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// === Server-side auth utilities ===

const COOKIE_NAME = "kallo.session";

/**
 * $getAuthSecret — returns KALLO_AUTH_SECRET or throws if not set.
 * All auth write operations require this env var (server-only).
 *
 * Usage:
 *   const secret = $getAuthSecret();
 */
export function $getAuthSecret(): string {
  const secret = process.env.KALLO_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "KALLO_AUTH_SECRET is not set. Add it to your .env.local file to enable authentication.",
    );
  }
  return secret;
}

/**
 * $setSessionCookie — signs a payload and sets a secure httpOnly session cookie.
 * Call this after a successful login or signup.
 *
 * Usage in an API handler:
 *   $setSessionCookie(res, { id: user.id, email: user.email, name: user.name });
 */
export function $setSessionCookie(res: Response, payload: Record<string, any>): void {
  const secret = $getAuthSecret();
  const token = signToken(payload, secret, SESSION_MAX_AGE_MS);
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

/**
 * $currentUser — reads the session cookie and returns the decoded user,
 * or null if no valid session or KALLO_AUTH_SECRET is missing.
 *
 * Usage in $serverPage:
 *   const user = $currentUser(ctx);
 */
export function $currentUser(ctx: { req: Request }): any | null {
  const secret = process.env.KALLO_AUTH_SECRET;
  if (!secret) return null;

  const cookies: Record<string, string> = (ctx.req as any).cookies || {};

  const cookieHeader = ctx.req.headers.cookie;
  if (cookieHeader && Object.keys(cookies).length === 0) {
    cookieHeader.split(";").forEach((c) => {
      const [k, ...rest] = c.split("=");
      if (k) cookies[k.trim()] = rest.join("=").trim();
    });
  }

  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token, secret);
}

/**
 * $sessionPush — set arbitrary data in the request session object (server only).
 * Useful for passing computed data from $serverPage to layouts.
 *
 * Usage:
 *   $sessionPush(ctx, { role: "admin" });
 */
export function $sessionPush(ctx: { req: Request }, data: Record<string, any>): void {
  const session = (ctx.req as any).session || {};
  Object.assign(session, data);
  (ctx.req as any).session = session;
}

/**
 * $sessionGet — read a key from the request session object (server only).
 *
 * Usage:
 *   const role = $sessionGet(ctx, "role");
 */
export function $sessionGet<T = any>(ctx: { req: Request }, key: string): T | undefined {
  const session = (ctx.req as any).session || {};
  return session[key] as T | undefined;
}

/**
 * $requireAuth — throws a redirect abort if no user is logged in.
 * Use inside $serverPage to protect a page.
 *
 * Usage:
 *   const user = $requireAuth(ctx);
 */
export function $requireAuth(ctx: { req: Request; res: Response }): any {
  const user = $currentUser(ctx);
  if (!user) {
    const err = new Error("Unauthorized") as any;
    err.isKalloAbort = true;
    err.statusCode = 302;
    ctx.res.setHeader("Location", "/login");
    throw err;
  }
  return user;
}

/**
 * $signOut — clears the session cookie server-side (for API routes).
 *
 * Usage in an API handler:
 *   $signOut(res);
 *   res.ok({ success: true });
 */
export function $signOut(res: Response): void {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });
}

