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

test("Compiler rewrites $staticParams to $serverStaticParams export", () => {
  const sfc = `
  <Server>
    $staticParams(() => [{ id: "a" }, { id: "b" }]);
    $page(() => ({}));
  </Server>
  `;
  const result = compile(sfc, "view/products/[id]/page.kal");
  assert.ok(result.code.includes("export const $serverStaticParams = (() =>"));
});

test("Compiler treats $paths as an alias of $staticParams", () => {
  const sfc = `
  <Server>
    $paths(() => [{ slug: "x" }]);
  </Server>
  `;
  const result = compile(sfc, "view/blog/[slug]/page.kal");
  assert.ok(result.code.includes("export const $serverStaticParams = (() =>"));
});

test("Compiler avoids duplicate $serverStaticParams export when both aliases used", () => {
  const sfc = `
  <Server>
    $staticParams(() => [{ id: "a" }]);
    $paths(() => [{ id: "b" }]);
  </Server>
  `;
  const result = compile(sfc, "view/x/[id]/page.kal");
  const count = (result.code.match(/export const \$serverStaticParams/g) || []).length;
  assert.strictEqual(count, 1);
  // The second alias becomes a discarded local, not a duplicate export.
  assert.ok(result.code.includes("$unusedStaticParams"));
});

test("Compiler does not confuse $static with $staticParams", () => {
  const sfc = `
  <Server>
    $static({ revalidate: 60 });
    $staticParams(() => [{ id: "a" }]);
  </Server>
  `;
  const result = compile(sfc, "view/x/[id]/page.kal");
  assert.ok(result.code.includes("export const $serverStatic = ({ revalidate: 60 })"));
  assert.ok(result.code.includes("export const $serverStaticParams = (() =>"));
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
  assert.ok(result.code.includes("_unwrapSignal(showBanner) ?"));
  assert.ok(result.code.includes("!_unwrapSignal(showBanner) ?"));

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

  assert.ok(result.code.includes("_unwrapSignal(user) ?"));
  assert.ok(result.code.includes("!_unwrapSignal(user) ?"));
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

test("Compiler registers child component function props for delegated handlers", () => {
  const result = compile(
    `<View><Card :onAction="handleAction" :label="title" /></View>`,
    "page.kal",
  );
  // _renderComponent must record the instance's function props so a delegated
  // handler inside the child can resolve them at click time (client-only).
  assert.ok(result.code.includes("__kal_instance_props__"));
  assert.ok(result.code.includes('typeof window !== "undefined"'));
});

test("Compiler emits unescaped output for triple-mustache, escaped for double", () => {
  const result = compile(
    `<View><div>{{{ rawHtml }}}</div><span>{{ text }}</span></View>`,
    "page.kal",
  );
  // Triple mustache -> raw (no _escape), double -> _escape.
  assert.ok(result.code.includes("_unwrapSignal(rawHtml)"));
  assert.ok(!result.code.includes("_escape(rawHtml)"));
  assert.ok(result.code.includes("_escape(text)"));
});

test("Compiler does not destructure tokens from :class string literals (no reserved words)", () => {
  const result = compile(
    `<View><div :class="open ? 'fixed lg:static block hidden' : 'p-0'">x</div></View>`,
    "page.kal",
  );
  const decl = /const \{([^}]*)\} = state\.__raw__/.exec(result.code);
  const names = (decl?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // The dynamic identifier is kept; class-string tokens and reserved words are not.
  assert.ok(names.includes("open"));
  for (const bad of ["static", "fixed", "block", "hidden", "lg", "p"]) {
    assert.ok(!names.includes(bad), `should not destructure "${bad}"`);
  }
});

test("Event handlers alias `event` to the real DOM event, not $state", () => {
  const result = compile(
    `<Client>const submit = (e) => e.preventDefault();</Client>` +
      `<View><form @submit="submit(event)"></form></View>`,
    "view/page.kal",
  );
  // `event` must be bound from the $event param, not destructured off $state.
  assert.ok(result.code.includes("const event = $event;"));
  assert.ok(!/let \{[^}]*\bevent\b[^}]*\} = \$state/.test(result.code));
  assert.ok(result.code.includes("submit(event)"));
});

test("Client block hoists only TOP-LEVEL declarations (not nested / comments)", () => {
  const result = compile(
    `<Client>\n` +
      `  const form = 1;\n` +
      `  const submit = (e) => { const email = e.target.value; return email; }; // let sneaky\n` +
      `  // const alsoFake = 2\n` +
      `</Client><View><p>{{ form }}</p></View>`,
    "view/page.kal",
  );
  const ret = (result.code.match(/return \{[^}]*\};/) || [""])[0];
  assert.ok(ret.includes("form"));
  assert.ok(ret.includes("submit"));
  assert.ok(!ret.includes("email"), "nested const must not be hoisted");
  assert.ok(!ret.includes("sneaky"), "comment word must not be hoisted");
  assert.ok(!ret.includes("alsoFake"), "commented decl must not be hoisted");
});

test("When/Show/Else unwrap signals in the condition", () => {
  const result = compile(
    `<View><When condition="busy"><b>x</b></When><Else><i>y</i></Else>` +
      `<Show when="open"><u>z</u></Show></View>`,
    "view/page.kal",
  );
  assert.ok(result.code.includes("_unwrapSignal(busy) ?"));
  assert.ok(result.code.includes("!_unwrapSignal(busy)"));
  assert.ok(result.code.includes("_unwrapSignal(open) ?"));
});
