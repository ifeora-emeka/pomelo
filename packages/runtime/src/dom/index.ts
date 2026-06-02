import { PomeloLogger } from "@pomelo/shared";
import { $effect } from "../reactivity/index.js";

export interface ComponentInstance {
  mounts: (() => void)[];
  destroys: (() => void)[];
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
  PomeloLogger.info("Mounting view component...");
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

    // Sync attributes
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

    // Sync inputs/textareas values
    if (oldEl.tagName === "INPUT" || oldEl.tagName === "TEXTAREA") {
      const o = oldEl as HTMLInputElement | HTMLTextAreaElement;
      const n = newEl as HTMLInputElement | HTMLTextAreaElement;
      if (o.value !== n.value) {
        o.value = n.value;
      }
      if (o.tagName === "INPUT" && (o as HTMLInputElement).checked !== (n as HTMLInputElement).checked) {
        (o as HTMLInputElement).checked = (n as HTMLInputElement).checked;
      }
    } else if (oldEl.tagName === "SELECT") {
      const o = oldEl as HTMLSelectElement;
      const n = newEl as HTMLSelectElement;
      if (o.value !== n.value) {
        o.value = n.value;
      }
    }

    // Morph children
    const oldChildren = Array.from(oldEl.childNodes);
    const newChildren = Array.from(newEl.childNodes);

    const oldLen = oldChildren.length;
    const newLen = newChildren.length;
    const maxLen = Math.max(oldLen, newLen);

    for (let i = 0; i < maxLen; i++) {
      const oldChild = oldChildren[i];
      const newChild = newChildren[i];
      if (oldChild === undefined && newChild !== undefined) {
        oldEl.appendChild(newChild.cloneNode(true));
      } else if (newChild === undefined && oldChild !== undefined) {
        oldEl.removeChild(oldChild);
      } else if (oldChild !== undefined && newChild !== undefined) {
        morph(oldChild, newChild);
      }
    }
  }
}

export function injectStyle(css: string, componentId: string): void {
  if (typeof document === "undefined") return;
  const styleId = `pom-style-${componentId}`;
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
}

const eventsToDelegate = ["click", "change", "input", "submit", "focus", "blur", "keydown", "keyup"];

export function setupEventDelegation(container: HTMLElement, stateProxy: any) {
  for (const eventName of eventsToDelegate) {
    const useCapture = eventName === "focus" || eventName === "blur";
    container.addEventListener(
      eventName,
      (event) => {
        let target = event.target as HTMLElement | null;
        const attrName = `data-pom-event-${eventName}`;
        while (target && target !== container.parentElement) {
          if (target.hasAttribute && target.hasAttribute(attrName)) {
            const expr = target.getAttribute(attrName);
            if (expr) {
              const fn = new Function("state", "$event", `with(state) { return (${expr}); }`);
              const evaluated = fn(stateProxy, event);
              if (typeof evaluated === "function") {
                evaluated(event);
              }
            }
            break;
          }
          target = target.parentElement;
        }
      },
      useCapture
    );
  }
}

export function hydrate(
  container: HTMLElement,
  component: { setup: (props?: any) => any; render: (state?: any, slots?: any) => string; css?: string },
  props: any = {}
): ComponentInstance {
  PomeloLogger.info("Hydrating component...");
  if (component.css) {
    injectStyle(component.css, "global");
  }

  const instance: ComponentInstance = { mounts: [], destroys: [] };
  setActiveInstance(instance);

  const rawState = component.setup(props);
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
    }
  });

  setActiveInstance(null);
  setupEventDelegation(container, stateProxy);

  $effect(() => {
    const html = component.render(stateProxy);
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
  return instance;
}
