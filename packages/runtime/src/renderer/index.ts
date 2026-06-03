import type { Readable } from "node:stream";

export function renderToString(renderFn: () => string): string {
  return renderFn();
}

export function renderToStream(renderFn: () => string): Readable {
  const { Readable: ReadableStream } =
    require("node:stream") as typeof import("node:stream");
  const html = renderFn();
  const stream = new ReadableStream({
    read() {
      this.push(html);
      this.push(null);
    },
  });
  return stream;
}
