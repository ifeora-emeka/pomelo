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
  // `$staticParams`/`$paths` enumerate the concrete params for a dynamic route
  // at build time (the `generateStaticParams` equivalent). They are aliases, so
  // only the FIRST occurrence becomes the exported const — a second use (e.g.
  // someone writing both aliases) is turned into a discarded local instead of a
  // duplicate `export const`, which would be a SyntaxError at import time.
  // Must run before the `$static` rule below (although `\$static\s*\(` cannot
  // match `$staticParams(`, keeping this first avoids future footguns).
  let staticParamsSeen = 0;
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$(?:staticParams|paths)\s*\(/g,
    () =>
      staticParamsSeen++ === 0
        ? "export const $serverStaticParams = ("
        : "const $unusedStaticParams = (",
  );
  content = content.replace(
    /(?<![a-zA-Z0-9_$])\$static\s*\(/g,
    "export const $serverStatic = (",
  );

  return `// === Server Block ===\n${ABORT_HELPER}${content}\n// === End Server Block ===\n`;
}
