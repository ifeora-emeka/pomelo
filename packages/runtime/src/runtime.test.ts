import test from "node:test";
import assert from "node:assert";
import {
  $local,
  $watch,
  $effect,
  $computed,
  $store,
  $use,
  $mount,
  $destroy,
  renderToString,
  mountElement,
  morph,
  hydrate
} from "./index.js";

// Minimal DOM mocks for Node.js test environment
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

  removeChild(child: MockNode) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentElement = null;
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
  listeners = new Map<string, Function[]>();
  private _value: string = "";
  private _innerHTML: string = "";

  constructor(tagName: string) {
    super(1); // ELEMENT_NODE
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
        const tagMatch = /<([a-zA-Z0-9_-]+)([^>]*)>(.*)<\/\1>/.exec(val);
        if (tagMatch) {
          const tag = tagMatch[1] || "";
          const attrsStr = tagMatch[2] || "";
          const inner = tagMatch[3] || "";
          const child = new MockElement(tag);
          child.innerHTML = inner;
          const attrs = attrsStr.match(/([a-zA-Z0-9_-]+)="([^"]*)"/g);
          if (attrs) {
            for (const a of attrs) {
              const parts = a.split("=");
              const k = parts[0] || "";
              const v = parts[1] || "";
              child.setAttribute(k, v.replace(/"/g, ""));
            }
          }
          this.appendChild(child);
        }
      } else {
        const text = new MockNode(3); // TEXT_NODE
        text.nodeValue = val;
        this.appendChild(text);
      }
    }
  }

  get attributes(): any {
    return Array.from(this._attributesMap.entries()).map(([name, value]) => ({
      name,
      value
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

  addEventListener(event: string, cb: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
  }

  dispatchEvent(event: { type: string; target: any }) {
    const list = this.listeners.get(event.type) || [];
    for (const cb of list) {
      cb(event);
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
    if (deep) {
      for (const child of this.childNodes) {
        copy.appendChild(child.cloneNode(deep));
      }
    }
    return copy;
  }
}

// Setup global document mock
const mockDocument = {
  getElementById: (id: string) => null,
  createElement: (tag: string) => {
    if (tag === "style") {
      const el = new MockElement("style");
      (el as any).id = "";
      (el as any).textContent = "";
      return el;
    }
    const el = new MockElement(tag);
    return el;
  },
  head: new MockElement("head"),
};

globalThis.document = mockDocument as any;
globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 } as any;

test("Reactivity signals collect deps and trigger subscribers", () => {
  const count = $local(10);
  let watchedValue = 0;

  $watch(count, (val) => {
    watchedValue = val;
  });

  assert.strictEqual(count.get(), 10);
  assert.strictEqual(watchedValue, 10); // Triggered initially on watch setup

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
    }
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
  mockContainer.innerHTML = `<button data-pom-event-click="increment">0</button>`;

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
      return `<button data-pom-event-click="increment">${state.count}</button>`;
    }
  };

  const instance = hydrate(mockContainer as any, component);
  
  // Verify mount run
  const firstChild = mockContainer.childNodes[0] as MockElement;
  assert.ok(firstChild);
  assert.ok(firstChild.childNodes[0]);
  assert.strictEqual(firstChild.childNodes[0].nodeValue, "0");

  // Dispatch click event via event delegation
  const clickEvent = { type: "click", target: firstChild };
  firstChild.dispatchEvent(clickEvent);

  // Assert state updated and morph ran
  assert.ok(firstChild.childNodes[0]);
  assert.strictEqual(firstChild.childNodes[0].nodeValue, "1");
});
