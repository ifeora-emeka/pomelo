import { KalloLogger } from "@kallojs/shared";
import {
  scanRoutes,
  resolveLayoutChain,
  renderRouteToHTML,
  processClientModule,
  collectFrameworkAssets,
  buildUrlFromPattern,
} from "@kallojs/server";
import type { ResolvedKalloConfig } from "@kallojs/types";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "../config.js";
import { executeBuildCommand } from "./build.js";
import { lintProjectForStatic, formatIssue } from "../static-lint.js";

/**
 * Map a URL path to an on-disk file within the out dir. Guards against path
 * traversal from param values containing `..` — the resolved file must stay
 * inside `outDir`. Returns null if it would escape.
 */
function urlToFilePath(
  outDir: string,
  urlPath: string,
  trailingSlash: boolean,
): string | null {
  let clean = urlPath.split("?")[0]!.split("#")[0]!;
  clean = clean.replace(/^\/+/, "").replace(/\/+$/, "");
  clean = decodeURIComponent(clean);
  const file =
    clean === ""
      ? path.join(outDir, "index.html")
      : trailingSlash
        ? path.join(outDir, clean, "index.html")
        : path.join(outDir, `${clean}.html`);
  const resolvedOut = path.resolve(outDir);
  const resolvedFile = path.resolve(file);
  if (resolvedFile !== resolvedOut && !resolvedFile.startsWith(resolvedOut + path.sep)) {
    return null;
  }
  return file;
}

/**
 * Match a route path against a config pattern. Supports exact match,
 * directory-style prefixes (`/admin` matches `/admin` and `/admin/...`), and a
 * trailing `*` wildcard (`/admin/*`).
 */
function matchesGlob(routePath: string, pattern: string): boolean {
  if (pattern === routePath) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return routePath === prefix || routePath.startsWith(prefix + "/");
  }
  if (pattern.endsWith("*")) return routePath.startsWith(pattern.slice(0, -1));
  // Bare pattern also excludes everything beneath it (directory semantics).
  return routePath.startsWith(pattern.replace(/\/$/, "") + "/");
}

function isRouteIncluded(
  routePath: string,
  cfg: ResolvedKalloConfig,
): boolean {
  const { include, exclude } = cfg.export;
  if (exclude.some((p) => matchesGlob(routePath, p))) return false;
  if (include.length > 0)
    return include.some((p) => matchesGlob(routePath, p));
  return true;
}

async function importFresh(file: string): Promise<any> {
  const url = pathToFileURL(file).href + `?t=${Date.now()}`;
  return import(url);
}

/** Normalize a $staticParams entry to a plain params object. */
function toParams(entry: unknown): Record<string, unknown> {
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    if (obj.params && typeof obj.params === "object") {
      return obj.params as Record<string, unknown>;
    }
    return obj;
  }
  return {};
}

