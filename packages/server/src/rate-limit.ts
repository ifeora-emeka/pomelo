import type { Request, Response, NextFunction } from "express";

export interface RateLimitHit {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): RateLimitHit;
  reset?(): void;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, RateLimitHit>();

  increment(key: string, windowMs: number): RateLimitHit {
    const now = Date.now();
    const existing = this.hits.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh: RateLimitHit = { count: 1, resetAt: now + windowMs };
      this.hits.set(key, fresh);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  reset(): void {
    this.hits.clear();
  }
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
  statusCode?: number;
  store?: RateLimitStore;
  standardHeaders?: boolean;
}

function defaultKeyGenerator(req: Request): string {
  if (req.ip) return req.ip;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]!.trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * $rateLimit — per-route request rate limiting middleware.
 * Counts requests per key (client IP by default) within a fixed window and
 * rejects with 429 once the limit is exceeded, setting Retry-After. Standard
 * RateLimit-* headers are emitted on allowed requests when enabled. Swap the
 * in-memory store for a shared backend (e.g. Redis) via the store option.
 *
 * Usage:
 *   app.get("/login", $rateLimit({ windowMs: 60000, max: 5 }), handler);
 */
export function $rateLimit(
  options: RateLimitOptions = {},
): (req: Request, res: Response, next: NextFunction) => void {
  const windowMs = options.windowMs ?? 60000;
  const max = options.max ?? 60;
  const message = options.message ?? "Too many requests";
  const statusCode = options.statusCode ?? 429;
  const standardHeaders = options.standardHeaders ?? true;
  const store: RateLimitStore = options.store ?? new MemoryRateLimitStore();
  const keyGenerator = options.keyGenerator ?? defaultKeyGenerator;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const hit = store.increment(key, windowMs);
    const remaining = Math.max(0, max - hit.count);
    const resetSeconds = Math.max(0, Math.ceil((hit.resetAt - Date.now()) / 1000));

    if (standardHeaders) {
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(remaining));
      res.setHeader("RateLimit-Reset", String(resetSeconds));
    }

    if (hit.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      res.status(statusCode).send(message);
      return;
    }

    next();
  };
}
