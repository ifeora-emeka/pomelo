export interface KalloComponent {
  componentId?: string;
  css?: string;
  setup?: (props?: Record<string, unknown>) => Record<string, unknown>;
  render?: (
    state: Record<string, unknown>,
    slots?: Record<string, () => string>,
  ) => string;
  handlers?: Array<
    (
      state: Record<string, unknown>,
      scope: Record<string, unknown>,
      event: KalloTestEvent,
    ) => unknown
  >;
}

export interface RenderOptions {
  props?: Record<string, unknown>;
  slots?: Record<string, () => string>;
}

function buildState(
  component: KalloComponent,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const setupState = component.setup ? component.setup(props) : {};
  return { ...props, ...setupState };
}

/**
 * renderToString — renders a compiled Kallo component to its SSR HTML string.
 * The first-party way to snapshot a `.kal` component's output in a unit test.
 *
 * Usage:
 *   const html = renderToString(Card, { props: { title: "Hi" } });
 */
export function renderToString(
  component: KalloComponent,
  options: RenderOptions = {},
): string {
  const state = buildState(component, options.props ?? {});
  return component.render ? component.render(state, options.slots ?? {}) : "";
}

/**
 * normalizeHtml — collapses insignificant whitespace so rendered output produces
 * stable snapshots regardless of template indentation.
 */
export function normalizeHtml(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

export interface KalloTestEvent {
  target: { value?: string; checked?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * makeEvent — builds a synthetic event matching the shape Kallo's compiled
 * handler thunks read (`$event.target.value`, `$event.target.checked`).
 */
export function makeEvent(
  init: { value?: string; checked?: boolean; [key: string]: unknown } = {},
): KalloTestEvent {
  const { value, checked, ...rest } = init;
  return { target: { value: value ?? "", checked: checked ?? false }, ...rest };
}

export interface MountResult {
  state: Record<string, unknown>;
  html(): string;
  text(): string;
  contains(snippet: string): boolean;
  fire(handlerIndex: number, event?: KalloTestEvent): unknown;
  unmount(): void;
}

/**
 * mount — instantiates a component with a live, mutable state and lets a test
 * drive it through Kallo's compiled handler model: call `fire(index, event)` to
 * invoke a handler (which mutates state exactly as it would in the browser), then
 * re-read `html()`/`text()` to assert the update. No DOM/jsdom required.
 *
 * Usage:
 *   const screen = mount(Counter);
 *   screen.fire(0);                       // click handler #0
 *   assert.match(screen.text(), /Count: 1/);
 */
export function mount(
  component: KalloComponent,
  options: RenderOptions = {},
): MountResult {
  const state = buildState(component, options.props ?? {});
  const slots = options.slots ?? {};
  const handlers =
    component.handlers ??
    ((
      globalThis as {
        __kal_handlers__?: Record<string, KalloComponent["handlers"]>;
      }
    ).__kal_handlers__?.[component.componentId ?? ""] ||
      []);
  let mounted = true;

  const render = () =>
    component.render && mounted ? component.render(state, slots) : "";

  return {
    state,
    html: render,
    text: () => render().replace(/<[^>]*>/g, ""),
    contains: (snippet: string) => render().includes(snippet),
    fire(handlerIndex: number, event: KalloTestEvent = makeEvent()) {
      const handler = handlers?.[handlerIndex];
      if (!handler) {
        throw new Error(`No handler at index ${handlerIndex}`);
      }
      return handler(state, {}, event);
    },
    unmount() {
      mounted = false;
    },
  };
}

export interface ActionSpy<A extends unknown[], R> {
  (...args: A): R;
  calls: A[];
  callCount: number;
  lastCall: A | undefined;
  reset(): void;
}

/**
 * mockAction — wraps (or stubs) a server action with a spy that records every
 * call and its arguments, so tests can assert a mutation was dispatched.
 *
 * Usage:
 *   const createTask = mockAction(async () => ({ id: 1 }));
 *   // ... trigger UI ...
 *   assert.strictEqual(createTask.callCount, 1);
 */
export function mockAction<A extends unknown[], R>(
  impl?: (...args: A) => R,
): ActionSpy<A, R> {
  const calls: A[] = [];
  const spy = ((...args: A): R => {
    calls.push(args);
    return impl ? impl(...args) : (undefined as R);
  }) as ActionSpy<A, R>;
  spy.calls = calls;
  Object.defineProperty(spy, "callCount", { get: () => calls.length });
  Object.defineProperty(spy, "lastCall", {
    get: () => calls[calls.length - 1],
  });
  spy.reset = () => {
    calls.length = 0;
  };
  return spy;
}

export interface MockReactive<T> {
  value: T;
  get(): T;
  set(next: T): void;
  sets: T[];
}

/**
 * mockReactive — a controllable test double for a Kallo reactive ($local/$store
 * field). Records every value written via `set` for assertions.
 */
export function mockReactive<T>(initial: T): MockReactive<T> {
  let current = initial;
  const sets: T[] = [];
  return {
    get value() {
      return current;
    },
    set value(next: T) {
      current = next;
      sets.push(next);
    },
    get() {
      return current;
    },
    set(next: T) {
      current = next;
      sets.push(next);
    },
    sets,
  };
}

/**
 * mockStore — builds a store double whose fields are each `mockReactive`,
 * letting a test inspect which fields a component mutated.
 */
export function mockStore<T extends Record<string, unknown>>(
  initial: T,
): { [K in keyof T]: MockReactive<T[K]> } {
  const out = {} as { [K in keyof T]: MockReactive<T[K]> };
  for (const key of Object.keys(initial) as Array<keyof T>) {
    out[key] = mockReactive(initial[key]);
  }
  return out;
}
