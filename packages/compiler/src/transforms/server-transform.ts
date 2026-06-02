import type { PomeloASTNode } from "@pomelo/types";

export function transformServer(node: PomeloASTNode): string {
  return `// === Server Block ===\n${node.content}\n`;
}
