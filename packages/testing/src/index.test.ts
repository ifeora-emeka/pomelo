import test from "node:test";
import assert from "node:assert";
import {
  renderToString,
  normalizeHtml,
  mount,
  makeEvent,
  mockAction,
  mockReactive,
  mockStore,
  type KalloComponent,
} from "./index.js";

const Card: KalloComponent = {
  componentId: "card",
  setup: (props) => ({ title: props?.title ?? "Untitled" }),
  render: (state, slots) =>
    `<div class="card"><h2>${state.title}</h2>${slots?.default ? slots.default() : ""}</div>`,
};

const Counter: KalloComponent = {
  componentId: "counter",
  setup: () => ({ count: 0 }),
  render: (state) => `<button>Count: ${state.count}</button>`,
  handlers: [(state) => (state.count = (state.count as number) + 1)],
};

test("renderToString renders setup-derived state and props", () => {
  const html = renderToString(Card, { props: { title: "Hello" } });
  assert.strictEqual(html, '<div class="card"><h2>Hello</h2></div>');
});

test("renderToString uses defaults when props omitted", () => {
  assert.match(renderToString(Card), /Untitled/);
});

test("renderToString injects slot content", () => {
  const html = renderToString(Card, {
    props: { title: "X" },
    slots: { default: () => "<p>body</p>" },
  });
  assert.ok(html.includes("<p>body</p>"));
});

test("normalizeHtml collapses whitespace for stable snapshots", () => {
  assert.strictEqual(
    normalizeHtml("<div>\n  <span> a </span>\n</div>"),
    "<div><span> a </span></div>",
  );
});

test("mount drives a component through its compiled handlers", () => {
  const screen = mount(Counter);
  assert.match(screen.text(), /Count: 0/);
  screen.fire(0);
  assert.match(screen.text(), /Count: 1/);
  screen.fire(0);
  assert.match(screen.text(), /Count: 2/);
});

test("mount throws on missing handler index", () => {
  const screen = mount(Counter);
  assert.throws(() => screen.fire(5));
});

test("mount text() strips tags and contains() checks raw html", () => {
  const screen = mount(Card, { props: { title: "Hey" } });
  assert.strictEqual(screen.text(), "Hey");
  assert.ok(screen.contains('class="card"'));
});

test("makeEvent shapes target.value / target.checked", () => {
  assert.deepStrictEqual(makeEvent({ value: "hi" }).target, {
    value: "hi",
    checked: false,
  });
  assert.strictEqual(makeEvent({ checked: true }).target.checked, true);
});

test("mockAction records calls, args, and resets", async () => {
  const create = mockAction(async (x: number) => x * 2);
  const r = await create(21);
  assert.strictEqual(r, 42);
  assert.strictEqual(create.callCount, 1);
  assert.deepStrictEqual(create.lastCall, [21]);
  create.reset();
  assert.strictEqual(create.callCount, 0);
});

test("mockReactive tracks writes", () => {
  const r = mockReactive(0);
  r.set(1);
  r.value = 2;
  assert.strictEqual(r.get(), 2);
  assert.deepStrictEqual(r.sets, [1, 2]);
});

test("mockStore wraps each field as a reactive double", () => {
  const store = mockStore({ name: "a", count: 1 });
  store.count.set(5);
  assert.strictEqual(store.count.get(), 5);
  assert.deepStrictEqual(store.count.sets, [5]);
  assert.strictEqual(store.name.get(), "a");
});