export async function executeExportCommand(args: string[]): Promise<boolean> {
  const isTest = args.includes("--test");
  process.env.NODE_ENV = "production";
  process.env.KALLO_ENV = "production";

  const cwd = process.cwd();
  let cfg;
  try {
    cfg = await loadConfig(cwd, /* strict */ true);
  } catch (err) {
    KalloLogger.error(String(err instanceof Error ? err.message : err));
    return false;
  }
  if (cfg.output !== "static") {
    KalloLogger.info(
      "Config output is not 'static'; exporting anyway (explicit `kallo export`).",
    );
  }

  const pagesDir = path.join(cwd, "src/view");
  const cacheDir = path.join(cwd, ".kallo");
  const outDir = path.isAbsolute(cfg.outDir)
    ? cfg.outDir
    : path.join(cwd, cfg.outDir);

  if (!fs.existsSync(pagesDir)) {
    KalloLogger.error(`View directory ${pagesDir} does not exist.`);
    return false;
  }

  // 1. Compatibility lint --------------------------------------------------
  const lint = lintProjectForStatic(cwd);
  for (const w of lint.warnings) {
    KalloLogger.warn(`static-export: ${w.code}\n${formatIssue(w)}`);
  }
  if (lint.errors.length > 0 && cfg.export.failOnServerFeature) {
    KalloLogger.error(
      `Static export blocked by ${lint.errors.length} server-only feature(s):`,
    );
    for (const e of lint.errors) console.error(formatIssue(e));
    KalloLogger.error(
      "Fix the above, exclude the routes (export.exclude), or set export.failOnServerFeature:false.",
    );
    return false;
  } else if (lint.errors.length > 0) {
    for (const e of lint.errors)
      KalloLogger.warn(`static-export (ignored): ${formatIssue(e)}`);
  }

  // 2. Compile -------------------------------------------------------------
  KalloLogger.info("Compiling project...");
  if (!executeBuildCommand([])) {
    KalloLogger.error("Compilation failed; aborting export.");
    return false;
  }

  // 3. Prepare out dir -----------------------------------------------------
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const routes = scanRoutes(pagesDir);
  const viewOutDir = path.join(outDir, "@kallojs", "view");
  fs.mkdirSync(viewOutDir, { recursive: true });

  let pageCount = 0;
  const missingParams: string[] = [];
  const renderErrors: string[] = [];
  // Detect two routes/params writing the same file (last-write-wins hazard).
  const writtenFiles = new Map<string, string>();

  // 4. Render every route --------------------------------------------------
  for (const route of routes) {
    if (!isRouteIncluded(route.path, cfg)) {
      KalloLogger.info(`Skipping excluded route: ${route.path}`);
      continue;
    }

    const relative = path.relative(pagesDir, route.filePath);
    const cacheFile = path.join(cacheDir, relative.replace(/[\/\\]/g, "_") + ".js");
    if (!fs.existsSync(cacheFile)) {
      renderErrors.push(`${route.path}: compiled module missing (${cacheFile})`);
      continue;
    }

    let component: any;
    const layouts: any[] = [];
    const layoutCacheFileNames: string[] = [];
    try {
      component = await importFresh(cacheFile);
      for (const layoutPath of route.layoutPaths) {
        const layoutRelative = path.relative(pagesDir, layoutPath);
        const layoutCacheFile = path.join(
          cacheDir,
          "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
        );
        layouts.push(await importFresh(layoutCacheFile));
        layoutCacheFileNames.push(path.basename(layoutCacheFile));
      }
    } catch (err) {
      renderErrors.push(`${route.path}: failed to load module — ${String(err)}`);
      continue;
    }

    const cacheFileName = path.basename(cacheFile);

    // Determine the concrete URLs to render for this route.
    const urlJobs: Array<{ urlPath: string; params: Record<string, unknown> }> = [];
    if (route.isDynamic || route.isCatchAll) {
      if (typeof component.$serverStaticParams !== "function") {
        missingParams.push(route.path);
        continue;
      }
      let entries: unknown;
      try {
        entries = await component.$serverStaticParams({ params: {}, query: {} });
      } catch (err) {
        renderErrors.push(`${route.path}: $staticParams threw — ${String(err)}`);
        continue;
      }
      if (!Array.isArray(entries)) {
        renderErrors.push(
          `${route.path}: $staticParams must return an array (got ${typeof entries}).`,
        );
        continue;
      }
      if (entries.length === 0) {
        KalloLogger.warn(
          `${route.path}: $staticParams returned an empty array — no pages generated for this route.`,
        );
      }
      for (const entry of entries) {
        const params = toParams(entry);
        urlJobs.push({ urlPath: buildUrlFromPattern(route.path, params), params });
      }
    } else {
      urlJobs.push({ urlPath: route.path, params: {} });
    }

    for (const job of urlJobs) {
      // Concrete-URL exclusion (e.g. exclude a single generated instance).
      if (!isRouteIncluded(job.urlPath, cfg)) {
        KalloLogger.info(`Skipping excluded page: ${job.urlPath}`);
        continue;
      }
      try {
        const { html, status } = await renderRouteToHTML({
          component,
          layouts,
          ctx: {
            params: job.params,
            query: {},
            urlPath: job.urlPath,
            routePattern: route.path,
          },
          cacheFileName,
          layoutCacheFileNames,
          assetPrefix: cfg.assetPrefix,
          basePath: cfg.basePath,
        });
        // A non-200 means the route aborted/redirected at build time (e.g.
        // $abort(404), a guard, or a request-dependent $redirect) — there is no
        // meaningful static page to write. Report it rather than emit an empty
        // or misleading file.
        if (status !== 200 || !html.trim()) {
          renderErrors.push(
            `${job.urlPath}: route produced HTTP ${status} at build time — not exported. ` +
              `Static pages cannot depend on the request; remove the abort/redirect/guard for this route or exclude it.`,
          );
          continue;
        }
        const outFile = urlToFilePath(outDir, job.urlPath, cfg.trailingSlash);
        if (!outFile) {
          renderErrors.push(
            `${job.urlPath}: resolves outside the output directory (bad param value?) — skipped.`,
          );
          continue;
        }
        const prev = writtenFiles.get(outFile);
        if (prev && prev !== job.urlPath) {
          KalloLogger.warn(
            `Output collision: "${job.urlPath}" overwrites "${prev}" at ${path.relative(outDir, outFile)}. ` +
              `Consider trailingSlash:true or distinct param values.`,
          );
        }
        writtenFiles.set(outFile, job.urlPath);
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, html);
        pageCount++;
        KalloLogger.info(`  ✓ ${job.urlPath} → ${path.relative(outDir, outFile)}`);
      } catch (err) {
        renderErrors.push(`${job.urlPath}: render failed — ${String(err)}`);
      }
    }
  }

  // 5. Emit client modules (all compiled view/component/dep modules) -------
  emitClientModules(cacheDir, viewOutDir, cfg.assetPrefix);

  // 6. Framework runtime/shared assets ------------------------------------
  const emitted = collectFrameworkAssets(outDir, cfg.assetPrefix);
  KalloLogger.info(`Emitted framework assets: ${emitted.join(", ") || "none"}`);

  // 7. 404 page ------------------------------------------------------------
  await writeNotFound(pagesDir, cacheDir, outDir, cfg);

  // 8. Host files: .nojekyll + copy public --------------------------------
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
  copyPublic(path.join(cwd, "public"), outDir);
  if (cfg.basePath) {
    // Convenience CNAME/base note is documented; nothing auto-written here.
  }

  // 9. Report --------------------------------------------------------------
  if (missingParams.length > 0) {
    KalloLogger.error(
      `The following dynamic routes are missing $staticParams (not exported):`,
    );
    for (const p of missingParams) console.error(`    ${p}`);
  }
  for (const e of renderErrors) KalloLogger.error(`  ${e}`);

  // Render/param failures are correctness errors, independent of the
  // `failOnServerFeature` lint knob — they always fail the export (except under
  // --test, a CI dry-run). Otherwise a broken export could exit green.
  const failed = missingParams.length > 0 || renderErrors.length > 0;
  if (failed && !isTest) {
    KalloLogger.error(`Export completed with errors (${pageCount} pages written).`);
    return false;
  }
  KalloLogger.info(
    `Static export complete: ${pageCount} page(s) written to ${path.relative(cwd, outDir)}/`,
  );
  return true;
}

