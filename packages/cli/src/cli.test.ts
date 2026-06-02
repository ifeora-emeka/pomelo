process.env.POMELO_ENV = "test";
process.env.POMELO_TEST = "true";

import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { handleCLI } from "./index.js";

test("CLI dispatcher executes registered commands", () => {
  const devSuccess = handleCLI({ command: "dev", args: ["--port", "3000"] });
  assert.ok(devSuccess);

  const buildSuccess = handleCLI({ command: "build", args: ["--minify"] });
  assert.ok(buildSuccess);

  const startSuccess = handleCLI({ command: "start", args: ["--port", "4000"] });
  assert.ok(startSuccess);

  const unknownSuccess = handleCLI({ command: "unknown-cmd", args: [] });
  assert.strictEqual(unknownSuccess, false);
});

test("CLI create command scaffolds new app structure", () => {
  const testAppName = "test-cli-scaffolded-app";
  const testAppPath = path.resolve(process.cwd(), testAppName);

  // Clean up if previous tests left state
  if (fs.existsSync(testAppPath)) {
    fs.rmSync(testAppPath, { recursive: true, force: true });
  }

  const createSuccess = handleCLI({ command: "create", args: [testAppName] });
  assert.ok(createSuccess);
  assert.ok(fs.existsSync(testAppPath));
  assert.ok(fs.existsSync(path.join(testAppPath, "package.json")));
  assert.ok(fs.existsSync(path.join(testAppPath, "src/pages/index.pom")));

  // Clean up
  fs.rmSync(testAppPath, { recursive: true, force: true });
});

test("CLI create command scaffolds ecommerce template structure", () => {
  const testAppName = "test-cli-ecommerce-app";
  const testAppPath = path.resolve(process.cwd(), testAppName);

  if (fs.existsSync(testAppPath)) {
    fs.rmSync(testAppPath, { recursive: true, force: true });
  }

  const createSuccess = handleCLI({
    command: "create",
    args: [testAppName, "--template", "ecommerce"],
  });
  assert.ok(createSuccess);
  assert.ok(fs.existsSync(path.join(testAppPath, "src/stores/cart.ts")));
  assert.ok(fs.existsSync(path.join(testAppPath, "src/pages/api/products.pom")));
  assert.ok(fs.existsSync(path.join(testAppPath, "src/pages/index.pom")));

  fs.rmSync(testAppPath, { recursive: true, force: true });
});

test("CLI generate command scaffolds pages, components, api, and stores", () => {
  const tempDir = path.resolve(process.cwd(), "temp-gen-project");
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir);

  const originalCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const pageSuccess = handleCLI({ command: "generate", args: ["page", "profile"] });
    assert.ok(pageSuccess);
    assert.ok(fs.existsSync(path.join(tempDir, "src/pages/profile.pom")));

    const componentSuccess = handleCLI({ command: "g", args: ["component", "Button"] });
    assert.ok(componentSuccess);
    assert.ok(fs.existsSync(path.join(tempDir, "src/components/Button.pom")));

    const apiSuccess = handleCLI({ command: "generate", args: ["api", "users"] });
    assert.ok(apiSuccess);
    assert.ok(fs.existsSync(path.join(tempDir, "src/pages/api/users.pom")));

    const storeSuccess = handleCLI({ command: "generate", args: ["store", "cart"] });
    assert.ok(storeSuccess);
    assert.ok(fs.existsSync(path.join(tempDir, "src/stores/cart.ts")));
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
