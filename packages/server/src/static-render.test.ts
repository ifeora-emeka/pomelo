import test from "node:test";
import assert from "node:assert";
import { StaticRenderStore } from "./static-render.js";

test("first render is a MISS and is then served as HIT while fresh", async () => {
  let clock = 1000;
  const store = new StaticRenderStore(() => clock);
  let renders = 0;
  const producer = () => {
    renders++;
    return `<html>${renders}</html>`;
  };

  const a = await store.render("/", producer, { revalidate: 10 });
  assert.deepStrictEqual(a, { html: "<html>1</html>", status: "MISS" });

  clock += 5000; // still within 10s TTL
  const b = await store.render("/", producer, { revalidate: 10 });
  assert.deepStrictEqual(b, { html: "<html>1</html>", status: "HIT" });
  assert.strictEqual(renders, 1);
});

test("stale entry is served immediately, then refreshed in background", async () => {
  let clock = 0;
  const store = new StaticRenderStore(() => clock);
  let renders = 0;
  const producer = async () => {
    renders++;
    return `v${renders}`;
  };

  await store.render("/p", producer, { revalidate: 10 });
  clock += 11000; // expire

  const stale = await store.render("/p", producer, { revalidate: 10 });
  assert.strictEqual(stale.status, "STALE");
  assert.strictEqual(stale.html, "v1");

  await store.whenIdle("/p"); // let background revalidation finish
  assert.strictEqual(store.peek("/p"), "v2");
  assert.strictEqual(renders, 2);
});

test("revalidate undefined renders once and serves forever", async () => {
  let clock = 0;
  const store = new StaticRenderStore(() => clock);
  let renders = 0;
  const producer = () => `${++renders}`;

  await store.render("/static", producer, {});
  clock += 1e12;
  const hit = await store.render("/static", producer, {});
  assert.strictEqual(hit.status, "HIT");
  assert.strictEqual(renders, 1);
});

test("concurrent misses coalesce into a single producer call", async () => {
  const store = new StaticRenderStore();
  let renders = 0;
  const producer = async () => {
    renders++;
    await new Promise((r) => setTimeout(r, 5));
    return "x";
  };
  const [a, b] = await Promise.all([
    store.render("/c", producer, { revalidate: 10 }),
    store.render("/c", producer, { revalidate: 10 }),
  ]);
  assert.strictEqual(a.html, "x");
  assert.strictEqual(b.html, "x");
  assert.strictEqual(renders, 1);
});

test("getFresh / set back the blocking-ISR SSR path", () => {
  let clock = 0;
  const store = new StaticRenderStore(() => clock);
  assert.strictEqual(store.getFresh("/r"), undefined);

  store.set("/r", "<page/>", { revalidate: 30 });
  assert.strictEqual(store.getFresh("/r"), "<page/>");

  clock += 31000;
  assert.strictEqual(store.getFresh("/r"), undefined); // expired
});