/** Emit every compiled client module (excluding server-only api_*) to the view dir. */
function emitClientModules(
  cacheDir: string,
  viewOutDir: string,
  assetPrefix: string,
): void {
  if (!fs.existsSync(cacheDir)) return;
  for (const name of fs.readdirSync(cacheDir)) {
    if (!name.endsWith(".js")) continue;
    if (name.startsWith("api_")) continue;
    const content = fs.readFileSync(path.join(cacheDir, name), "utf-8");
    fs.writeFileSync(
      path.join(viewOutDir, name),
      processClientModule(content, assetPrefix),
    );
  }
}

/** Find and render the nearest top-level not-found.kal into 404.html. */
async function writeNotFound(
  pagesDir: string,
  cacheDir: string,
  outDir: string,
  cfg: ResolvedKalloConfig,
): Promise<void> {
  const notFoundSrc = path.join(pagesDir, "not-found.kal");
  if (!fs.existsSync(notFoundSrc)) return;
  const cacheFile = path.join(cacheDir, "not-found.kal.js");
  if (!fs.existsSync(cacheFile)) return;
  try {
    const component = await importFresh(cacheFile);
    // Wrap the 404 in its layout chain so it matches the rest of the site.
    const layouts: any[] = [];
    const layoutCacheFileNames: string[] = [];
    for (const layoutPath of resolveLayoutChain(notFoundSrc, pagesDir)) {
      const layoutRelative = path.relative(pagesDir, layoutPath);
      const layoutCacheFile = path.join(
        cacheDir,
        "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
      );
      if (!fs.existsSync(layoutCacheFile)) continue;
      layouts.push(await importFresh(layoutCacheFile));
      layoutCacheFileNames.push(path.basename(layoutCacheFile));
    }
    const { html, status } = await renderRouteToHTML({
      component,
      layouts,
      ctx: { urlPath: "/404", routePattern: "/404", params: {}, query: {} },
      cacheFileName: "not-found.kal.js",
      layoutCacheFileNames,
      assetPrefix: cfg.assetPrefix,
      basePath: cfg.basePath,
    });
    if (status !== 200 || !html.trim()) {
      KalloLogger.warn(
        `not-found.kal produced HTTP ${status} at build time; skipping 404.html.`,
      );
      return;
    }
    fs.writeFileSync(path.join(outDir, "404.html"), html);
    KalloLogger.info("  ✓ 404.html (from not-found.kal)");
  } catch (err) {
    KalloLogger.warn("Failed to render not-found.kal for 404.html: " + String(err));
  }
}

function copyPublic(publicDir: string, outDir: string): void {
  if (!fs.existsSync(publicDir)) return;
  const walk = (src: string, dest: string) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        walk(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  };
  walk(publicDir, outDir);
  KalloLogger.info("  ✓ Copied public/ assets");
}
