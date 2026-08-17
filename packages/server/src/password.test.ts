import test from "node:test";
import assert from "node:assert";
import {
  $hashPassword,
  $verifyPassword,
  $passwordNeedsRehash,
} from "./password.js";

test("$hashPassword produces a self-describing scrypt hash", async () => {
  const hash = await $hashPassword("correct horse battery staple");
  assert.ok(hash.startsWith("scrypt$"));
  assert.strictEqual(hash.split("$").length, 7);
});

test("$verifyPassword accepts the right password, rejects wrong", async () => {
  const hash = await $hashPassword("s3cret-password");
  assert.strictEqual(await $verifyPassword("s3cret-password", hash), true);
  assert.strictEqual(await $verifyPassword("wrong", hash), false);
});

test("$verifyPassword returns false for malformed hashes", async () => {
  assert.strictEqual(await $verifyPassword("x", "not-a-hash"), false);
  assert.strictEqual(await $verifyPassword("x", "scrypt$$$$$$"), false);
  assert.strictEqual(
    await $verifyPassword("x", "bcrypt$16384$8$1$64$AAAA$AAAA"),
    false,
  );
});

test("each hash uses a fresh salt", async () => {
  const a = await $hashPassword("same");
  const b = await $hashPassword("same");
  assert.notStrictEqual(a, b);
});

test("$passwordNeedsRehash detects weaker params", async () => {
  const weak = await $hashPassword("pw", { N: 1024 });
  assert.strictEqual($passwordNeedsRehash(weak), true);
  const current = await $hashPassword("pw");
  assert.strictEqual($passwordNeedsRehash(current), false);
  assert.strictEqual($passwordNeedsRehash("garbage"), true);
});

test("empty password is rejected at hash time", async () => {
  await assert.rejects(() => $hashPassword(""));
});
