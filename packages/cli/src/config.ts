import type { FrameworkConfig, ResolvedKalloConfig } from "@kallojs/types";
import { KalloLogger } from "@kallojs/shared";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_BASENAMES = [
  "kallo.config.ts",
  "kallo.config.js",
  "kallo.config.mjs",
];

/** Locate the project's kallo.config file, if any. */
export function findConfigFile(cwd = process.cwd()): string | null {
  for (const name of CONFIG_BASENAMES) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function normalizeBasePath(input: string | undefined): string {
  if (!input) return "";
  let bp = input.trim();
  if (bp === "" || bp === "/") return "";
  if (!bp.startsWith("/")) bp = "/" + bp;
  // No trailing slash — asset URLs are always joined as `${basePath}/...`.
  bp = bp.replace(/\/+$/, "");
  return bp;
}

/**
 * Apply defaults to a raw (possibly partial) FrameworkConfig, producing a fully
 * resolved config the exporter and dev/build commands can rely on.
 */
export function resolveConfig(raw: Partial<FrameworkConfig>): ResolvedKalloConfig {
  const output = raw.output === "static" ? "static" : "server";
  const basePath = normalizeBasePath(raw.basePath);
  // assetPrefix defaults to basePath; if explicitly set, normalize the same way
  // unless it's an absolute origin (http[s]:// or //cdn...).
  let assetPrefix = raw.assetPrefix;
  if (assetPrefix && /^(https?:)?\/\//i.test(assetPrefix)) {
    assetPrefix = assetPrefix.replace(/\/+$/, "");
  } else {
    assetPrefix =
      assetPrefix !== undefined ? normalizeBasePath(assetPrefix) : basePath;
  }

  return {
    name: raw.name ?? "Kallo App",
    version: raw.version ?? "0.0.0",
    port: raw.port ?? 3000,
    env: raw.env,
    cors: raw.cors,
    auth: raw.auth,
    plugins: raw.plugins,
    output,
    outDir: raw.outDir?.trim() || "out",
    basePath,
    assetPrefix,
    trailingSlash: raw.trailingSlash ?? false,
    export: {
      include: raw.export?.include ?? [],
      exclude: raw.export?.exclude ?? [],
      fallback: raw.export?.fallback ?? "spa",
      failOnServerFeature: raw.export?.failOnServerFeature ?? true,
    },
    images: {
      unoptimized: raw.images?.unoptimized ?? output === "static",
      domains: raw.images?.domains ?? [],
    },
  };
}

/**
 * Import a config file, transpiling TypeScript on the fly so the published CLI
 * works under plain Node (no tsx/ts-node needed). `.js`/`.mjs` are imported
 * directly; `.ts` is transpiled to a sibling `.mjs` in `.kallo/` (so bare
 * imports like `@kallojs/server` still resolve from the project) and imported.
 */
async function importConfigModule(file: string): Promise<unknown> {
  const bust = `?t=${Date.now()}`;
  if (!file.endsWith(".ts")) {
    return import(pathToFileURL(file).href + bust);
  }
  const source = fs.readFileSync(file, "utf-8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: file,
  });
  // Emit the transpiled module NEXT TO the original config so any relative
  // imports inside it resolve against the same directory. Clean it up after.
  const tmpFile = path.join(
    path.dirname(file),
    `.kallo.config.${process.pid}.mjs`,
  );
  fs.writeFileSync(tmpFile, outputText);
  try {
    return await import(pathToFileURL(tmpFile).href + bust);
  } finally {
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch {
      /* best effort */
    }
  }
}

/**
 * Load and resolve the project's kallo.config file. Missing config is fine —
 * defaults are returned. When `strict` is set (used by `kallo export`), a
 * malformed/throwing config is a hard error instead of a silent fallback, so a
 * broken config never ships the wrong site.
 */
export async function loadConfig(
  cwd = process.cwd(),
  strict = false,
): Promise<ResolvedKalloConfig> {
  const file = findConfigFile(cwd);
  if (!file) {
    return resolveConfig({});
  }
  try {
    const mod = (await importConfigModule(file)) as Record<string, unknown>;
    const raw = (mod.default ?? mod.config ?? mod) as Partial<FrameworkConfig>;
    if (!raw || typeof raw !== "object") {
      const msg = `${path.basename(file)} did not export a config object.`;
      if (strict) throw new Error(msg);
      KalloLogger.warn(`${msg} Using defaults.`);
      return resolveConfig({});
    }
    return resolveConfig(raw);
  } catch (err) {
    const msg = `Failed to load ${path.basename(file)}: ${err instanceof Error ? err.message : String(err)}`;
    if (strict) throw new Error(msg);
    KalloLogger.error(msg);
    return resolveConfig({});
  }
}
