import { $effect, $batch, Signal } from "../reactivity/index.js";
import {
  prefetch,
  consumePrefetched,
  isInternalHref,
  shouldPrefetch,
} from "../prefetch.js";

const KalloLogger = {
  error: (message: string): void => console.error(`[Kallo] ${message}`),
};

export type RenderState = Record<string, unknown>;
export type SlotMap = Record<string, () => string>;
export type RenderFn = (state?: RenderState, slots?: SlotMap) => string;

export interface ComponentInstance {
  mounts: (() => void)[];
  destroys: (() => void)[];
  container: HTMLElement | null;
  teardown: () => void;
  state: Record<string, unknown>;
  hotUpdate: (renderFn: RenderFn) => void;
}

type EventHandler = (
  state: Record<string, unknown>,
  scope: Record<string, unknown>,
  event: Event,
) => unknown;

type HandlerRegistry = Record<string, EventHandler[]>;

function resolveHandler(ref: string): EventHandler | null {
  const sep = ref.indexOf("::");
  if (sep === -1) return null;
  const componentId = ref.slice(0, sep);
  const index = Number(ref.slice(sep + 2));
  const registry = (globalThis as { __kal_handlers__?: HandlerRegistry })
    .__kal_handlers__;
  const handlers = registry && registry[componentId];
  if (!handlers || !handlers[index]) return null;
  return handlers[index];
}

type InstancePropsRegistry = Record<string, Record<string, unknown>>;

// Build the $state a delegated handler runs against. Compiled handlers read
// component props and loop variables from $state, but the live proxy only holds
// the root component's state. Overlay the handler's component-instance function
// props (registered during render) and the loop scope on top of the proxy;
// reads/writes for keys not in the overlay fall through to the reactive proxy.
function buildHandlerState(
  ref: string,
  stateProxy: Record<string, unknown>,
  loopScope: Record<string, unknown>,
): Record<string, unknown> {
  const sep = ref.indexOf("::");
  const componentId = sep === -1 ? ref : ref.slice(0, sep);
  const registry = (globalThis as { __kal_instance_props__?: InstancePropsRegistry })
    .__kal_instance_props__;
  const instanceProps = registry && registry[componentId];

  const overlay: Record<string, unknown> = {};
  if (instanceProps) Object.assign(overlay, instanceProps);
  if (loopScope) Object.assign(overlay, loopScope);
  if (Object.keys(overlay).length === 0) return stateProxy;

  return new Proxy(stateProxy, {
    has(target, key) {
      return key in overlay || key in target;
    },
    get(target, key) {
      if (key in overlay) return overlay[key as string];
      return target[key as string];
    },
    set(target, key, value) {
      if (key in overlay) {
        overlay[key as string] = value;
        return true;
      }
      target[key as string] = value;
      return true;
    },
  }) as Record<string, unknown>;
}

// Fine-grained bindings: read-only thunks returning one expression's value.
type BindingFn = (state: Record<string, unknown>) => unknown;
type BindingRegistry = Record<string, BindingFn[]>;

function getBindings(componentId: string): BindingFn[] | null {
  const registry = (globalThis as { __kal_bindings__?: BindingRegistry })
    .__kal_bindings__;
  const list = registry && registry[componentId];
  return list && list.length > 0 ? list : null;
}

function bindingByRef(ref: string, fallback: BindingFn[]): BindingFn | null {
  const sep = ref.indexOf("::");
  const index = sep === -1 ? Number(ref) : Number(ref.slice(sep + 2));
  return fallback[index] || null;
}

function unwrapSignal(v: unknown): unknown {
  if (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { get?: () => unknown }).get === "function"
  ) {
    return (v as { get: () => unknown }).get();
  }
  return v;
}

