import test from "node:test";
import assert from "node:assert";
import type { Request, Response } from "express";
import {
  signToken,
  verifyToken,
  $resolveAuthSecret,
  $currentUser,
  $requireAuth,
} from "./auth.js";

const SECRET = "test-secret-that-is-long-enough-32chars";

test("signToken/verifyToken round-trips a payload", () => {
  const token = signToken({ id: "u1" }, SECRET);
  assert.deepStrictEqual(verifyToken(token, SECRET), { id: "u1" });
});

test("verifyToken rejects a tampered signature", () => {
  const token = signToken({ id: "u1" }, SECRET);
  const tampered = token.slice(0, -2) + "xy";
  assert.strictEqual(verifyToken(tampered, SECRET), null);
});

test("verifyToken rejects a wrong secret", () => {
  const token = signToken({ id: "u1" }, SECRET);
  assert.strictEqual(verifyToken(token, "another-secret-32-characters-long!!"), null);
});

test("verifyToken enforces expiry", () => {
  const token = signToken({ id: "u1" }, SECRET, -1);
  assert.strictEqual(verifyToken(token, SECRET), null);
});

test("verifyToken rejects non-enveloped/garbage tokens", () => {
  assert.strictEqual(verifyToken("garbage", SECRET), null);
  assert.strictEqual(verifyToken("a.b.c", SECRET), null);
});

test("$resolveAuthSecret prefers explicit over env, enforces length", () => {
  assert.strictEqual($resolveAuthSecret(SECRET), SECRET);
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => $resolveAuthSecret("short"));
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("$resolveAuthSecret throws when nothing is set", () => {
  const prev = process.env.KALLO_AUTH_SECRET;
  delete process.env.KALLO_AUTH_SECRET;
  try {
    assert.throws(() => $resolveAuthSecret());
  } finally {
    if (prev !== undefined) process.env.KALLO_AUTH_SECRET = prev;
  }
});

test("$currentUser reads a preset req.user before the cookie", () => {
  const req = { user: { id: "preset" }, headers: {} } as unknown as Request;
  assert.deepStrictEqual($currentUser({ req }), { id: "preset" });
});

test("$requireAuth redirects when unauthenticated", () => {
  const headers: Record<string, string> = {};
  const req = { headers: {}, cookies: {} } as unknown as Request;
  const res = {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
  } as unknown as Response;
  assert.throws(
    () => $requireAuth({ req, res }, { secret: SECRET }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 302,
  );
  assert.strictEqual(headers.Location, "/login");
});
