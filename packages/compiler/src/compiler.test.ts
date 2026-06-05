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
      <Each of="products" as="prod">
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

  // Event handlers & Bindings
  assert.ok(result.code.includes('data-kal-event-click="increment"'));
  assert.ok(result.code.includes('data-kal-bind="username"'));
  assert.ok(
    result.code.includes(
      'data-kal-event-input="username = $event.target.value"',
    ),
  );

  // Class merging
  assert.ok(result.code.includes('class="box ${_formatClass(dynamicClass)}"'));

  // Loops and Conditionals
  assert.ok(result.code.includes("(products || []).map((prod) =>"));
  assert.ok(result.code.includes("showBanner ?"));
  assert.ok(result.code.includes("!(showBanner) ?"));

  // Slots
  assert.ok(result.code.includes("slots.footer ? slots.footer() :"));
});
