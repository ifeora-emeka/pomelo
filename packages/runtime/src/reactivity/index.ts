import type { ReactiveState, StoreOptions } from "@kallo/types";

let activeEffect: (() => void) | null = null;
let activeSubscriptions: Set<Signal<any>> | null = null;
let batchDepth = 0;
const pendingEffects = new Set<() => void>();
let signalIdCounter = 0;

interface KalloDevtoolsHook {
  emit?: (event: string, payload: unknown) => void;
}

function notifyDevtools(type: "store" | "signal", name: string, state: any) {
  if (typeof window === "undefined") return;
  // Only pay the serialization/dispatch cost when devtools are attached.
  const hook = (window as { __KALLO_DEVTOOLS__?: KalloDevtoolsHook })
    .__KALLO_DEVTOOLS__;
  if (!hook) return;
  const event = new CustomEvent("kallo:devtools", {
    detail: { type, name, state: JSON.parse(JSON.stringify(state)) },
  });
  window.dispatchEvent(event);
  if (typeof hook.emit === "function") {
    hook.emit("change", { type, name, state });
  }
}

function enqueueEffect(sub: () => void) {
  if (batchDepth > 0) {
    pendingEffects.add(sub);
  } else {
    sub();
  }
}

function flushPending() {
  const effects = Array.from(pendingEffects);
  pendingEffects.clear();
  for (const effect of effects) {
    effect();
  }
}

export function $batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushPending();
    }
  }
}

export class Signal<T> implements ReactiveState<T> {
  private _value: T;
  private subscribers = new Set<() => void>();
  private name: string;

  constructor(initialValue: T) {
    this._value = initialValue;
    this.name = `signal-${++signalIdCounter}`;
    notifyDevtools("signal", this.name, this._value);
  }

  get value(): T {
    if (activeEffect) {
      this.subscribers.add(activeEffect);
      if (activeSubscriptions) {
        activeSubscriptions.add(this as Signal<any>);
      }
    }
    return this._value;
  }

  set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue;
      notifyDevtools("signal", this.name, this._value);
      this.notify();
    }
  }

  get(): T {
    return this.value;
  }

  set(newValue: T): void {
    this.value = newValue;
  }

  private notify() {
    for (const sub of this.subscribers) {
      enqueueEffect(sub);
    }
  }

  unsubscribe(fn: () => void) {
    this.subscribers.delete(fn);
  }
}

export function $local<T>(initialValue: T): ReactiveState<T> {
  return new Signal(initialValue);
}

export function $watch<T>(
  state: ReactiveState<T>,
  cb: (val: T) => void,
): () => void {
  const signal = state as Signal<T>;
  const effectFn = () => {
    cb(signal.value);
  };
  const previousEffect = activeEffect;
  activeEffect = effectFn;
  try {
    effectFn();
  } finally {
    activeEffect = previousEffect;
  }
  return () => signal.unsubscribe(effectFn);
}

export function $effect(cb: () => void): () => void {
  const subscriptions = new Set<Signal<any>>();
  const effectFn = () => {
    activeEffect = effectFn;
    activeSubscriptions = subscriptions;
    try {
      cb();
    } finally {
      activeEffect = null;
      activeSubscriptions = null;
    }
  };
  effectFn();
  return () => {
    for (const signal of subscriptions) {
      signal.unsubscribe(effectFn);
    }
    subscriptions.clear();
  };
}

export function $computed<T>(fn: () => T): ReactiveState<T> {
  const signal = new Signal<T>(undefined as any);
  $effect(() => {
    signal.value = fn();
  });
  return signal;
}

export function $store<T extends object>(
  initialObj: T,
  options?: StoreOptions,
): T {
  const subscribers = new Set<() => void>();
  const state = Object.create(
    Object.getPrototypeOf(initialObj),
    Object.getOwnPropertyDescriptors(initialObj),
  );

  // Persistence requires an explicit, stable key. Without one, multiple
  // persisted stores would clobber each other under a shared default key, so
  // we disable persistence rather than silently corrupt state.
  let persist = !!options?.persist;
  const persistKey = options?.persistKey;
  if (persist && !persistKey) {
    if (typeof console !== "undefined") {
      console.warn(
        "[Kallo] $store({ persist: true }) requires an explicit persistKey. Persistence disabled for this store.",
      );
    }
    persist = false;
  }
  const storeLabel = persistKey || "kallo-store";

  if (persist && typeof window !== "undefined" && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(persistKey!);
      if (saved) {
        Object.assign(state, JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load persisted store state", e);
    }
  }

  const notifyChange = () => {
    if (persist && typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(persistKey!, JSON.stringify(state));
      } catch (e) {
        console.error("Failed to persist store state", e);
      }
    }
    notifyDevtools("store", storeLabel, state);
    for (const sub of subscribers) {
      enqueueEffect(sub);
    }
  };

  // Cache nested proxies so repeated reads return a stable reference and we
  // don't allocate a fresh Proxy on every property access (hot path).
  const proxyCache = new WeakMap<object, object>();
  const createDeepProxy = <U extends object>(obj: U): U => {
    const cached = proxyCache.get(obj);
    if (cached) return cached as U;
    const proxied = new Proxy(obj, {
      get(target, key, receiver) {
        if (activeEffect) {
          subscribers.add(activeEffect);
        }
        const val = Reflect.get(target, key, receiver);
        if (typeof val === "object" && val !== null) {
          return createDeepProxy(val);
        }
        if (typeof val === "function") {
          return val.bind(receiver);
        }
        return val;
      },
      set(target, key, value, receiver) {
        const oldVal = Reflect.get(target, key, receiver);
        if (oldVal !== value) {
          Reflect.set(target, key, value, receiver);
          notifyChange();
        }
        return true;
      },
      deleteProperty(target, key) {
        const res = Reflect.deleteProperty(target, key);
        notifyChange();
        return res;
      },
    });
    proxyCache.set(obj, proxied);
    return proxied as U;
  };

  const proxy = createDeepProxy(state);
  notifyDevtools("store", storeLabel, state);
  return proxy;
}

export function $use<T>(store: T): T {
  return store;
}
