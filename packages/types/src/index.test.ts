import test from "node:test";
import assert from "node:assert";
import type { FrameworkConfig } from "./index.js";

test("FrameworkConfig Types structure compatibility", () => {
  const config: FrameworkConfig = {
    name: "Pomelo Test",
    version: "0.1.0",
    port: 8080,
    env: "test",
  };

  assert.strictEqual(config.name, "Pomelo Test");
  assert.strictEqual(config.version, "0.1.0");
  assert.strictEqual(config.port, 8080);
  assert.strictEqual(config.env, "test");
});
