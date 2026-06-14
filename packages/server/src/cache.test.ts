import test from "node:test";
import assert from "node:assert";
import { $cache, $revalidate, clearCache, cacheSize } from "./cache.js";

test("$cache memoizes a loader within its TTL", async () => {
  clearCache();
  let calls = 0;
  const loader = () => {
    calls++;
    return Promise.resolve({ n: calls });
  };
  const a = await $cache("k1", loader, { revalidate: 60 });
  const b = await $cache("k1", loader, { revalidate: 60 });
  assert.deepStrictEqual(a, { n: 1 });
  assert.deepStrictEqual(b, { n: 1 });
  assert.strictEqual(calls, 1);
});

test("$cache coalesces concurrent calls into one in-flight load", async () => {
  clearCache();
  let calls = 0;
  const loader = () =>
    new Promise((resolve) => {
      calls++;
      setTimeout(() => resolve(calls), 5);
    });
  const [a, b, c] = await Promise.all([
    $cache("k2", loader, { revalidate: 60 }),
    $cache("k2", loader, { revalidate: 60 }),
    $cache("k2", loader, { revalidate: 60 }),
  ]);
  assert.strictEqual(calls, 1);
  assert.strictEqual(a, 1);
  assert.strictEqual(b, 1);
  assert.strictEqual(c, 1);
});

test("$cache refetches after TTL expires", async () => {
  clearCache();
  let calls = 0;
  const loader = () => Promise.resolve(++calls);
  await $cache("k3", loader, { revalidate: 0.01 });
  await new Promise((r) => setTimeout(r, 20));
  const second = await $cache("k3", loader, { revalidate: 0.01 });
  assert.strictEqual(second, 2);
});

test("$revalidate evicts by tag", async () => {
  clearCache();
  let calls = 0;
  const loader = () => Promise.resolve(++calls);
  await $cache("posts:1", loader, { revalidate: 60, tags: ["posts"] });
  await $cache("posts:2", loader, { revalidate: 60, tags: ["posts"] });
  const removed = $revalidate("posts");
  assert.strictEqual(removed, 2);
  assert.strictEqual(cacheSize(), 0);
});

test("$revalidate evicts by exact key", async () => {
  clearCache();
  const loader = () => Promise.resolve(1);
  await $cache("only:1", loader, { revalidate: 60 });
  await $cache("only:2", loader, { revalidate: 60 });
  const removed = $revalidate({ key: "only:1" });
  assert.strictEqual(removed, 1);
  assert.strictEqual(cacheSize(), 1);
});

test("$cache with no revalidate caches until manually invalidated", async () => {
  clearCache();
  let calls = 0;
  const loader = () => Promise.resolve(++calls);
  await $cache("static", loader);
  await $cache("static", loader);
  assert.strictEqual(calls, 1);
});
