import { PomeloLogger } from "@pomelo/shared";

export function mountElement(parent: unknown, html: string): void {
  PomeloLogger.info("Mounting view component...");
  if (parent && typeof parent === "object" && "innerHTML" in parent) {
    (parent as { innerHTML: string }).innerHTML = html;
  }
}
