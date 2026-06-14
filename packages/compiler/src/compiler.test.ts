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
