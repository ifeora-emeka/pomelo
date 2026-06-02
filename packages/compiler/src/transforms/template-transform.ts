import type { PomeloASTNode } from "@pomelo/types";

export function transformTemplate(
  node: PomeloASTNode,
  componentId: string,
): string {
  const content = node.content.replace(
    /<([a-zA-Z0-9-]+)(?=\s|>)/g,
    `<$1 data-pom-${componentId}`,
  );
  return `export function render() {\n  return \`${content}\`;\n}\n`;
}
