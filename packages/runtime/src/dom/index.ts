import { PomeloLogger } from "@pomelo/shared";
import { $effect, $batch, Signal } from "../reactivity/index.js";

export interface ComponentInstance {
  mounts: (() => void)[];
  destroys: (() => void)[];
  container: HTMLElement | null;
  teardown: () => void;
  state: Record<string, unknown>;
  hotUpdate: (renderFn: (state: any, slots?: any) => string) => void;
}

export let activeInstance: ComponentInstance | null = null;

export function setActiveInstance(instance: ComponentInstance | null) {
  activeInstance = instance;
}

export function $mount(cb: () => void) {
  if (activeInstance) {
    activeInstance.mounts.push(cb);
  }
}

export function $destroy(cb: () => void) {
  if (activeInstance) {
    activeInstance.destroys.push(cb);
  }
}

export function mountElement(parent: unknown, html: string): void {
  if (parent && typeof parent === "object" && "innerHTML" in parent) {
    (parent as { innerHTML: string }).innerHTML = html;
  }
}

export function morph(oldNode: Node, newNode: Node) {
  if (oldNode.nodeType === 3 && newNode.nodeType === 3) {
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue;
    }
    return;
  }

  if (oldNode.nodeType === 1 && newNode.nodeType === 1) {
    const oldEl = oldNode as HTMLElement;
    const newEl = newNode as HTMLElement;

    if (oldEl.tagName !== newEl.tagName) {
      oldEl.replaceWith(newNode.cloneNode(true));
      return;
    }

    const oldAttrs = Array.from(oldEl.attributes);
    const newAttrs = Array.from(newEl.attributes);

    for (const attr of oldAttrs) {
      if (!newEl.hasAttribute(attr.name)) {
        oldEl.removeAttribute(attr.name);
      }
    }
    for (const attr of newAttrs) {
      if (oldEl.getAttribute(attr.name) !== attr.value) {
        oldEl.setAttribute(attr.name, attr.value);
      }
    }

    if (oldEl.tagName === "INPUT" || oldEl.tagName === "TEXTAREA") {
      const o = oldEl as HTMLInputElement | HTMLTextAreaElement;
      const n = newEl as HTMLInputElement | HTMLTextAreaElement;
      if (o.value !== n.value) {
        o.value = n.value;
      }
      if (
        o.tagName === "INPUT" &&
        (o as HTMLInputElement).checked !== (n as HTMLInputElement).checked
      ) {
        (o as HTMLInputElement).checked = (n as HTMLInputElement).checked;
      }
    } else if (oldEl.tagName === "SELECT") {
      const o = oldEl as HTMLSelectElement;
      const n = newEl as HTMLSelectElement;
      if (o.value !== n.value) {
        o.value = n.value;
      }
    }

    morphChildren(oldEl, newEl);
  }
}

function morphChildren(oldParent: HTMLElement, newParent: HTMLElement) {
  const oldChildren = Array.from(oldParent.childNodes);
  const newChildren = Array.from(newParent.childNodes);

  const oldKeyed = new Map<string, Node>();
  for (const child of oldChildren) {
    if (child.nodeType === 1) {
      const key = (child as HTMLElement).getAttribute("data-pom-key");
      if (key) {
        oldKeyed.set(key, child);
      }
    }
  }

  const newKeyed = new Set<string>();
  for (const child of newChildren) {
    if (child.nodeType === 1) {
      const key = (child as HTMLElement).getAttribute("data-pom-key");
      if (key) {
        newKeyed.add(key);
      }
    }
  }

  for (const [key, node] of oldKeyed) {
    if (!newKeyed.has(key)) {
      oldParent.removeChild(node);
    }
  }

  const maxLen = Math.max(oldChildren.length, newChildren.length);
  const currentOldChildren = Array.from(oldParent.childNodes);

  for (let i = 0; i < newChildren.length; i++) {
    const newChild = newChildren[i]!;
    const oldChild = currentOldChildren[i];

    if (newChild.nodeType === 1) {
      const newKey = (newChild as HTMLElement).getAttribute("data-pom-key");
      if (newKey && oldKeyed.has(newKey)) {
        const existingNode = oldKeyed.get(newKey)!;
        if (oldChild !== existingNode) {
          oldParent.insertBefore(existingNode, oldChild || null);
        }
        morph(existingNode, newChild);
        continue;
      }
    }

    if (!oldChild) {
      oldParent.appendChild(newChild.cloneNode(true));
    } else {
      morph(oldChild, newChild);
    }
  }

  while (oldParent.childNodes.length > newChildren.length) {
    const last = oldParent.childNodes[oldParent.childNodes.length - 1];
    if (last) {
      oldParent.removeChild(last);
    }
  }
}

