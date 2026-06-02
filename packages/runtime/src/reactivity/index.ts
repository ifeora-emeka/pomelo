import type { ReactiveState } from "@pomelo/types";

let activeEffect: (() => void) | null = null;
let batchDepth = 0;
const pendingEffects = new Set<() => void>();

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

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    if (activeEffect) {
      this.subscribers.add(activeEffect);
    }
    return this._value;
  }

  set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue;
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

export function $watch<T>(state: ReactiveState<T>, cb: (val: T) => void): () => void {
  const signal = state as Signal<T>;
  const effectFn = () => {
    cb(signal.value);
  };
  activeEffect = effectFn;
  effectFn();
  activeEffect = null;
  return () => signal.unsubscribe(effectFn);
}

export function $effect(cb: () => void): () => void {
  const effectFn = () => {
    activeEffect = effectFn;
    try {
      cb();
    } finally {
      activeEffect = null;
    }
  };
  effectFn();
  return effectFn;
}

export function $computed<T>(fn: () => T): ReactiveState<T> {
  const signal = new Signal<T>(undefined as any);
  $effect(() => {
    signal.value = fn();
  });
  return signal;
}

export function $store<T extends object>(initialObj: T): T {
  const subscribers = new Set<() => void>();
  return new Proxy(initialObj, {
    get(target, key, receiver) {
      if (activeEffect) {
        subscribers.add(activeEffect);
      }
      const val = Reflect.get(target, key, receiver);
      if (typeof val === "function") {
        return val.bind(receiver);
      }
      return val;
    },
    set(target, key, value, receiver) {
      const oldVal = Reflect.get(target, key, receiver);
      if (oldVal !== value) {
        Reflect.set(target, key, value, receiver);
        for (const sub of subscribers) {
          enqueueEffect(sub);
        }
      }
      return true;
    },
  });
}

export function $use<T>(store: T): T {
  return store;
}
