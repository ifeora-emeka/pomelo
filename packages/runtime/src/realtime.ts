import type { ReactiveState } from "@kallojs/types";
import { $local } from "./reactivity/index.js";

export interface SubscribeOptions<T> {
  initial?: T;
  path?: string;
}

export interface ChannelSubscription<T> extends ReactiveState<T> {
  close(): void;
}

/**
 * applyChannelMessage — parses one raw SSE message payload and writes it into
 * the reactive value. Malformed JSON is ignored so a bad frame never throws into
 * the EventSource callback. Exposed for testing the parse/apply path headlessly.
 */
export function applyChannelMessage<T>(
  state: ReactiveState<T>,
  raw: string,
): boolean {
  try {
    state.set(JSON.parse(raw) as T);
    return true;
  } catch {
    return false;
  }
}

/**
 * $subscribe — client realtime primitive. Connects to a server `$channel` over
 * SSE and returns a reactive value that updates as the server publishes. Use it
 * like any reactive: read `.get()` in the template / effects. Call `.close()` to
 * disconnect. In a non-browser environment it stays at its initial value.
 *
 * Usage (in a <Client> block):
 *   const tasks = $subscribe("tasks", { initial: [] });
 */
export function $subscribe<T>(
  name: string,
  options: SubscribeOptions<T> = {},
): ChannelSubscription<T> {
  const state = $local(options.initial as T) as ReactiveState<T>;
  const path = options.path ?? `/__kallo/channel/${encodeURIComponent(name)}`;

  let source: EventSource | null = null;
  if (typeof EventSource !== "undefined") {
    source = new EventSource(path);
    source.onmessage = (event: MessageEvent) => {
      applyChannelMessage(state, String(event.data));
    };
  }

  const subscription = state as ChannelSubscription<T>;
  subscription.close = () => {
    if (source) {
      source.close();
      source = null;
    }
  };
  return subscription;
}
