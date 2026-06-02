import test from "node:test";
import assert from "node:assert";
import { $local, $watch, renderToString, mountElement } from "./index.js";

test("Reactivity signals collect deps and trigger subscribers", () => {
  const count = $local(10);
  let watchedValue = 0;

  $watch(count, (val) => {
    watchedValue = val;
  });

  assert.strictEqual(count.get(), 10);
  assert.strictEqual(watchedValue, 10); // Triggered initially on watch setup

  count.set(25);
  assert.strictEqual(count.get(), 25);
  assert.strictEqual(watchedValue, 25);
});

test("renderToString returns result of render function", () => {
  const html = renderToString(() => "<div>Content</div>");
  assert.strictEqual(html, "<div>Content</div>");
});

test("mountElement updates target innerHTML", () => {
  const mockElement = { innerHTML: "" };
  mountElement(mockElement, "<h1>Mounted</h1>");
  assert.strictEqual(mockElement.innerHTML, "<h1>Mounted</h1>");
});
