import test from "node:test";
import assert from "node:assert";
import { MemoryAuthAdapter, $sanitizeUser } from "./auth-adapter.js";

test("createUser + lookups are case-insensitive on email", async () => {
  const a = new MemoryAuthAdapter();
  const user = await a.createUser({ email: "Alice@Example.COM" });
  assert.strictEqual(user.email, "alice@example.com");
  assert.ok(await a.getUserByEmail("alice@EXAMPLE.com"));
  assert.ok(await a.getUserById(user.id));
});

test("duplicate email is rejected", async () => {
  const a = new MemoryAuthAdapter();
  await a.createUser({ email: "dup@example.com" });
  await assert.rejects(() => a.createUser({ email: "dup@example.com" }));
});

test("sessions expire and can be revoked per user", async () => {
  const a = new MemoryAuthAdapter();
  const u = await a.createUser({ email: "s@example.com" });
  const live = await a.createSession({
    userId: u.id,
    expiresAt: Date.now() + 10000,
  });
  const dead = await a.createSession({
    userId: u.id,
    expiresAt: Date.now() - 1,
  });
  assert.ok(await a.getSession(live.id));
  assert.strictEqual(await a.getSession(dead.id), null); // expired -> null
  await a.deleteUserSessions(u.id);
  assert.strictEqual(await a.getSession(live.id), null);
});

test("verification token is single-use and expiry-aware", async () => {
  const a = new MemoryAuthAdapter();
  await a.createVerificationToken({
    identifier: "v@example.com",
    tokenHash: "hash1",
    purpose: "email-verify",
    expiresAt: Date.now() + 10000,
  });
  const first = await a.useVerificationToken({
    identifier: "v@example.com",
    tokenHash: "hash1",
    purpose: "email-verify",
  });
  assert.ok(first);
  // Consumed — second use fails.
  const second = await a.useVerificationToken({
    identifier: "v@example.com",
    tokenHash: "hash1",
    purpose: "email-verify",
  });
  assert.strictEqual(second, null);
});

test("expired verification token does not verify", async () => {
  const a = new MemoryAuthAdapter();
  await a.createVerificationToken({
    identifier: "e@example.com",
    tokenHash: "h",
    purpose: "password-reset",
    expiresAt: Date.now() - 1,
  });
  const used = await a.useVerificationToken({
    identifier: "e@example.com",
    tokenHash: "h",
    purpose: "password-reset",
  });
  assert.strictEqual(used, null);
});

test("OAuth account linking round-trips", async () => {
  const a = new MemoryAuthAdapter();
  const u = await a.createUser({ email: "o@example.com" });
  await a.linkAccount({
    userId: u.id,
    provider: "google",
    providerAccountId: "g-123",
  });
  const acc = await a.getAccount("google", "g-123");
  assert.strictEqual(acc?.userId, u.id);
  assert.strictEqual(await a.getAccount("google", "nope"), null);
});

test("$sanitizeUser strips the password hash", () => {
  const safe = $sanitizeUser({
    id: "1",
    email: "x@example.com",
    passwordHash: "secret",
  });
  assert.strictEqual((safe as Record<string, unknown>).passwordHash, undefined);
  assert.strictEqual(safe.email, "x@example.com");
});
