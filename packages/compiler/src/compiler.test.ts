import test from "node:test";
import assert from "node:assert";
import { compile } from "./index.js";

const sampleSFC = `
<Server>
  export const load = () => ({ title: "Home" });
</Server>
<Client>
  const msg = "Hello client";
</Client>
<View>
  <div class="container">Content</div>
</View>
<Style>
  .container { color: blue; }
  h1 { font-size: 2em; }
</Style>
`;

test("Compiler compiles SFC completely", () => {
  const result = compile(sampleSFC, "view/index.kal");

  // Server block check
  assert.ok(result.code.includes("=== Server Block ==="));
  assert.ok(result.code.includes("export const load"));

  // Client block check
  assert.ok(result.code.includes("=== Client Block ==="));
  assert.ok(result.code.includes('msg = "Hello client"'));

  // Template block check
  assert.ok(result.code.includes("export function render("));
  assert.ok(result.code.includes("data-kal-"));

  // Style scoping check
  assert.ok(result.css !== undefined);
  assert.ok(result.css.includes("[data-kal-"));
  assert.ok(result.css.includes(".container[data-kal-"));
  assert.ok(result.css.includes("h1[data-kal-"));
});

test("Compiler compiles server block keywords", () => {
  const serverSFC = `
  <Server>
    $page(async ({ query }) => { return { foo: "bar" }; });
    $meta(() => ({ title: "Foo" }));
    $guard(async () => true);
    $layout("main");
  </Server>
  `;
  const result = compile(serverSFC, "view/server.kal");
  assert.ok(result.code.includes("export const $serverPage = (async"));
  assert.ok(result.code.includes("export const $serverMeta = (() =>"));
  assert.ok(result.code.includes("export const $serverGuard = (async"));
  assert.ok(result.code.includes('export const $serverLayout = ("main")'));
  assert.ok(result.code.includes("const $abort ="));
});

test("Compiler compiles client block setup and returns", () => {
  const clientSFC = `
  <Client>
    import { cartStore } from "@/stores/cart";
    const cart = $use(cartStore);
    let count = $local(0);
    var visible = true;
    function increment() { count.set(count.get() + 1); }
  </Client>
  `;
  const result = compile(clientSFC, "view/client.kal");
  // Top-level imports
  assert.ok(
    result.code.startsWith('import { cartStore } from "@/stores/cart";'),
  );
  // setup function structure
  assert.ok(result.code.includes("export function setup(props = {}) {"));
  assert.ok(
    result.code.includes(
      "return { ...props, cart, count, visible, increment };",
    ),
  );
});

test("Compiler compiles template features, directives, and slots", () => {
  const viewSFC = `
  <View>
    <div class="box" :class="dynamicClass">
      <h1 @click="increment">{{ title }}</h1>
      <input type="text" :bind="username" />
      <Each of="products" as="prod" key="prod.id">
        <span>{{ prod.name }}</span>
      </Each>
      <When condition="showBanner">
        <div class="banner">Welcome</div>
      </When>
      <Else>
        <div class="banner">Goodbye</div>
      </Else>
      <Slot name="footer" />
    </div>
  </View>
  `;
  const result = compile(viewSFC, "view/view.kal");

  // State deconstruction check
  assert.ok(
    result.code.includes(
      "const { dynamicClass, increment, title, username, products, showBanner } = state.__raw__ || state;",
    ),
  );

  // Event handlers & Bindings: handlers are compiled to a registry (CSP-safe),
  // and elements reference them by "<componentId>::<index>".
  assert.ok(/data-kal-event-click="[^":]+::0"/.test(result.code));
  assert.ok(result.code.includes('data-kal-bind="username"'));
  assert.ok(/data-kal-event-input="[^":]+::\d+"/.test(result.code));
  assert.ok(result.code.includes("export const handlers = ["));
  assert.ok(result.code.includes("globalThis.__kal_handlers__"));
  // No runtime eval/with in generated output.
  assert.ok(!result.code.includes("new Function"));
  // The bind handler writes back to component state through the proxy.
  assert.ok(result.code.includes("$state.username = username"));

  // Class merging (escaped output for security)
  assert.ok(
    result.code.includes('class="box ${_escapeAttr(_formatClass(dynamicClass))}"'),
  );

  // Text interpolation is HTML-escaped, not raw
  assert.ok(result.code.includes("${_escape(title)}"));
  assert.ok(!result.code.includes("${_unwrapSignal(title)}"));

  // Loops and Conditionals
  assert.ok(result.code.includes("(products || []).map((prod) =>"));
  // Keyed lists emit data-kal-key for reconciliation
  assert.ok(result.code.includes('data-kal-key="${_escapeAttr(prod.id)}"'));
  assert.ok(result.code.includes("showBanner ?"));
  assert.ok(result.code.includes("!(showBanner) ?"));

  // Slots
  assert.ok(result.code.includes("slots.footer ? slots.footer() :"));
});

