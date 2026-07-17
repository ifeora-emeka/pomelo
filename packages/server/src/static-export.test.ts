import test from "node:test";
import assert from "node:assert";
import {
  applyAssetPrefix,
  staticBootstrapScript,
  buildUrlFromPattern,
} from "./static-export.js";

test("applyAssetPrefix prefixes framework asset URLs", () => {
  const input = `import x from "/@kallojs/runtime/client.js";\n<link href="/favicon.ico">`;
  const out = applyAssetPrefix(input, "/repo");
  assert.ok(out.includes(`"/repo/@kallojs/runtime/client.js"`));
  assert.ok(out.includes(`"/repo/favicon.ico"`));
});

test("applyAssetPrefix is a no-op with empty prefix", () => {
  const input = `import x from "/@kallojs/runtime/client.js";`;
  assert.strictEqual(applyAssetPrefix(input, ""), input);
});

test("applyAssetPrefix handles dynamic import parens", () => {
  const out = applyAssetPrefix(`import("/@kallojs/view/page.kal.js")`, "/repo");
  assert.ok(out.includes(`import("/repo/@kallojs/view/page.kal.js")`));
});

test("staticBootstrapScript embeds the static flag and base path", () => {
  const s = staticBootstrapScript("/repo");
  assert.ok(s.includes("window.__KALLO_STATIC__=true"));
  assert.ok(s.includes(`window.__KALLO_BASE_PATH__="/repo"`));
});

test("buildUrlFromPattern substitutes a dynamic param", () => {
  assert.strictEqual(
    buildUrlFromPattern("/products/:id", { id: "aura" }),
    "/products/aura",
  );
});

test("buildUrlFromPattern encodes segment values", () => {
  assert.strictEqual(
    buildUrlFromPattern("/tag/:name", { name: "a b" }),
    "/tag/a%20b",
  );
});

test("buildUrlFromPattern expands catch-all from a string", () => {
  assert.strictEqual(
    buildUrlFromPattern("/docs/*path", { path: "a/b/c" }),
    "/docs/a/b/c",
  );
});

test("buildUrlFromPattern expands catch-all from an array and drops empties", () => {
  assert.strictEqual(
    buildUrlFromPattern("/docs/*path", { path: ["a", "", "b"] }),
    "/docs/a/b",
  );
});

test("buildUrlFromPattern leaves static routes untouched", () => {
  assert.strictEqual(buildUrlFromPattern("/about", {}), "/about");
});
