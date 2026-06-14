import test from "node:test";
import assert from "node:assert";
import {
  $local,
  $watch,
  $effect,
  $computed,
  $store,
  $use,
  $batch,
  $mount,
  $destroy,
  renderToString,
  mountElement,
  morph,
  hydrate,
  destroyInstance,
  injectStyle,
  removeStyle,
} from "./index.js";

class MockNode {
  nodeType: number;
  nodeValue: string | null = null;
  childNodes: MockNode[] = [];
  parentElement: MockNode | null = null;

  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }

  get textContent(): string {
    return this.nodeValue || "";
  }

  set textContent(val: string) {
    this.nodeValue = val;
  }

  appendChild(child: MockNode) {
    child.parentElement = this;
    this.childNodes.push(child);
  }

  insertBefore(newNode: MockNode, refNode: MockNode | null) {
    if (!refNode) {
      this.appendChild(newNode);
      return;
    }
    const idx = this.childNodes.indexOf(refNode);
    if (idx !== -1) {
      newNode.parentElement = this;
      this.childNodes.splice(idx, 0, newNode);
    } else {
      this.appendChild(newNode);
    }
  }

  removeChild(child: MockNode) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentElement = null;
    }
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  replaceWith(newNode: MockNode) {
    if (this.parentElement) {
      const idx = this.parentElement.childNodes.indexOf(this);
      if (idx !== -1) {
        this.parentElement.childNodes[idx] = newNode;
        newNode.parentElement = this.parentElement;
        this.parentElement = null;
      }
    }
  }

  cloneNode(deep: boolean): MockNode {
    const copy = new MockNode(this.nodeType);
    copy.nodeValue = this.nodeValue;
    if (deep) {
      for (const child of this.childNodes) {
        copy.appendChild(child.cloneNode(deep));
      }
    }
    return copy;
  }
}

class MockElement extends MockNode {
  tagName: string;
  private _attributesMap = new Map<string, string>();
  listeners = new Map<
    string,
    { cb: Function; controller?: AbortController }[]
  >();
  private _value: string = "";
  private _innerHTML: string = "";
  id: string = "";

  constructor(tagName: string) {
    super(1);
    this.tagName = tagName.toUpperCase();
  }

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    this._value = val;
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    this.childNodes = [];
    if (val) {
      if (val.startsWith("<")) {
        const tagMatch = /<([a-zA-Z0-9_-]+)([^>]*)>(.*)<\/\1>/s.exec(val);
        if (tagMatch) {
          const tag = tagMatch[1] || "";
          const attrsStr = tagMatch[2] || "";
          const inner = tagMatch[3] || "";
          const child = new MockElement(tag);
          child.innerHTML = inner;
          const attrs = attrsStr.match(/([a-zA-Z0-9_:-]+)="([^"]*)"/g);
          if (attrs) {
            for (const a of attrs) {
              const eqIdx = a.indexOf("=");
              const k = a.slice(0, eqIdx);
              const v = a.slice(eqIdx + 2, -1);
              child.setAttribute(k, v);
            }
          }
          this.appendChild(child);
        }
      } else {
        const text = new MockNode(3);
        text.nodeValue = val;
        this.appendChild(text);
      }
    }
  }

  get attributes(): any {
    return Array.from(this._attributesMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }

  setAttribute(name: string, value: string) {
    this._attributesMap.set(name, value);
  }

  getAttribute(name: string) {
    return this._attributesMap.get(name) || null;
  }

  hasAttribute(name: string) {
    return this._attributesMap.has(name);
  }

  removeAttribute(name: string) {
    this._attributesMap.delete(name);
  }

  addEventListener(event: string, cb: Function, opts?: any) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const entry: { cb: Function; controller?: AbortController } = { cb };
    if (opts && opts.signal) {
      entry.controller = undefined;
      opts.signal.addEventListener("abort", () => {
        const list = this.listeners.get(event) || [];
        const idx = list.indexOf(entry);
        if (idx !== -1) list.splice(idx, 1);
      });
    }
    this.listeners.get(event)!.push(entry);
  }

  dispatchEvent(event: { type: string; target: any }) {
    const list = this.listeners.get(event.type) || [];
    for (const entry of list) {
      entry.cb(event);
    }
    if (this.parentElement instanceof MockElement) {
      this.parentElement.dispatchEvent(event);
    }
  }

  cloneNode(deep: boolean): MockElement {
    const copy = new MockElement(this.tagName);
    for (const [k, v] of this._attributesMap.entries()) {
      copy.setAttribute(k, v);
    }
    copy.value = this.value;
    copy._innerHTML = this._innerHTML;
    copy.id = this.id;
    if (deep) {
      for (const child of this.childNodes) {
        copy.appendChild(child.cloneNode(deep));
      }
    }
    return copy;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      const walk = (node: MockNode): MockElement | null => {
        if (node instanceof MockElement && node.getAttribute("class")?.includes(className)) {
          return node;
        }
        for (const child of node.childNodes) {
          const res = walk(child);
          if (res) return res;
        }
        return null;
      };
      return walk(this);
    }
    const walk = (node: MockNode): MockElement | null => {
      if (node instanceof MockElement && node.tagName.toLowerCase() === selector.toLowerCase()) {
        return node;
      }
      for (const child of node.childNodes) {
        const res = walk(child);
        if (res) return res;
      }
      return null;
    };
    return walk(this);
  }
}

