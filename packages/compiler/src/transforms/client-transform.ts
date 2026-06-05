import type { KalloASTNode } from "@kallo/types";

export function transformClient(node: KalloASTNode): string {
  // Extract imports to place them at the top level
  const imports: string[] = [];
  const cleanContent = node.content.replace(
    /import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g,
    (match) => {
      imports.push(match);
      return "";
    },
  );

  // Find all declared variable and function names at the top level of client block
  const declaredNames = new Set<string>();

  // Match: const name = ..., let name = ..., var name = ...
  const varRegex = /\b(const|let|var)\s+([a-zA-Z0-9_$]+)\b/g;
  let match;
  while ((match = varRegex.exec(cleanContent)) !== null) {
    if (match[2]) {
      declaredNames.add(match[2]);
    }
  }

  // Match: function name(...)
  const fnRegex = /\bfunction\s+([a-zA-Z0-9_$]+)\b/g;
  while ((match = fnRegex.exec(cleanContent)) !== null) {
    if (match[1]) {
      declaredNames.add(match[1]);
    }
  }

  const returnObject = Array.from(declaredNames).join(", ");
  const returnItems = returnObject ? `...props, ${returnObject}` : "...props";
  const setupFunction = `export function setup(props = {}) {\n${cleanContent.trim()}\n  return { ${returnItems} };\n}`;

  const header = imports.length > 0 ? imports.join("\n") + "\n\n" : "";
  return `${header}// === Client Block ===\n${setupFunction}\n`;
}
