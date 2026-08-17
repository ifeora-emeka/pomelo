/**
 * Static-mode compatibility linter.
 *
 * Flags features that cannot work on a static host (no runtime server). The
 * same checks run as *warnings* during `kallo dev` when `output: "static"` and
 * as *errors* during `kallo export` (unless `export.failOnServerFeature` is
 * false). Detection is a lightweight scan of `<Server>` blocks — no runtime.
 */
import fs from "node:fs";
import path from "node:path";

export type LintSeverity = "error" | "warn";

export interface LintIssue {
  severity: LintSeverity;
  code: string;
  message: string;
  file: string;
  line: number;
}

interface Rule {
  keyword: string;
  severity: LintSeverity;
  message: string;
}

// Server-only `$keyword`s. `error` = genuinely broken in a static build,
// `warn` = degraded / no-op but the page still renders.
const SERVER_ONLY_RULES: Rule[] = [
  { keyword: "$guard", severity: "error", message: "$guard runs per request; there is no server to enforce it in a static build. Move auth to the client." },
  { keyword: "$requireAuth", severity: "error", message: "$requireAuth needs a server session; unavailable in a static build." },
  { keyword: "$roles", severity: "error", message: "$roles needs a server session; unavailable in a static build." },
  { keyword: "$currentUser", severity: "error", message: "$currentUser reads the server session; always empty in a static build." },
  { keyword: "$session", severity: "error", message: "$session is server-only; unavailable in a static build." },
  { keyword: "$cookies", severity: "error", message: "$cookies reads/writes per-request cookies; unavailable in a static build." },
  { keyword: "$csrf", severity: "error", message: "$csrf requires a server; unavailable in a static build." },
  { keyword: "$rateLimit", severity: "error", message: "$rateLimit requires a server; unavailable in a static build." },
  { keyword: "$uploads", severity: "error", message: "$uploads requires a server endpoint; unavailable in a static build." },
  { keyword: "$channel", severity: "error", message: "$channel (realtime) requires a server; unavailable in a static build." },
  { keyword: "$headers", severity: "warn", message: "$headers has no effect in a static build (headers are set by your host)." },
  { keyword: "$redirect", severity: "warn", message: "$redirect runs at build time only; it cannot react to the request. Prefer a client redirect or host-level rules." },
  { keyword: "$revalidate", severity: "warn", message: "$revalidate/ISR has no effect in a static build; pages are rendered once at export time." },
];

const SERVER_BLOCK_RE = /<Server[^>]*>([\s\S]*?)<\/Server>/i;

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

/** Lint a single .kal file's `<Server>` block for static-incompatible APIs. */
export function lintKalForStatic(filePath: string, content: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const match = SERVER_BLOCK_RE.exec(content);
  if (!match || !match[1]) return issues;
  const serverBlock = match[1];
  const blockStart = match.index + match[0].indexOf(match[1]);

  for (const rule of SERVER_ONLY_RULES) {
    const re = new RegExp(
      `(?<![a-zA-Z0-9_$])\\${rule.keyword}(?![a-zA-Z0-9_$])`,
      "g",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(serverBlock)) !== null) {
      issues.push({
        severity: rule.severity,
        code: rule.keyword.slice(1),
        message: rule.message,
        file: filePath,
        line: lineOf(content, blockStart + m.index),
      });
      break; // one issue per keyword per file is enough
    }
  }
  return issues;
}

/** Recursively find all `.kal` files under a directory. */
function findKalFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findKalFiles(full, acc);
    else if (entry.name.endsWith(".kal")) acc.push(full);
  }
  return acc;
}

export interface ProjectLintResult {
  errors: LintIssue[];
  warnings: LintIssue[];
}

/**
 * Lint an entire project for static-export compatibility. Scans every `.kal`
 * under `src/view` and flags the presence of `src/api` routes.
 */
export function lintProjectForStatic(cwd = process.cwd()): ProjectLintResult {
  const viewDir = path.join(cwd, "src/view");
  const issues: LintIssue[] = [];

  for (const file of findKalFiles(viewDir)) {
    issues.push(...lintKalForStatic(file, fs.readFileSync(file, "utf-8")));
  }

  const apiDir = path.join(cwd, "src/api");
  if (fs.existsSync(apiDir)) {
    const hasApi = findApiFiles(apiDir);
    if (hasApi) {
      issues.push({
        severity: "error",
        code: "api-routes",
        message:
          "src/api routes require a running server and are not exported. Call an external API from the client, or use export.exclude for a hybrid deploy.",
        file: apiDir,
        line: 0,
      });
    }
  }

  return {
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warn"),
  };
}

/** Any non-declaration .ts/.js under src/api means the app ships a server API. */
function findApiFiles(dir: string): boolean {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (findApiFiles(full)) return true;
    } else if (/\.(ts|js|mts|mjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      return true;
    }
  }
  return false;
}

/** Format an issue for terminal output. */
export function formatIssue(issue: LintIssue): string {
  const loc = issue.line > 0 ? `${issue.file}:${issue.line}` : issue.file;
  return `  [${issue.code}] ${loc}\n    ${issue.message}`;
}