export function injectStyle(css: string, componentId: string): void {
  if (typeof document === "undefined") return;
  const styleId = `pom-style-${componentId}`;
  const existing = document.getElementById(styleId);
  if (existing) {
    existing.textContent = css;
  } else {
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
}

export function removeStyle(componentId: string): void {
  if (typeof document === "undefined") return;
  const styleId = `pom-style-${componentId}`;
  const existing = document.getElementById(styleId);
  if (existing) {
    existing.remove();
  }
}

const eventsToDelegate = [
  "click",
  "change",
  "input",
  "submit",
  "focus",
  "blur",
  "keydown",
  "keyup",
];

export function setupEventDelegation(
  container: HTMLElement,
  stateProxy: any,
): () => void {
  const controllers: AbortController[] = [];

  for (const eventName of eventsToDelegate) {
    const useCapture = eventName === "focus" || eventName === "blur";
    const controller = new AbortController();
    controllers.push(controller);

    container.addEventListener(
      eventName,
      (event) => {
        let target = event.target as HTMLElement | null;
        const attrName = `data-pom-event-${eventName}`;
        while (target && target !== container.parentElement) {
          if (target.hasAttribute && target.hasAttribute(attrName)) {
            const expr = target.getAttribute(attrName);
            if (expr) {
              const loopVars: Record<string, any> = {};
              let current: HTMLElement | null = target;
              while (current && current !== container.parentElement) {
                if (current.attributes) {
                  for (const attr of Array.from(current.attributes)) {
                    if (attr.name.startsWith("data-pom-loop-item-")) {
                      const varName = attr.name.slice("data-pom-loop-item-".length);
                      if (!(varName in loopVars)) {
                        try {
                          loopVars[varName] = JSON.parse(attr.value);
                        } catch (e) {
                          // Ignore
                        }
                      }
                    }
                  }
                }
                current = current.parentElement;
              }

              const eventState = new Proxy(loopVars, {
                has(target, key) {
                  return key in target || key === "state" || Reflect.has(stateProxy, key);
                },
                get(target, key) {
                  if (key === "state") return stateProxy;
                  if (key in target) {
                    return target[key as string];
                  }
                  return Reflect.get(stateProxy, key);
                },
                set(target, key, value) {
                  if (key in target) {
                    target[key as string] = value;
                    return true;
                  }
                  return Reflect.set(stateProxy, key, value);
                }
              });

              const fn = new Function(
                "state",
                "$event",
                `with(state) { return (${expr}); }`,
              );
              const evaluated = fn(eventState, event);
              if (typeof evaluated === "function") {
                evaluated(event);
              }
            }
            break;
          }
          target = target.parentElement;
        }
      },
      { capture: useCapture, signal: controller.signal },
    );
  }

  return () => {
    for (const controller of controllers) {
      controller.abort();
    }
  };
}

export function hydrate(
  container: HTMLElement,
  component: {
    setup: (props?: any) => any;
    render: (state?: any, slots?: any) => string;
    css?: string;
    componentId?: string;
  },
  props: any = {},
): ComponentInstance {
  const componentId = component.componentId || "global";
  if (component.css) {
    injectStyle(component.css, componentId);
  }

  const instance: ComponentInstance = {
    mounts: [],
    destroys: [],
    container,
    state: {},
    teardown: () => {},
    hotUpdate: () => {},
  };
  setActiveInstance(instance);

  const rawState = { ...props, ...(component.setup ? component.setup(props) : {}) };
  instance.state = rawState;

  const stateProxy = new Proxy(rawState, {
    has(target, key) {
      return key in target || key === "state";
    },
    get(target, key) {
      const val = target[key];
      if (val && typeof val === "object" && typeof val.get === "function") {
        return val.get();
      }
      return val;
    },
    set(target, key, value) {
      const val = target[key];
      if (val && typeof val === "object" && typeof val.set === "function") {
        val.set(value);
        return true;
      }
      target[key] = value;
      return true;
    },
  });

  setActiveInstance(null);
  const removeEvents = setupEventDelegation(container, stateProxy);

  let currentRender = component.render;
  const renderVersion = new Signal(0);

  const cleanupRenderEffect = $effect(() => {
    renderVersion.get();
    const html = currentRender(stateProxy);
    const temp = document.createElement("div");
    temp.innerHTML = html;

    const oldChildren = Array.from(container.childNodes);
    const newChildren = Array.from(temp.childNodes);
    const maxLen = Math.max(oldChildren.length, newChildren.length);

    for (let i = 0; i < maxLen; i++) {
      const oldChild = oldChildren[i];
      const newChild = newChildren[i];
      if (oldChild === undefined && newChild !== undefined) {
        container.appendChild(newChild.cloneNode(true));
      } else if (newChild === undefined && oldChild !== undefined) {
        container.removeChild(oldChild);
      } else if (oldChild !== undefined && newChild !== undefined) {
        morph(oldChild, newChild);
      }
    }
  });

  instance.mounts.forEach((cb) => cb());

  instance.hotUpdate = (newRenderFn: (state: any, slots?: any) => string) => {
    currentRender = newRenderFn;
    renderVersion.set(renderVersion.get() + 1);
  };

  instance.teardown = () => {
    instance.destroys.forEach((cb) => cb());
    cleanupRenderEffect();
    removeEvents();
    if (component.css) {
      removeStyle(componentId);
    }
    container.innerHTML = "";
  };

  return instance;
}

export function destroyInstance(instance: ComponentInstance): void {
  instance.teardown();
}
