import { logInfo } from "@pomelo/shared";

export function createLocalState<T>(initialValue: T) {
  logInfo("Initializing local state...");
  return {
    value: initialValue,
    get() {
      return this.value;
    },
    set(newValue: T) {
      this.value = newValue;
    }
  };
}
