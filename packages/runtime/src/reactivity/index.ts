import type { ReactiveState } from "@pomelo/types";

let activeEffect: (() => void) | null = null;

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
      this.subscribers.forEach((sub) => sub());
    }
  }

  get(): T {
    return this.value;
  }

  set(newValue: T): void {
    this.value = newValue;
  }
}

export function $local<T>(initialValue: T): ReactiveState<T> {
  return new Signal(initialValue);
}

export function $watch<T>(state: ReactiveState<T>, cb: (val: T) => void): void {
  const signal = state as Signal<T>;
  const effectFn = () => {
    cb(signal.value);
  };
  activeEffect = effectFn;
  effectFn(); // Invoke immediately to collect deps and set initial value
  activeEffect = null;
}
