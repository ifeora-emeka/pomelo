import test from "node:test";
import assert from "node:assert";
import { pomeloVitePlugin } from "./index.js";

const sampleSFC = `
<View>
  <p>Hello Vite!</p>
</View>
`;

test("Vite plugin registers and transforms .pom files", () => {
  const plugin = pomeloVitePlugin();
  assert.strictEqual(plugin.name, "vite-plugin-pomelo");

  // Non-pom file check
  const nonPomResult = plugin.transform("const x = 1;", "src/main.ts");
  assert.strictEqual(nonPomResult, null);

  // Pom file check
  const pomResult = plugin.transform(sampleSFC, "src/components/Test.pom");
  assert.ok(pomResult !== null);
  assert.ok(pomResult.code.includes("export function render()"));
  assert.ok(pomResult.code.includes("data-pom-"));
});
