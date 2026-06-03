import test from "node:test";
import assert from "node:assert";
import { $store, $local } from "./index.js";

// Mock localStorage in global scope for testing
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  },
};

globalThis.window = {
  localStorage: mockLocalStorage,
  dispatchEvent: (event: any) => {
    eventsDispatched.push(event);
    return true;
  },
} as any;

const eventsDispatched: any[] = [];

test("Store persistence options correctly save and load from localStorage", () => {
  // Clear any existing storage values
  mockLocalStorage.clear();

  // Create store with persistence
  const cart = $store(
    { items: [] as string[] },
    { persist: true, persistKey: "my-cart" },
  );

  // Update store state
  cart.items.push("apple");

  // Verify it was persisted to localStorage
  const saved = mockLocalStorage.getItem("my-cart");
  assert.ok(saved);
  assert.deepStrictEqual(JSON.parse(saved), { items: ["apple"] });

  // Create a second store instance with same key
  const secondCart = $store(
    { items: [] as string[] },
    { persist: true, persistKey: "my-cart" },
  );

  // It should restore the saved state
  assert.deepStrictEqual(JSON.parse(JSON.stringify(secondCart.items)), [
    "apple",
  ]);
});

test("Reactivity updates emit pomelo:devtools custom events on window", () => {
  eventsDispatched.length = 0;

  // Emit store setup
  const store = $store({ value: 1 }, { persistKey: "test-store" });
  assert.ok(eventsDispatched.length > 0);
  assert.strictEqual(eventsDispatched[0].type, "pomelo:devtools");
  assert.deepStrictEqual(eventsDispatched[0].detail, {
    type: "store",
    name: "test-store",
    state: { value: 1 },
  });

  // Emit store updates
  eventsDispatched.length = 0;
  store.value = 42;
  assert.strictEqual(eventsDispatched[0].type, "pomelo:devtools");
  assert.deepStrictEqual(eventsDispatched[0].detail, {
    type: "store",
    name: "test-store",
    state: { value: 42 },
  });
});
