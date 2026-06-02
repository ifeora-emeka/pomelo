import type { PomeloASTNode } from "@pomelo/types";
import { SCOPED_CSS_PREFIX } from "@pomelo/shared";

export function transformStyle(
  node: PomeloASTNode,
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
