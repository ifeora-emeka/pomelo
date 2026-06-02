import type { PomeloASTNode } from "@pomelo/types";

export function transformClient(node: PomeloASTNode): string {
  return `// === Client Block ===\n${node.content}\n`;
}