const styleStore = new Map<string, MockElement>();

const mockDocument = {
  getElementById: (id: string) => styleStore.get(id) || null,
  createElement: (tag: string) => {
    const el = new MockElement(tag);
    return el;
  },
  head: new MockElement("head"),
};

(mockDocument.head as any).appendChild = function (child: MockElement) {
  MockNode.prototype.appendChild.call(this, child);
  if (child.id) {
    styleStore.set(child.id, child);
  }
};

globalThis.document = mockDocument as any;
globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 } as any;
globalThis.AbortController = AbortController;

test("Reactivity signals collect deps and trigger subscribers", () => {
  const count = $local(10);
  let watchedValue = 0;

  $watch(count, (val) => {
    watchedValue = val;
  });

  assert.strictEqual(count.get(), 10);
  assert.strictEqual(watchedValue, 10);

  count.set(25);
  assert.strictEqual(count.get(), 25);
  assert.strictEqual(watchedValue, 25);
});

test("Reactivity $computed and $effect track changes", () => {
  const a = $local(2);
  const b = $local(3);
  const sum = $computed(() => a.get() + b.get());

  let triggerCount = 0;
  $effect(() => {
    sum.get();
    triggerCount++;
  });

  assert.strictEqual(sum.get(), 5);
  assert.strictEqual(triggerCount, 1);

  a.set(10);
  assert.strictEqual(sum.get(), 13);
  assert.strictEqual(triggerCount, 2);
});

test("Reactivity $store creates reactive proxy", () => {
  const store = $store({
    count: 0,
    double() {
      return this.count * 2;
    },
  });

  let val = 0;
  $effect(() => {
    val = store.count;
  });

  assert.strictEqual(val, 0);
  store.count = 5;
  assert.strictEqual(val, 5);
  assert.strictEqual(store.double(), 10);
});

test("Reactivity $batch coalesces updates", () => {
  const count = $local(0);
  let effectRuns = 0;

  $effect(() => {
    count.get();
    effectRuns++;
  });

  assert.strictEqual(effectRuns, 1);

  $batch(() => {
    count.set(1);
    count.set(2);
    count.set(3);
  });

  assert.strictEqual(count.get(), 3);
  assert.strictEqual(effectRuns, 2);
});

test("Reactivity $watch returns unsubscribe function", () => {
  const count = $local(0);
  let watchedValue = 0;

  const unsub = $watch(count, (val) => {
    watchedValue = val;
  });

  count.set(5);
  assert.strictEqual(watchedValue, 5);

  unsub();
  count.set(10);
  assert.strictEqual(watchedValue, 5);
});

test("renderToString returns result of render function", () => {
  const html = renderToString(() => "<div>Content</div>");
  assert.strictEqual(html, "<div>Content</div>");
});

test("mountElement updates target innerHTML", () => {
  const mockElement = { innerHTML: "" };
  mountElement(mockElement, "<h1>Mounted</h1>");
  assert.strictEqual(mockElement.innerHTML, "<h1>Mounted</h1>");
});

test("DOM morph function syncs elements and attributes", () => {
  const el1 = new MockElement("div");
  el1.setAttribute("class", "box");
  el1.appendChild(Object.assign(new MockNode(3), { nodeValue: "Old" }));

  const el2 = new MockElement("div");
  el2.setAttribute("class", "card");
  el2.setAttribute("id", "new-id");
  el2.appendChild(Object.assign(new MockNode(3), { nodeValue: "New" }));

  morph(el1 as any, el2 as any);

  assert.strictEqual(el1.getAttribute("class"), "card");
  assert.strictEqual(el1.getAttribute("id"), "new-id");
  assert.ok(el1.childNodes[0]);
  assert.strictEqual(el1.childNodes[0].nodeValue, "New");
});

