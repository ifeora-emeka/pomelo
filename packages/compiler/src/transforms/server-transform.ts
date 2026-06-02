import type { PomeloASTNode } from "@pomelo/types";

const ABORT_HELPER = `const $abort = (statusCode, message) => { const e = Object.assign(new Error(message || "Pomelo Abort"), { statusCode, isPomeloAbort: true }); throw e; };\n`;

export function transformServer(node: PomeloASTNode): string {
  let content = node.content;

  // Rewrite definition keywords to exports
  content = content.replace(/(?<![a-zA-Z0-9_$])\$page\s*\(/g, "export const $serverPage = (");
  content = content.replace(/(?<![a-zA-Z0-9_$])\$meta\s*\(/g, "export const $serverMeta = (");
  content = content.replace(/(?<![a-zA-Z0-9_$])\$guard\s*\(/g, "export const $serverGuard = (");
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$layout\s*\(/g,
    "export const $serverLayout = (",
  );

  return `// === Server Block ===\n${ABORT_HELPER}${content}\n`;
}
