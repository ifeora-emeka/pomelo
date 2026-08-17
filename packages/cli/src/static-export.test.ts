process.env.KALLO_ENV = "test";
process.env.KALLO_TEST = "true";

import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveConfig, loadConfig } from "./config.js";
import { lintKalForStatic } from "./static-lint.js";

test("resolveConfig applies static defaults", () => {
  const cfg = resolveConfig({ name: "x", version: "1", port: 3000, output: "static" });
  assert.strictEqual(cfg.output, "static");
  assert.strictEqual(cfg.outDir, "out");
  assert.strictEqual(cfg.trailingSlash, false);
  assert.strictEqual(cfg.basePath, "");
  assert.strictEqual(cfg.assetPrefix, "");
  assert.strictEqual(cfg.images.unoptimized, true); // defaults true in static mode
  assert.strictEqual(cfg.export.failOnServerFeature, true);
  assert.strictEqual(cfg.export.fallback, "spa");
});

test("resolveConfig defaults output to server", () => {
  const cfg = resolveConfig({ name: "x", version: "1", port: 3000 });
  assert.strictEqual(cfg.output, "server");
  assert.strictEqual(cfg.images.unoptimized, false);
});

test("resolveConfig normalizes basePath and derives assetPrefix", () => {
  assert.strictEqual(resolveConfig({ basePath: "repo/" } as any).basePath, "/repo");
  assert.strictEqual(resolveConfig({ basePath: "/repo/" } as any).basePath, "/repo");
  assert.strictEqual(resolveConfig({ basePath: "/" } as any).basePath, "");
  // assetPrefix defaults to basePath
  assert.strictEqual(resolveConfig({ basePath: "/repo" } as any).assetPrefix, "/repo");
  // absolute CDN origin preserved
  assert.strictEqual(
    resolveConfig({ assetPrefix: "https://cdn.example.com/" } as any).assetPrefix,
    "https://cdn.example.com",
  );
});

test("loadConfig returns defaults when no config file present", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kallo-cfg-"));
  try {
    const cfg = await loadConfig(dir);
    assert.strictEqual(cfg.output, "server");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig transpiles a .ts config and cleans up temp file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kallo-cfg-"));
  try {
    fs.writeFileSync(
      path.join(dir, "kallo.config.ts"),
      `const config = { name: "t", version: "1", port: 3000, output: "static" as const, basePath: "/repo" };\nexport default config;`,
    );
    const cfg = await loadConfig(dir);
    assert.strictEqual(cfg.output, "static");
    assert.strictEqual(cfg.basePath, "/repo");
    // No leftover transpiled temp file.
    const leftovers = fs.readdirSync(dir).filter((f) => f.startsWith(".kallo.config."));
    assert.deepStrictEqual(leftovers, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig strict mode throws on a broken config", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kallo-cfg-"));
  try {
    fs.writeFileSync(path.join(dir, "kallo.config.js"), `export default {{{ not valid`);
    await assert.rejects(() => loadConfig(dir, true));
    // Non-strict falls back to defaults.
    const cfg = await loadConfig(dir, false);
    assert.strictEqual(cfg.output, "server");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("lintKalForStatic flags server-only $guard as error", () => {
  const issues = lintKalForStatic(
    "page.kal",
    `<Server>\n$guard(() => true);\n$page(() => ({}));\n</Server>\n<View><h1>x</h1></View>`,
  );
  const guard = issues.find((i) => i.code === "guard");
  assert.ok(guard);
  assert.strictEqual(guard!.severity, "error");
});

test("lintKalForStatic flags $revalidate as warn, not error", () => {
  const issues = lintKalForStatic(
    "page.kal",
    `<Server>\n$revalidate("tag");\n</Server>\n<View><h1>x</h1></View>`,
  );
  const rev = issues.find((i) => i.code === "revalidate");
  assert.ok(rev);
  assert.strictEqual(rev!.severity, "warn");
});

test("lintKalForStatic ignores files with no server block", () => {
  const issues = lintKalForStatic("comp.kal", `<View><h1>hi</h1></View>`);
  assert.deepStrictEqual(issues, []);
});
