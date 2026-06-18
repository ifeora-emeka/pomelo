import test from "node:test";
import assert from "node:assert";
import type { FrameworkConfig, KalloPlugin } from "@kallojs/types";
import {
  defineConfig,
  definePlugin,
  applyConfigHooks,
  applyTransform,
  applyServerHooks,
} from "./plugins.js";

function baseConfig(plugins: KalloPlugin[] = []): FrameworkConfig {
  return { name: "test", version: "0.0.0", port: 3000, plugins };
}

test("defineConfig / definePlugin are identity helpers", () => {
  const cfg = baseConfig();
  assert.strictEqual(defineConfig(cfg), cfg);
  const p = definePlugin({ name: "x" });
  assert.strictEqual(p.name, "x");
});

test("applyConfigHooks threads mutated config through plugins in order", () => {
  const order: string[] = [];
  const plugins: KalloPlugin[] = [
    {
      name: "a",
      config(c) {
        order.push("a");
        return { ...c, port: 4000 };
      },
    },
    {
      name: "b",
      config(c) {
        order.push("b");
        assert.strictEqual(c.port, 4000);
        return { ...c, name: "renamed" };
      },
    },
  ];
  const result = applyConfigHooks(baseConfig(plugins));
  assert.deepStrictEqual(order, ["a", "b"]);
  assert.strictEqual(result.port, 4000);
  assert.strictEqual(result.name, "renamed");
});

test("applyTransform chains string and {code} returns; void is a no-op", () => {
  const plugins: KalloPlugin[] = [
    { name: "upper", transform: (code) => code.toUpperCase() },
    { name: "wrap", transform: (code) => ({ code: `/*x*/${code}` }) },
    { name: "noop", transform: () => undefined },
  ];
  const out = applyTransform(plugins, "hello", "file.kal");
  assert.strictEqual(out, "/*x*/HELLO");
});

test("applyServerHooks invokes configureServer and isolates failures", () => {
  const calls: string[] = [];
  const fakeApp = {} as unknown;
  const plugins: KalloPlugin[] = [
    {
      name: "throws",
      configureServer() {
        throw new Error("boom");
      },
    },
    {
      name: "ok",
      configureServer(app) {
        assert.strictEqual(app, fakeApp);
        calls.push("ok");
      },
    },
  ];
  applyServerHooks(fakeApp as never, plugins);
  assert.deepStrictEqual(calls, ["ok"]);
});
