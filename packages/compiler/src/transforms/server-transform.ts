import type { KalloASTNode } from "@kallojs/types";

const ABORT_HELPER = `const $abort = (statusCode, message) => { const e = Object.assign(new Error(message || "Kallo Abort"), { statusCode, isKalloAbort: true }); throw e; };\n`;

export function transformServer(node: KalloASTNode): string {
  let content = node.content;

  // Rewrite definition keywords to exports
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$page\s*\(/g,
    "export const $serverPage = (",
  );
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$meta\s*\(/g,
    "export const $serverMeta = (",
  );
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$guard\s*\(/g,
    "export const $serverGuard = (",
  );
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$layout\s*\(/g,
    "export const $serverLayout = (",
  );
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$static\s*\(/g,
    "export const $serverStatic = (",
  );

  return `// === Server Block ===\n${ABORT_HELPER}${content}\n// === End Server Block ===\n`;
}
