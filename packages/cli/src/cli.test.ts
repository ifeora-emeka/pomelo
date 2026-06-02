import test from "node:test";
import assert from "node:assert";
import { handleCLI } from "./index.js";

test("CLI dispatcher executes registered commands", () => {
  const devSuccess = handleCLI({ command: "dev", args: ["--port", "3000"] });
  assert.ok(devSuccess);

  const buildSuccess = handleCLI({ command: "build", args: ["--minify"] });
  assert.ok(buildSuccess);

  const unknownSuccess = handleCLI({ command: "unknown-cmd", args: [] });
  assert.strictEqual(unknownSuccess, false);
});
