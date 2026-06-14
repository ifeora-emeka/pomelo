import test from "node:test";
import assert from "node:assert";
import {
  $channel,
  clearChannels,
  serializeChannelEvent,
  registerChannelRoute,
} from "./realtime.js";

test("$channel is get-or-create by name", () => {
  clearChannels();
  const a = $channel("tasks");
  const b = $channel("tasks");
  const c = $channel("other");
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test("Channel publishes to all subscribers and tracks size", () => {
  clearChannels();
  const ch = $channel<number>("nums");
  const received: number[] = [];
  const off1 = ch.subscribe((n) => received.push(n));
  ch.subscribe((n) => received.push(n * 10));
  assert.strictEqual(ch.size(), 2);

  ch.publish(5);
  assert.deepStrictEqual(received.sort((x, y) => x - y), [5, 50]);

  off1();
  assert.strictEqual(ch.size(), 1);
});

test("Channel remembers last value for late subscribers", () => {
  clearChannels();
  const ch = $channel<string>("status");
  ch.publish("online");
  assert.strictEqual(ch.lastValue, "online");
});

test("serializeChannelEvent emits SSE data frame", () => {
  assert.strictEqual(
    serializeChannelEvent({ a: 1 }),
    'data: {"a":1}\n\n',
  );
});

test("registerChannelRoute streams publishes and replays last value", () => {
  clearChannels();
  const ch = $channel<{ n: number }>("live");
  ch.publish({ n: 1 });

  const writes: string[] = [];
  let closeHandler: (() => void) | undefined;
  const fakeRes = {
    setHeader() {},
    flushHeaders() {},
    write(chunk: string) {
      writes.push(chunk);
    },
  };
  const fakeReq = {
    params: { name: "live" },
    on(event: string, cb: () => void) {
      if (event === "close") closeHandler = cb;
    },
  };

  let handler:
    | ((req: unknown, res: unknown) => void)
    | undefined;
  const fakeRouter = {
    get(_path: string, h: (req: unknown, res: unknown) => void) {
      handler = h;
    },
  };

  registerChannelRoute(fakeRouter as never);
  assert.ok(handler);
  handler!(fakeReq, fakeRes);

  // Replayed last value on connect.
  assert.strictEqual(writes[0], 'data: {"n":1}\n\n');
  assert.strictEqual(ch.size(), 1);

  ch.publish({ n: 2 });
  assert.strictEqual(writes[1], 'data: {"n":2}\n\n');

  closeHandler?.();
  assert.strictEqual(ch.size(), 0);
});