function bindingToString(v: unknown): string {
  const u = unwrapSignal(v);
  return u === null || u === undefined ? "" : String(u);
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
      const key = (child as HTMLElement).getAttribute("data-kal-key");
      if (key) {
        oldKeyed.set(key, child);
      }
    }
  }

  const newKeyed = new Set<string>();
  for (const child of newChildren) {
    if (child.nodeType === 1) {
      const key = (child as HTMLElement).getAttribute("data-kal-key");
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

  const currentOldChildren = Array.from(oldParent.childNodes);

  for (let i = 0; i < newChildren.length; i++) {
    const newChild = newChildren[i]!;
    const oldChild = currentOldChildren[i];

    if (newChild.nodeType === 1) {
      const newKey = (newChild as HTMLElement).getAttribute("data-kal-key");
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
  const styleId = `kallo-style-${componentId}`;
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
  const styleId = `kallo-style-${componentId}`;
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
  stateProxy: Record<string, unknown>,
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
        const attrName = `data-kal-event-${eventName}`;
        while (target && target !== container.parentElement) {
          if (target.hasAttribute && target.hasAttribute(attrName)) {
            const ref = target.getAttribute(attrName);
            if (ref) {
              const loopScope: Record<string, unknown> = {};
              let current: HTMLElement | null = target;
              while (current && current !== container.parentElement) {
                if (current.attributes) {
                  for (const attr of Array.from(current.attributes)) {
                    if (attr.name.startsWith("data-kal-loop-item-")) {
                      const varName = attr.name.slice(
                        "data-kal-loop-item-".length,
                      );
                      if (!(varName in loopScope)) {
                        try {
                          loopScope[varName] = JSON.parse(attr.value);
                        } catch {
                          // Ignore malformed loop payloads
                        }
                      }
                    }
                  }
                }
                current = current.parentElement;
              }

              const handler = resolveHandler(ref);
              if (handler) {
                try {
                  // Compiled handlers read everything (component props, loop
                  // vars) from $state. Overlay the component instance's
                  // function props and the loop scope onto the live root proxy
                  // so a handler in a nested component (or inside a loop)
                  // resolves the right values while root reads/writes stay
                  // reactive.
                  const handlerState = buildHandlerState(
                    ref,
                    stateProxy,
                    loopScope,
                  );
                  // Batch all state writes in a handler into one re-render.
                  let result: unknown;
                  $batch(() => {
                    result = handler(handlerState, loopScope, event);
                  });
                  if (typeof result === "function") {
                    (result as (e: Event) => void)(event);
                  }
                } catch (err) {
                  KalloLogger.error(
                    `Error in event handler "${ref}": ${(err as Error).message}`,
                  );
                }
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

// One-time render of an HTML string into a container via morph diffing.
// Used for the initial paint of fine-grained components and for every change
// in coarse (whole-component) mode.
// A layout's render produces a full `<html><head>…</head><body>…</body></html>`
// document, but the hydration container (#app) holds only the body's inner
// content. Re-rendering the whole document into #app would leak <head> nodes and
// wipe the page, so extract the body's inner HTML when a full document is seen.
function extractAppHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body ? doc.body.innerHTML : html;
}

function morphInto(container: HTMLElement, html: string): void {
  const temp = document.createElement("div");
  temp.innerHTML = extractAppHtml(html);

  const oldLoader = container.querySelector(".loader-wrap");
  if (oldLoader) oldLoader.remove();
  const newLoader = temp.querySelector(".loader-wrap");
  if (newLoader) newLoader.remove();

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
}

// Walk the rendered DOM and wire one reactive effect per binding marker, so a
// state change updates only the affected node — no whole-component re-render.
function wireBindings(
  root: HTMLElement,
  stateProxy: Record<string, unknown>,
  bindings: BindingFn[],
): () => void {
  const cleanups: (() => void)[] = [];

  const wire = (apply: () => void) => {
    cleanups.push($effect(apply));
  };

  const visit = (node: Node): void => {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      const attrs = el.attributes ? Array.from(el.attributes) : [];
      for (const attr of attrs) {
        const name = attr.name;
        if (name === "data-kal-txt") {
          const fn = bindingByRef(attr.value, bindings);
          if (fn) wire(() => (el.textContent = bindingToString(fn(stateProxy))));
        } else if (name === "data-kal-value") {
          const fn = bindingByRef(attr.value, bindings);
          if (fn) {
            wire(() => {
              (el as HTMLInputElement).value = bindingToString(fn(stateProxy));
            });
          }
        } else if (name.startsWith("data-kal-attr-")) {
          const prop = name.slice("data-kal-attr-".length);
          const fn = bindingByRef(attr.value, bindings);
          if (fn) {
            wire(() => el.setAttribute(prop, bindingToString(fn(stateProxy))));
          }
        } else if (name.startsWith("data-kal-battr-")) {
          const prop = name.slice("data-kal-battr-".length);
          const fn = bindingByRef(attr.value, bindings);
          if (fn) {
            wire(() => {
              if (unwrapSignal(fn(stateProxy))) el.setAttribute(prop, "");
              else el.removeAttribute(prop);
            });
          }
        }
      }
      for (const child of Array.from(el.childNodes)) visit(child);
    }
  };

  visit(root);

  return () => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  };
}

export function hydrate(
  container: HTMLElement,
  component: {
    setup?: (props?: RenderState) => RenderState;
    render: RenderFn;
    css?: string;
    componentId?: string;
  },
  props: RenderState = {},
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

  const rawState = {
    ...props,
    ...(component.setup ? component.setup(props) : {}),
  };
  instance.state = rawState;

  const stateProxy = new Proxy(rawState as Record<string | symbol, unknown>, {
    has(target, key) {
      return key in target || key === "state";
    },
    get(target, key) {
      if (key === "__raw__") return target;
      const val = target[key] as { get?: () => unknown } | null;
      if (val && typeof val === "object" && typeof val.get === "function") {
        return val.get();
      }
      return val;
    },
    set(target, key, value) {
      const val = target[key] as { set?: (v: unknown) => void } | null;
      if (val && typeof val === "object" && typeof val.set === "function") {
        val.set(value);
        return true;
      }
      target[key] = value;
      return true;
    },
  }) as Record<string, unknown>;

  setActiveInstance(null);
  const removeEvents = setupEventDelegation(container, stateProxy);

  let currentRender = component.render;
  const renderVersion = new Signal(0);
  const fineGrainedBindings = getBindings(componentId);

  let cleanupReactivity: () => void;

  if (fineGrainedBindings) {
    // Fine-grained mode: paint once, then wire one effect per binding. Only the
    // nodes whose dependencies change are touched — the component is never
    // re-rendered wholesale.
    morphInto(container, currentRender(stateProxy));
    cleanupReactivity = wireBindings(container, stateProxy, fineGrainedBindings);
  } else {
    // Coarse mode: a single effect re-renders the whole component on any change
    // and morph-diffs the result. Used for structural templates (loops,
    // conditionals, components) where per-binding tracking does not apply.
    cleanupReactivity = $effect(() => {
      renderVersion.get();
      morphInto(container, currentRender(stateProxy));
    });
  }

  instance.mounts.forEach((cb) => cb());

  instance.hotUpdate = (newRenderFn: RenderFn) => {
    currentRender = newRenderFn;
    if (fineGrainedBindings) {
      // Re-paint and re-wire bindings against the replaced render function.
      cleanupReactivity();
      morphInto(container, currentRender(stateProxy));
      cleanupReactivity = wireBindings(
        container,
        stateProxy,
        fineGrainedBindings,
      );
    } else {
      renderVersion.set(renderVersion.get() + 1);
    }
  };

  instance.teardown = () => {
    instance.destroys.forEach((cb) => cb());
    cleanupReactivity();
    removeEvents();
    if (component.css) {
      removeStyle(componentId);
    }
    container.innerHTML = "";
  };

  activePageInstance = instance;
  if (typeof window !== "undefined") {
    (window as unknown as { __kal_instance__?: ComponentInstance }).__kal_instance__ =
      instance;
  }
  return instance;
}

export function destroyInstance(instance: ComponentInstance): void {
  instance.teardown();
}

export let activePageInstance: ComponentInstance | null = null;

/**
 * Prepend the configured base path (GitHub project pages, sub-path hosting) to
 * an app-absolute href if it isn't already present. Idempotent.
 */
function withBasePath(href: string): string {
  const base =
    (typeof window !== "undefined" &&
      (window as unknown as { __KALLO_BASE_PATH__?: string })
        .__KALLO_BASE_PATH__) ||
    "";
  if (
    base &&
    href.startsWith("/") &&
    href !== base &&
    !href.startsWith(base + "/")
  ) {
    return base + href;
  }
  return href;
}

function isStaticMode(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __KALLO_STATIC__?: boolean }).__KALLO_STATIC__ ===
      true
  );
}

// Monotonic token so a superseded (slower) navigation bails out instead of
// clobbering the DOM of a newer one.
let staticNavToken = 0;

/**
 * Fetch a URL, falling back across the on-disk layouts a static host might use
 * (`/x`, `/x.html`, `/x/index.html`) so client navigation works regardless of
 * whether the host rewrites extensionless URLs.
 */
async function fetchStaticHtml(url: string): Promise<string | null> {
  const candidates = [url];
  if (!/\.[a-z0-9]+$/i.test(url.split("?")[0]!)) {
    const clean = url.replace(/\/$/, "");
    candidates.push(clean + ".html", clean + "/index.html");
  }
  for (const c of candidates) {
    try {
      const res = await fetch(c);
      if (res.ok) return res.text();
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Reconcile framework-owned `<head>` nodes (scoped `<style id="kallo-style-*">`
 * and `<title>`) from a freshly fetched document into the live one, so a
 * navigated-to page gets its styles and previous pages' styles don't pile up.
 */
function reconcileHead(doc: Document): void {
  const head = document.head;
  head
    .querySelectorAll('style[id^="kallo-style-"]')
    .forEach((n) => n.remove());
  doc
    .querySelectorAll('style[id^="kallo-style-"]')
    .forEach((n) => head.appendChild(n.cloneNode(true)));
  const newTitle = doc.querySelector("title");
  if (newTitle) document.title = newTitle.textContent || document.title;
}

/**
 * Client navigation for statically-exported sites. There is no SSR navigation
 * endpoint, so fetch the pre-rendered HTML for the target, swap `#app`, bring
 * over its head styles, and re-run the page's hydration module script.
 */
function navigateStatic(href: string, pushState: boolean): Promise<void> {
  const url = withBasePath(href);
  const token = ++staticNavToken;
  return fetchStaticHtml(url)
    .then((htmlText) => {
      // A newer navigation started while we were fetching — abandon this one.
      if (token !== staticNavToken) return;
      if (!htmlText) {
        window.location.href = url;
        return;
      }
      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      const newApp = doc.getElementById("app");
      const curApp = document.getElementById("app");
      if (!newApp || !curApp) {
        window.location.href = url;
        return;
      }
      if (pushState) {
        window.history.pushState(null, "", url);
      }
      reconcileHead(doc);

      if (activePageInstance) {
        activePageInstance.teardown();
        activePageInstance = null;
      }

      // Morph the new markup into the existing tree (rather than replacing
      // innerHTML) so shared nested-layout DOM is preserved across navigation —
      // matching Next.js partial rendering and Kallo's own SSR navigation.
      const oldChildren = Array.from(curApp.childNodes);
      const newChildren = Array.from(newApp.childNodes);
      const maxLen = Math.max(oldChildren.length, newChildren.length);
      for (let i = 0; i < maxLen; i++) {
        const oldChild = oldChildren[i];
        const newChild = newChildren[i];
        if (oldChild === undefined && newChild !== undefined) {
          curApp.appendChild(newChild.cloneNode(true));
        } else if (newChild === undefined && oldChild !== undefined) {
          curApp.removeChild(oldChild);
        } else if (oldChild !== undefined && newChild !== undefined) {
          morph(oldChild, newChild);
        }
      }
      window.scrollTo(0, 0);

      // Re-execute ONLY the framework hydration module script (tagged
      // data-kallo-hydrate) — never arbitrary user `<script type="module">`,
      // which would re-run side effects each navigation.
      const injected: HTMLScriptElement[] = [];
      doc
        .querySelectorAll('script[type="module"][data-kallo-hydrate]')
        .forEach((old) => {
          const s = document.createElement("script");
          s.type = "module";
          s.textContent = old.textContent || "";
          document.body.appendChild(s);
          injected.push(s);
        });
      setTimeout(() => injected.forEach((s) => s.remove()), 0);

      window.dispatchEvent(new Event("load"));
    })
    .catch(() => {
      if (token === staticNavToken) window.location.href = url;
    });
}

export function navigateTo(href: string, pushState = true): Promise<void> {
  if (isStaticMode()) {
    return navigateStatic(href, pushState);
  }
  const prefetched = consumePrefetched(href);
  const payload = prefetched
    ? prefetched
    : fetch(href, { headers: { "X-Kallo-Navigation": "true" } }).then((res) => {
        if (!res.ok) {
          window.location.href = href;
          return undefined;
        }
        return res.json();
      });
  return Promise.resolve(payload)
    .then(async (data) => {
      if (!data) return;
      if (pushState) {
        window.history.pushState(null, "", href);
      }
      if (data.metadata && data.metadata.title) {
        document.title = data.metadata.title;
      }

      const [componentMod, ...layoutMods] = await Promise.all([
        import(`/@kallojs/view/${data.cacheFileName}`),
        ...(data.layoutCacheFileNames || []).map((f: string) => import(`/@kallojs/view/${f}`))
      ]);

      if (activePageInstance) {
        activePageInstance.teardown();
      }

      const appContainer = document.getElementById("app");
      if (appContainer) {
        if (componentMod.css) {
          injectStyle(componentMod.css, data.componentId || "page");
        }
        layoutMods.forEach((mod, idx) => {
          if (mod.css) {
            injectStyle(mod.css, mod.componentId || `layout_${idx}`);
          }
        });

        const pageState = {
          ...data.state,
          ...(componentMod.setup ? componentMod.setup(data.state) : {}),
        };

        const layoutStates: RenderState[] = [];
        for (let i = 0; i < (data.layoutStates || []).length; i++) {
          const layoutMod = layoutMods[i];
          const s = data.layoutStates[i];
          const layoutState = {
            ...s,
            ...(layoutMod && layoutMod.setup ? layoutMod.setup(s) : {}),
          };
          layoutStates.push(layoutState);
        }

        const combinedState = { ...pageState };
        for (const s of layoutStates) {
          Object.assign(combinedState, s);
        }

        const combinedRender = (state: RenderState = {}) => {
          let html = componentMod.render ? componentMod.render(state) : "";
          for (let i = layoutMods.length - 1; i >= 0; i--) {
            const layoutMod = layoutMods[i];
            if (layoutMod) {
              const layoutStateForRender = { ...state, ...layoutStates[i] };
              html = layoutMod.render
                ? layoutMod.render(layoutStateForRender, { default: () => html })
                : html;
            }
          }
          return html;
        };

        const temp = document.createElement("div");
        temp.innerHTML = extractAppHtml(combinedRender(combinedState));

        const oldLoader = appContainer.querySelector(".loader-wrap");
        if (oldLoader) {
          oldLoader.remove();
        }
        const newLoader = temp.querySelector(".loader-wrap");
        if (newLoader) {
          newLoader.remove();
        }

        const oldChildren = Array.from(appContainer.childNodes);
        const newChildren = Array.from(temp.childNodes);
        const maxLen = Math.max(oldChildren.length, newChildren.length);
        for (let i = 0; i < maxLen; i++) {
          const oldChild = oldChildren[i];
          const newChild = newChildren[i];
          if (oldChild === undefined && newChild !== undefined) {
            appContainer.appendChild(newChild.cloneNode(true));
          } else if (newChild === undefined && oldChild !== undefined) {
            appContainer.removeChild(oldChild);
          } else if (oldChild !== undefined && newChild !== undefined) {
            morph(oldChild, newChild);
          }
        }

        activePageInstance = hydrate(
          appContainer,
          {
            setup: () => combinedState,
            render: combinedRender,
            css: componentMod.css || "",
            componentId: data.componentId || "page",
          },
          combinedState
        );

        // Dispatch load event to let external scripts know navigation occurred
        window.dispatchEvent(new Event("load"));
      }
    })
    .catch((err) => {
      KalloLogger.error(`Navigation error, falling back: ${err}`);
      window.location.href = href;
    });
}

if (typeof window !== "undefined") {
  window.addEventListener("click", (e) => {
    let target = e.target as HTMLElement | null;
    while (target && target.tagName !== "A") {
      target = target.parentElement;
    }
    if (target && target.tagName === "A") {
      const href = target.getAttribute("href");
      if (
        href &&
        href.startsWith("/") &&
        !href.startsWith("//") &&
        !target.hasAttribute("download") &&
        target.getAttribute("target") !== "_blank" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();
        navigateTo(href);
      }
    }
  });

  window.addEventListener("popstate", () => {
    navigateTo(window.location.pathname, false);
  });

  const prefetchOnIntent = (e: Event) => {
    // Static sites have no SSR navigation endpoint to prefetch against.
    if (isStaticMode()) return;
    let target = e.target as HTMLElement | null;
    while (target && target.tagName !== "A") {
      target = target.parentElement;
    }
    if (target && target.tagName === "A") {
      const href = target.getAttribute("href");
      if (
        isInternalHref(href) &&
        shouldPrefetch(target) &&
        target.getAttribute("target") !== "_blank" &&
        !target.hasAttribute("download")
      ) {
        prefetch(href);
      }
    }
  };
  window.addEventListener("mouseover", prefetchOnIntent);
  window.addEventListener("touchstart", prefetchOnIntent, { passive: true });
}
