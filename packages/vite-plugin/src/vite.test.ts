import test from "node:test";
import assert from "node:assert";
import {
  kalloVitePlugin,
  handleSFCCompilation,
  generateClientModule,
} from "./index.js";

const sampleSFC = `
<View>
  <p>Hello Vite!</p>
</View>
`;

const fullSFC = `
<Server>
  $page(async ({ query }) => { return { title: "Home" }; });
</Server>
<Client>
  const count = $local(0);
  function increment() { count.set(count.get() + 1); }
</Client>
<View>
  <div class="container">
    <h1 @click="increment">{{ title }}</h1>
    <p>Count: {{ count }}</p>
  </div>
</View>
<Style>
  .container { padding: 16px; }
</Style>
`;

test("Vite plugin registers and transforms .kal files", () => {
  const plugin = kalloVitePlugin();
  assert.strictEqual(plugin.name, "vite-plugin-kallo");

  const nonPomResult = plugin.transform("const x = 1;", "src/main.ts");
  assert.strictEqual(nonPomResult, null);

  const pomResult = plugin.transform(sampleSFC, "src/components/Test.kal");
  assert.ok(pomResult !== null);
  assert.ok(pomResult.code.includes("export function render("));
  assert.ok(pomResult.code.includes("data-kal-"));
});

test("Vite plugin generates componentId and css exports for build", () => {
  const plugin = kalloVitePlugin();
  const result = plugin.transform(fullSFC, "src/view/index.kal");
  assert.ok(result);
  assert.ok(result.code.includes("export const componentId"));
  assert.ok(result.code.includes("export const css"));
});

test("Vite plugin outputs HMR code in serve mode", () => {
  const plugin = kalloVitePlugin();
  plugin.configResolved({ command: "serve" } as any);

  const result = plugin.transform(fullSFC, "src/view/index.kal");
  assert.ok(result);
  assert.ok(result.code.includes("import.meta.hot"));
  assert.ok(result.code.includes("import.meta.hot.accept"));
  assert.ok(result.code.includes("hydrate"));
  assert.ok(result.code.includes("destroyInstance"));
  assert.ok(result.code.includes("injectStyle"));
  assert.ok(result.code.includes("__kal_setup_hash__"));
  assert.ok(result.code.includes("setupUnchanged"));
  assert.ok(result.code.includes("hotUpdate"));
});

test("Vite plugin injects error overlay on compilation failure", () => {
  const plugin = kalloVitePlugin();
  plugin.configResolved({ command: "serve" } as any);

  const badSFC = `
<View>
  <div>
</View>
`;

  const result = plugin.transform(badSFC, "src/bad.kal");
  assert.ok(result);
  assert.ok(result.code.includes("kallo-error-overlay"));
  assert.ok(result.code.includes("Kallo Compilation Error"));
});

test("handleSFCCompilation returns null for non-.kal files", () => {
  const result = handleSFCCompilation("const x = 1;", "main.ts");
  assert.strictEqual(result, null);
});

test("handleSFCCompilation compiles .kal file with all blocks", () => {
  const result = handleSFCCompilation(fullSFC, "view/index.kal");
  assert.ok(result);
  assert.ok(result.code.includes("export function render("));
  assert.ok(result.code.includes("export function setup("));
  assert.ok(result.code.includes("export const $serverPage"));
  assert.ok(result.css);
  assert.ok(result.css.includes("[data-kal-"));
});

test("generateClientModule produces self-accepting HMR module", () => {
  const code = 'export function render() { return "<div>hi</div>"; }';
  const css = ".box { color: red; }";
  const output = generateClientModule(code, css, "abc123", "test.kal");

  assert.ok(
    output.includes(
      "import { hydrate, injectStyle, removeStyle, destroyInstance }",
    ),
  );
  assert.ok(output.includes("__kal_css__"));
  assert.ok(output.includes("import.meta.hot.accept"));
  assert.ok(output.includes("__kal_setup_hash__"));
  assert.ok(output.includes("setupUnchanged"));
  assert.ok(output.includes("hotUpdate"));
  assert.ok(output.includes('injectStyle(__kal_css__, "abc123")'));
});

test("generateClientModule works without CSS", () => {
  const code = 'export function render() { return "<div>hi</div>"; }';
  const output = generateClientModule(code, undefined, "abc123", "test.kal");

  assert.ok(!output.includes("__kal_css__"));
  assert.ok(output.includes("export const css = undefined"));
  assert.ok(output.includes("import.meta.hot.accept"));
});

test("generateClientModule HMR uses hotUpdate for template-only changes", () => {
  const code =
    'export function setup() { return {}; }\n// === Template Block ===\nexport function render() { return "<div>hi</div>"; }';
  const output = generateClientModule(code, undefined, "abc123", "test.kal");

  assert.ok(output.includes("setupUnchanged && prevInst.hotUpdate"));
  assert.ok(output.includes("prevInst.hotUpdate(newModule.render)"));
  assert.ok(output.includes("export const __kal_setup_hash__"));
});

test("Vite plugin handleHotUpdate returns modules for .kal files", () => {
  const plugin = kalloVitePlugin();
  const mockModule = { file: "src/view/index.kal" };

  const result = plugin.handleHotUpdate({
    file: "src/view/index.kal",
    modules: [mockModule],
  });

  assert.ok(result);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0], mockModule);
});

test("Vite plugin handleHotUpdate ignores non-.kal files", () => {
  const plugin = kalloVitePlugin();

  const result = plugin.handleHotUpdate({
    file: "src/main.ts",
    modules: [{ file: "src/main.ts" }],
  });

  assert.strictEqual(result, undefined);
});

test("Vite plugin resolveId handles CSS virtual modules", () => {
  const plugin = kalloVitePlugin();

  const resolved = plugin.resolveId("kallo-css:test.kal");
  assert.ok(resolved);
  assert.ok(resolved.startsWith("\0kallo-css:"));

  const nonVirtual = plugin.resolveId("./main.ts");
  assert.strictEqual(nonVirtual, null);
});
