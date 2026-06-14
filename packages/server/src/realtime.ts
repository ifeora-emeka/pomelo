import type { Request, Response, Router } from "express";

export type ChannelListener<T> = (data: T) => void;

export class Channel<T = unknown> {
  readonly name: string;
  private listeners = new Set<ChannelListener<T>>();
  private last: T | undefined;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * publish — broadcasts data to every current subscriber and remembers it as
   * the last value (replayed to late SSE subscribers so they aren't blank).
   */
  publish(data: T): void {
    this.last = data;
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  subscribe(listener: ChannelListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get lastValue(): T | undefined {
    return this.last;
  }

  size(): number {
    return this.listeners.size;
  }
}

const channels = new Map<string, Channel>();

/**
 * $channel — server-side realtime primitive over SSE. Returns a get-or-create
 * named channel; call `.publish(data)` from an $action or anywhere on the server
 * and every connected client `$subscribe`d to that name receives the update.
 *
 * Usage (in a <Server> block or *.action.ts):
 *   $channel("tasks").publish(await TaskService.all());
 */
export function $channel<T = unknown>(name: string): Channel<T> {
  let channel = channels.get(name) as Channel<T> | undefined;
  if (!channel) {
    channel = new Channel<T>(name);
    channels.set(name, channel as Channel);
  }
  return channel;
}

export function clearChannels(): void {
  channels.clear();
}

export function serializeChannelEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * registerChannelRoute — mounts the SSE endpoint the Kallo client `$subscribe`
 * connects to (GET /__kallo/channel/:name). On connect the channel's last value
 * is replayed, then every `publish` is streamed until the client disconnects.
 */
export function registerChannelRoute(
  router: Router,
  mountPath = "/__kallo/channel/:name",
): void {
  router.get(mountPath, (req: Request, res: Response) => {
    const name = req.params.name as string;
    const channel = $channel(name);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    if (channel.lastValue !== undefined) {
      res.write(serializeChannelEvent(channel.lastValue));
    }

    const unsubscribe = channel.subscribe((data) => {
      res.write(serializeChannelEvent(data));
    });

    req.on("close", () => {
      unsubscribe();
    });
  });
}
