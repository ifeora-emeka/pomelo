import type { PomeloASTNode } from "@pomelo/types";

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
    return `${selector}[data-pom-${componentId}]`;
  });
  return content;
}