test("Compiler compiles <Show when> with following <Else>", () => {
  const viewSFC = `
  <View>
    <div>
      <Show when="user">
        <p>{{ user.name }}</p>
      </Show>
      <Else>
        <a href="/login">Sign in</a>
      </Else>
    </div>
  </View>
  `;
  const result = compile(viewSFC, "view/show.kal");

  assert.ok(result.code.includes("user ?"));
  assert.ok(result.code.includes("!(user) ?"));
  assert.ok(result.code.includes("${_escape(user.name)}"));
  // <Show>/<Else> are control-flow tags, never rendered as components
  assert.ok(!result.code.includes("_renderComponent(Show"));
  assert.ok(
    result.code.includes(
      "const { user } = state.__raw__ || state;",
    ),
  );
});

test("Compiler compiles $model two-way binding by input type", () => {
  const viewSFC = `
  <View>
    <form>
      <input type="text" $model="email" />
      <input type="checkbox" $model="agreed" />
      <input type="radio" value="pro" $model="plan" />
      <select $model="quantity"></select>
      <textarea $model="bio"></textarea>
    </form>
  </View>
  `;
  const result = compile(viewSFC, "view/model.kal");

  // text input: value bound + input event
  assert.ok(result.code.includes('data-kal-bind="email"'));
  assert.ok(result.code.includes('value="${_escapeAttr(email)}"'));
  assert.ok(/data-kal-event-input="[^":]+::\d+"/.test(result.code));

  // checkbox: checked reflection + change event
  assert.ok(result.code.includes('data-kal-bind="agreed"'));
  assert.ok(result.code.includes('${_unwrapSignal(agreed) ? "checked" : ""}'));

  // radio: checked when model matches own value
  assert.ok(
    result.code.includes('${_unwrapSignal(plan) === "pro" ? "checked" : ""}'),
  );

  // select: change event
  assert.ok(result.code.includes('data-kal-bind="quantity"'));
  assert.ok(/data-kal-event-change="[^":]+::\d+"/.test(result.code));

  // all bound identifiers are deconstructed from state
  assert.ok(result.code.includes("email"));
  assert.ok(result.code.includes("agreed"));

  // write-back through proxy
  assert.ok(result.code.includes("$state.email = email"));
  assert.ok(result.code.includes("$state.agreed = agreed"));
});

test("Compiler emits fine-grained bindings for non-structural templates", () => {
  const viewSFC = `
  <View>
    <div :title="tip">
      <h1>{{ heading }}</h1>
      <input type="text" :bind="name" />
    </div>
  </View>
  `;
  const result = compile(viewSFC, "view/leaf.kal");

  // Eligible template → per-binding registry + DOM markers.
  assert.ok(result.code.includes("export const fineGrained = true"));
  assert.ok(result.code.includes("export const bindings = ["));
  assert.ok(result.code.includes("globalThis.__kal_bindings__"));
  assert.ok(/data-kal-txt="[^":]+::\d+"/.test(result.code));
  assert.ok(/data-kal-attr-title="[^":]+::\d+"/.test(result.code));
  assert.ok(/data-kal-value="[^":]+::\d+"/.test(result.code));
});

test("Compiler keeps structural templates on the coarse path", () => {
  const viewSFC = `
  <View>
    <div>
      <Each of="items" as="item">
        <span>{{ item }}</span>
      </Each>
    </div>
  </View>
  `;
  const result = compile(viewSFC, "view/loop.kal");

  // Structural construct → coarse whole-component re-render, no fine-grained markers.
  assert.ok(result.code.includes("export const fineGrained = false"));
  assert.ok(!result.code.includes("data-kal-txt="));
});

function loadRender(code: string) {
  const stripped = code
    .replace(/export function render/, "function render")
    .replace(/export const /g, "const ");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(stripped + "\nreturn render;")();
}

