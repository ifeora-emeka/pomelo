import test from "node:test";
import assert from "node:assert";
import {
  prefetch,
  getPrefetched,
  consumePrefetched,
  clearPrefetchCache,
  isInternalHref,
  shouldPrefetch,
} from "./prefetch.js";

type AnyGlobal = { fetch?: unknown };

function stubFetch(data: unknown) {
  let calls = 0;
  (globalThis as AnyGlobal).fetch = (() => {
    calls++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  }) as unknown;
  return () => calls;
}

test("isInternalHref accepts internal paths only", () => {
  assert.ok(isInternalHref("/about"));
  assert.ok(!isInternalHref("//evil.com"));
  assert.ok(!isInternalHref("https://x.com"));
  assert.ok(!isInternalHref(null));
});

test("shouldPrefetch defaults on and respects opt-out", () => {
  const on = { getAttribute: () => null };
  const off = { getAttribute: () => "none" };
  const off2 = { getAttribute: () => "false" };
  assert.strictEqual(shouldPrefetch(on), true);
  assert.strictEqual(shouldPrefetch(off), false);
  assert.strictEqual(shouldPrefetch(off2), false);
});

test("prefetch fetches once and caches the payload", async () => {
  clearPrefetchCache();
  const getCalls = stubFetch({ page: "about" });
  prefetch("/about");
  prefetch("/about");
  const data = await getPrefetched("/about");
  assert.deepStrictEqual(data, { page: "about" });
  assert.strictEqual(getCalls(), 1);
});

test("prefetch ignores external hrefs", () => {
  clearPrefetchCache();
  stubFetch({});
  assert.strictEqual(prefetch("https://x.com"), undefined);
  assert.strictEqual(getPrefetched("https://x.com"), undefined);
});

test("consumePrefetched returns and removes the cached entry", async () => {
  clearPrefetchCache();
  stubFetch({ ok: 1 });
  prefetch("/dash");
  const first = consumePrefetched("/dash");
  assert.ok(first);
  await first;
  assert.strictEqual(getPrefetched("/dash"), undefined);
});

test("prefetch returns undefined when no fetch is available", () => {
  clearPrefetchCache();
  delete (globalThis as AnyGlobal).fetch;
  assert.strictEqual(prefetch("/x"), undefined);
});
