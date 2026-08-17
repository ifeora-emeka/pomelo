import crypto from "node:crypto";

// === Password hashing (scrypt, no native deps) ===
//
// Kallo hashes passwords with scrypt from node:crypto so there is no bcrypt/
// argon2 native dependency to install. The stored format is self-describing:
//
//   scrypt$N$r$p$keylen$salt_b64$hash_b64
//
// so parameters can be tuned over time and old hashes still verify (and can be
// transparently upgraded — see $passwordNeedsRehash).

const SCHEME = "scrypt";

export interface ScryptParams {
  /** CPU/memory cost. Must be a power of 2. Default 16384 (2^14). */
  N: number;
  /** Block size. Default 8. */
  r: number;
  /** Parallelization. Default 1. */
  p: number;
  /** Derived key length in bytes. Default 64. */
  keylen: number;
}

const DEFAULT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1, keylen: 64 };

// scrypt needs maxmem large enough for the chosen params or it throws.
// 128 * N * r * p bytes, with generous headroom.
function maxmemFor(params: ScryptParams): number {
  return 256 * params.N * params.r * params.p + 1024 * 1024;
}

function scryptAsync(
  password: Buffer,
  salt: Buffer,
  params: ScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      params.keylen,
      { N: params.N, r: params.r, p: params.p, maxmem: maxmemFor(params) },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
}

/**
 * $hashPassword — hashes a plaintext password with scrypt and a random salt.
 * Returns a self-describing string safe to store in your database.
 *
 * Usage:
 *   const hash = await $hashPassword(plaintext);
 */
export async function $hashPassword(
  password: string,
  params: Partial<ScryptParams> = {},
): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  const p: ScryptParams = { ...DEFAULT_PARAMS, ...params };
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(Buffer.from(password, "utf8"), salt, p);
  return [
    SCHEME,
    p.N,
    p.r,
    p.p,
    p.keylen,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

interface ParsedHash {
  params: ScryptParams;
  salt: Buffer;
  hash: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== SCHEME) return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const keylen = Number(parts[4]);
  if (![N, r, p, keylen].every((n) => Number.isInteger(n) && n > 0)) {
    return null;
  }
  try {
    const salt = Buffer.from(parts[5]!, "base64");
    const hash = Buffer.from(parts[6]!, "base64");
    if (salt.length === 0 || hash.length === 0) return null;
    return { params: { N, r, p, keylen }, salt, hash };
  } catch {
    return null;
  }
}

/**
 * $verifyPassword — checks a plaintext password against a stored hash in
 * constant time. Returns false for malformed hashes rather than throwing, so a
 * corrupt record can never be mistaken for a match.
 *
 * Usage:
 *   if (await $verifyPassword(input, user.passwordHash)) { ...  }
 */
export async function $verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parsed = parseHash(stored);
  if (!parsed) return false;
  let derived: Buffer;
  try {
    derived = await scryptAsync(
      Buffer.from(password, "utf8"),
      parsed.salt,
      parsed.params,
    );
  } catch {
    return false;
  }
  if (derived.length !== parsed.hash.length) return false;
  return crypto.timingSafeEqual(derived, parsed.hash);
}

/**
 * $passwordNeedsRehash — true if a stored hash used weaker parameters than the
 * current defaults (or a target you pass). Rehash on next successful login to
 * transparently upgrade older accounts.
 *
 * Usage:
 *   if (await $verifyPassword(pw, hash) && $passwordNeedsRehash(hash)) {
 *     await adapter.updateUser(user.id, { passwordHash: await $hashPassword(pw) });
 *   }
 */
export function $passwordNeedsRehash(
  stored: string,
  target: Partial<ScryptParams> = {},
): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return true;
  const t: ScryptParams = { ...DEFAULT_PARAMS, ...target };
  return (
    parsed.params.N < t.N ||
    parsed.params.r < t.r ||
    parsed.params.p < t.p ||
    parsed.params.keylen < t.keylen
  );
}

export const __passwordInternals = { parseHash, DEFAULT_PARAMS };
