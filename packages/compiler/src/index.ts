import { parsePomelo } from "@pomelo/parser";
import { logInfo } from "@pomelo/shared";

export function compilePomelo(source: string): string {
  logInfo("Starting compilation...");
  const ast = parsePomelo(source);
  return `// Compiled Pomelo Component\nexport default { type: "${ast.type}", value: "${ast.content}" };`;
}
