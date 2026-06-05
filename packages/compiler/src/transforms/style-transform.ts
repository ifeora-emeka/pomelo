import type { KalloASTNode } from "@kallo/types";
import { SCOPED_CSS_PREFIX } from "@kallo/shared";

export function transformStyle(
  node: KalloASTNode,
  componentId: string,
): string {
  const content = node.content.replace(/([^\r\n,{}]+)(?=\s*\{)/g, (match) => {
    const selector = match.trim();
    if (
      selector.startsWith("@") ||
      selector.startsWith("from") ||
      selector.startsWith("to")
    ) {
      return match;
    }
    return `${selector}[${SCOPED_CSS_PREFIX}${componentId}]`;
  });
  return content;
}
