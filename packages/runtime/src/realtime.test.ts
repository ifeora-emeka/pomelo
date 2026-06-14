import test from "node:test";
import assert from "node:assert";
import { $local } from "./reactivity/index.js";
import { applyChannelMessage, $subscribe } from "./realtime.js";

test("applyChannelMessage parses JSON and writes the reactive value", () => {
  const state = $local<{ count: number } | null>(null);
  const ok = applyChannelMessage(state, '{"count":3}');
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(state.get(), { count: 3 });
});

test("applyChannelMessage ignores malformed payloads", () => {
  const state = $local<number>(1);
  const ok = applyChannelMessage(state, "not json");
  assert.strictEqual(ok, false);
  assert.strictEqual(state.get(), 1);
});

test("$subscribe returns a reactive at its initial value without EventSource", () => {
  const sub = $subscribe<number[]>("tasks", { initial: [] });
  assert.deepStrictEqual(sub.get(), []);
  assert.strictEqual(typeof sub.close, "function");
  sub.close();
});