test("Compiler compiles <Image> to a responsive lazy <img>", () => {
  const viewSFC = `
  <View>
    <Image src="/hero.png" :width="1200" :height="630" alt="Hero" sizes="50vw" />
  </View>
  `;
  const result = compile(viewSFC, "view/img.kal");
  assert.ok(result.code.includes("_image({"));
  assert.ok(result.code.includes('"src": "/hero.png"'));
  assert.ok(result.code.includes('"width": 1200'));

  const render = loadRender(result.code);
  const html = render({});
  assert.match(html, /<img /);
  assert.match(html, /src="\/hero\.png"/);
  assert.match(html, /alt="Hero"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /width="1200"/);
  assert.match(html, /height="630"/);
  assert.match(html, /sizes="50vw"/);
  // srcset has width descriptors with ?w= query (CDN/optimizer convention)
  assert.match(html, /srcset="[^"]*\/hero\.png\?w=320 320w[^"]*1536w"/);
});

test("Compiler <Image> priority emits eager + fetchpriority", () => {
  const result = compile(
    `<View><Image src="/a.png" :priority="true" /></View>`,
    "view/img2.kal",
  );
  const html = loadRender(result.code)({});
  assert.match(html, /loading="eager"/);
  assert.match(html, /fetchpriority="high"/);
});

test("Compiler compiles <Suspense> with fallback (renders content, falls back on throw)", () => {
  const viewSFC = `
  <View>
    <Suspense>
      <template #fallback><span>Loading…</span></template>
      <p>{{ data.value }}</p>
    </Suspense>
  </View>
  `;
  const result = compile(viewSFC, "view/suspense.kal");
  assert.ok(result.code.includes("_suspense(function(){"));
  // not treated as a component
  assert.ok(!result.code.includes("_renderComponent(Suspense"));

  const render = loadRender(result.code);
  // content renders when data is present
  assert.match(render({ data: { value: "ok" } }), /<p[^>]*>ok<\/p>/);
  // content throws (data undefined) -> fallback shown
  assert.match(render({}), /Loading/);
});

test("Compiler compiles <Boundary> error slot that receives the thrown error", () => {
  const viewSFC = `
  <View>
    <Boundary>
      <template #error="e"><div class="err">{{ e.message }}</div></template>
      <p>{{ blowUp() }}</p>
    </Boundary>
  </View>
  `;
  const result = compile(viewSFC, "view/boundary.kal");
  assert.ok(result.code.includes("_boundary(function(){"));
  assert.ok(result.code.includes("function(e){"));

  const render = loadRender(result.code);
  const html = render({
    blowUp: () => {
      throw new Error("kaboom");
    },
  });
  assert.match(html, /class="err"/);
  assert.match(html, /kaboom/);

  // happy path renders content
  const ok = render({ blowUp: () => "fine" });
  assert.match(ok, /<p[^>]*>fine<\/p>/);
});

test("Compiler transforms $static into an exported $serverStatic config", () => {
  const sfc = `
  <Server>
    $static({ revalidate: 3600 });
    $page(async () => ({ posts: [] }));
  </Server>
  <View><div>posts</div></View>
  `;
  const result = compile(sfc, "page.kal");
  assert.ok(result.code.includes("export const $serverStatic = ({ revalidate: 3600 })"));
  assert.ok(result.code.includes("export const $serverPage = (async () => ({ posts: [] }))"));
});

test("Compiler emits hydrateStrategy from <Client hydrate>", () => {
  const sfc = `
  <Client hydrate="visible">
    const x = 1;
  </Client>
  <View><div>{{ x }}</div></View>
  `;
  const result = compile(sfc, "page.kal");
  assert.ok(result.code.includes('export const hydrateStrategy = "visible"'));
});

test("Compiler omits hydrateStrategy when <Client> has no hydrate attr", () => {
  const result = compile(
    `<Client>const x = 1;</Client><View><div>{{ x }}</div></View>`,
    "page.kal",
  );
  assert.ok(!result.code.includes("hydrateStrategy"));
});

test("Compiler rejects an invalid hydrate strategy", () => {
  assert.throws(
    () =>
      compile(
        `<Client hydrate="sometimes">const x=1;</Client><View><div/></View>`,
        "page.kal",
      ),
    /Invalid <Client hydrate/,
  );
});