test("Component hydration sets up reactivity, event delegation and mounts", () => {
  const mockContainer = new MockElement("div");
  mockContainer.innerHTML = `<button data-kal-event-click="evtcmp::0">0</button>`;

  // Compiled handlers live in a build-time registry (CSP-safe, no runtime eval).
  (globalThis as any).__kal_handlers__ = {
    evtcmp: [
      function ($state: any) {
        return $state.increment;
      },
    ],
  };

  const component = {
    setup() {
      const count = $local(0);
      function increment() {
        count.set(count.get() + 1);
      }
      let mounted = false;
      $mount(() => {
        mounted = true;
      });
      return { count, increment, mounted };
    },
    render(state: any) {
      return `<button data-kal-event-click="evtcmp::0">${state.count}</button>`;
    },
  };

  const instance = hydrate(mockContainer as any, component);

  const firstChild = mockContainer.childNodes[0] as MockElement;
  assert.ok(firstChild);
  assert.ok(firstChild.childNodes[0]);
  assert.strictEqual(firstChild.childNodes[0].nodeValue, "0");

  const clickEvent = { type: "click", target: firstChild };
  firstChild.dispatchEvent(clickEvent);

  assert.ok(firstChild.childNodes[0]);
  assert.strictEqual(firstChild.childNodes[0].nodeValue, "1");
});

test("Component destroy teardown cleans up listeners and styles", () => {
  const mockContainer = new MockElement("div");
  mockContainer.innerHTML = `<p>hello</p>`;

  let destroyed = false;
  const component = {
    setup() {
      $destroy(() => {
        destroyed = true;
      });
      return {};
    },
    render() {
      return `<p>hello</p>`;
    },
    css: ".test { color: red; }",
    componentId: "teardown-test",
  };

  const instance = hydrate(mockContainer as any, component);
  assert.strictEqual(destroyed, false);

  destroyInstance(instance);
  assert.strictEqual(destroyed, true);
  assert.strictEqual(mockContainer.innerHTML, "");
});

test("injectStyle creates and removeStyle removes style element", () => {
  styleStore.clear();
  injectStyle(".foo { color: blue; }", "inject-test");
  const styleEl = styleStore.get("kallo-style-inject-test");
  assert.ok(styleEl);

  removeStyle("inject-test");
});

test("$effect cleanup removes subscriptions", () => {
  const count = $local(0);
  let runs = 0;

  const cleanup = $effect(() => {
    count.get();
    runs++;
  });

  assert.strictEqual(runs, 1);
  count.set(1);
  assert.strictEqual(runs, 2);

  cleanup();
  count.set(2);
  assert.strictEqual(runs, 2);
});

test("hydrate stores raw state on ComponentInstance.state", () => {
  const mockContainer = new MockElement("div");

  const component = {
    setup() {
      const count = $local(42);
      return { count };
    },
    render(state: any) {
      return `<p>${state.count}</p>`;
    },
  };

  const instance = hydrate(mockContainer as any, component);
  assert.ok(instance.state);
  assert.ok("count" in instance.state);

  destroyInstance(instance);
});

test("hotUpdate replaces render function and re-renders without recreating state", () => {
  const mockContainer = new MockElement("div");

  const component = {
    setup() {
      const count = $local(5);
      return { count };
    },
    render(state: any) {
      return `<p>v1:${state.count}</p>`;
    },
  };

  const instance = hydrate(mockContainer as any, component);
  const firstChild = mockContainer.childNodes[0] as MockElement;
  assert.ok(firstChild);
  assert.strictEqual(firstChild.childNodes[0]?.nodeValue, "v1:5");

  const originalState = instance.state;

  instance.hotUpdate((state: any) => `<p>v2:${state.count}</p>`);

  const updatedChild = mockContainer.childNodes[0] as MockElement;
  assert.ok(updatedChild);
  assert.strictEqual(updatedChild.childNodes[0]?.nodeValue, "v2:5");

  assert.strictEqual(instance.state, originalState);

  destroyInstance(instance);
});

test("destroyInstance cleans up render effect subscriptions", () => {
  const mockContainer = new MockElement("div");
  const count = $local(0);
  let renderCalls = 0;

  const component = {
    setup() {
      return { count };
    },
    render(state: any) {
      renderCalls++;
      return `<p>${state.count}</p>`;
    },
  };

  const instance = hydrate(mockContainer as any, component);
  assert.strictEqual(renderCalls, 1);

  count.set(1);
  assert.strictEqual(renderCalls, 2);

  destroyInstance(instance);
  count.set(2);
  assert.strictEqual(renderCalls, 2);
});
