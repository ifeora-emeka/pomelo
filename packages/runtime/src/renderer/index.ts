import { PomeloLogger } from "@pomelo/shared";

export function renderToString(renderFn: () => string): string {
  PomeloLogger.info("Rendering component to static HTML string...");
  return renderFn();
}
