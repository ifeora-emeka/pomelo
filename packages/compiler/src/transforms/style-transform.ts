import type { KalloASTNode } from "@kallojs/types";
import { SCOPED_CSS_PREFIX } from "@kallojs/shared";

function scopeSelector(selector: string, componentId: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("@") ||
    trimmed.startsWith("from") ||
    trimmed.startsWith("to")
  ) {
    return selector;
  }

  const parts = trimmed.split(/\s+/);
  const scopedParts = parts.map((part) => {
    const globalMatch = part.match(/:global\(([^)]+)\)/);
    if (globalMatch) {
      return part.replace(/:global\(([^)]+)\)/, "$1");
    }

    const colonIndex = part.indexOf(":");
    if (colonIndex !== -1) {
      const base = part.slice(0, colonIndex);
      const pseudo = part.slice(colonIndex);
      return `${base}[${SCOPED_CSS_PREFIX}${componentId}]${pseudo}`;
    }

    return `${part}[${SCOPED_CSS_PREFIX}${componentId}]`;
  });

  return scopedParts.join(" ");
}

export function transformStyle(
  node: KalloASTNode,
  componentId: string,
): string {
  if (
    node.attributes &&
    (node.attributes.global !== undefined || node.attributes.scoped === "false")
  ) {
    return node.content;
  }

  const content = node.content.replace(/([^\r\n{}]+)(?=\s*\{)/g, (match) => {
    const selectorList = match.split(",");
    const scopedList = selectorList.map((sel) => scopeSelector(sel, componentId));
    return scopedList.join(", ");
  });

  return content;
}
