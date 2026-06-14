import { Readable } from "node:stream";

export function renderToString(renderFn: () => string): string {
  return renderFn();
}

/**
 * Renders to a Node stream. Accepts either a synchronous renderer or one that
 * yields HTML chunks, so large documents can be flushed incrementally instead
 * of buffering the whole response in memory.
 */
export function renderToStream(
  renderFn: () => string | Iterable<string> | AsyncIterable<string>,
): Readable {
  const result = renderFn();
  if (typeof result === "string") {
    return Readable.from([result]);
  }
  return Readable.from(result as Iterable<string> | AsyncIterable<string>);
}
