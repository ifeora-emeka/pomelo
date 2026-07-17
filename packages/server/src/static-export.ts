/**
 * Static export renderer.
 *
 * Drives the exact same SSR code paths (`handleSSR` / `handleSSRWithLayouts`)
 * used at request time, but through a synthetic request/response so the output
 * HTML never diverges from what the server would produce. The CLI `export`
 * command orchestrates compilation, route enumeration and file writing on top
 * of the primitives here.
 */
import fs from "node:fs";
import path from "node:path";
import { replaceEnvVars, stripServerBlock } from "@kallojs/shared";
import { handleSSR, handleSSRWithLayouts, rewriteBrowserImports } from "./server.js";

/** Minimal Express-Request shape the SSR handlers actually read. */
export interface SyntheticRouteContext {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  /** Concrete URL path being rendered, e.g. `/blog/hello`. */
  urlPath: string;
  /** Express route pattern, e.g. `/blog/:slug`. */
  routePattern: string;
}

function makeSyntheticReq(ctx: SyntheticRouteContext): any {
  const urlPath = ctx.urlPath || "/";
  return {
    method: "GET",
    params: ctx.params ?? {},
    query: ctx.query ?? {},
    path: urlPath,
    url: urlPath,
    originalUrl: urlPath,
    route: { path: ctx.routePattern || urlPath },
    headers: {},
    cookies: {},
    get() {
      return undefined;
    },
    accepts() {
      return true;
    },
  };
}

/** Captures whatever the SSR handler "sends" instead of writing to a socket. */
class SyntheticRes {
  statusCode = 200;
  body = "";
  locals: Record<string, unknown> = {};
  private _sent = false;
  private headers: Record<string, string> = {};

  get headersSent(): boolean {
    return this._sent;
  }
  status(code: number): this {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }
  // Request-independent Express helpers a $page/$meta might touch. These are
  // no-ops during export (there is no live response) but must not throw.
  set(name: string, value: string): this {
    return this.setHeader(name, value);
  }
  header(name: string, value: string): this {
    return this.setHeader(name, value);
  }
  type(): this {
    return this;
  }
  cookie(): this {
    return this;
  }
  clearCookie(): this {
    return this;
  }
  append(): this {
    return this;
  }
  vary(): this {
    return this;
  }
  send(body: unknown): this {
    if (typeof body === "string") this.body = body;
    else if (body != null) this.body = String(body);
    this._sent = true;
    return this;
  }
  json(obj: unknown): this {
    this.body = JSON.stringify(obj);
    this._sent = true;
    return this;
  }
  end(body?: unknown): this {
    if (typeof body === "string") this.body = body;
    this._sent = true;
    return this;
  }
  // Response helpers the error paths may call.
  forbidden(): this {
    return this.status(403).send("Forbidden");
  }
  serverError(message?: string): this {
    return this.status(500).send(message || "Internal Server Error");
  }
  redirect(codeOrUrl: number | string, maybeUrl?: string): this {
    const code = typeof codeOrUrl === "number" ? codeOrUrl : 302;
    const url = typeof codeOrUrl === "number" ? maybeUrl : codeOrUrl;
    this.setHeader("location", url || "/");
    return this.status(code).end();
  }
}

export interface RenderRouteOptions {
  component: any;
  layouts?: any[];
  ctx: SyntheticRouteContext;
  cacheFileName: string;
  layoutCacheFileNames?: string[];
  /** Prefix applied to framework asset URLs (`/@kallojs/...`). */
  assetPrefix?: string;
  /** URL the site is served under; embedded for the client router. */
  basePath?: string;
}

export interface RenderRouteResult {
  html: string;
  status: number;
}

/**
 * Prefix every framework asset URL (`/@kallojs/...`) and the framework's
 * default favicon link so the output works when hosted under a sub-path
 * (e.g. GitHub project pages at `user.github.io/repo`).
 */
export function applyAssetPrefix(content: string, assetPrefix: string): string {
  if (!assetPrefix) return content;
  return content
    .replace(/(["'(])\/@kallojs\//g, `$1${assetPrefix}/@kallojs/`)
    .replace(/(["'])\/favicon\.ico(["'])/g, `$1${assetPrefix}/favicon.ico$2`);
}

/**
 * Bootstrap script injected into every exported page. Signals the runtime it is
 * running as a static site (so client navigation fetches HTML instead of the
 * SSR navigation endpoint) and exposes the base path for URL resolution.
 */
export function staticBootstrapScript(basePath: string): string {
  return `<script>window.__KALLO_STATIC__=true;window.__KALLO_BASE_PATH__=${JSON.stringify(
    basePath || "",
  )};</script>`;
}

function injectBootstrap(html: string, basePath: string): string {
  const boot = staticBootstrapScript(basePath);
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${boot}</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${boot}`);
  }
  return boot + html;
}

/**
 * Render a single concrete route to a full HTML document, reusing the live SSR
 * handlers. `component`/`layouts` are already-imported compiled modules.
 */
export async function renderRouteToHTML(
  opts: RenderRouteOptions,
): Promise<RenderRouteResult> {
  const req = makeSyntheticReq(opts.ctx);
  const res = new SyntheticRes();
  const layouts = opts.layouts ?? [];

  // The SSR handlers only touch the subset of the Express req/res surface that
  // the synthetic objects implement; cast through `any` at the boundary.
  const reqAny = req as any;
  const resAny = res as any;
  if (layouts.length > 0) {
    await handleSSRWithLayouts(
      reqAny,
      resAny,
      opts.component,
      layouts,
      opts.cacheFileName,
      opts.layoutCacheFileNames ?? [],
    );
  } else {
    await handleSSR(reqAny, resAny, opts.component, opts.cacheFileName);
  }

  let html = res.body || "";
  html = injectBootstrap(html, opts.basePath ?? "");
  html = applyAssetPrefix(html, opts.assetPrefix ?? "");
  return { html, status: res.statusCode };
}

/**
 * Process a compiled `.kallo/*.js` module into the browser-ready form served at
 * `/@kallojs/view/<name>` — identical to the dev/prod middleware, plus the
 * asset-prefix rewrite for sub-path hosting.
 */
export function processClientModule(
  content: string,
  assetPrefix: string,
): string {
  return applyAssetPrefix(
    replaceEnvVars(stripServerBlock(rewriteBrowserImports(content))),
    assetPrefix,
  );
}

function resolveDistDir(pkg: string, fallbackName: string): string | null {
  try {
    const pkgPath = require.resolve(`${pkg}/package.json`, {
      paths: [process.cwd()],
    });
    return path.join(path.dirname(pkgPath), "dist");
  } catch {
    const candidates = [
      path.join(process.cwd(), `packages/${fallbackName}/dist`),
      path.join(process.cwd(), `../${fallbackName}/dist`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }
}

function copyDistRewritten(
  srcDir: string,
  destDir: string,
  assetPrefix: string,
): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    // Skip test files and TypeScript declaration/map artifacts — they are dead
    // weight in a browser bundle and may import node-only test modules.
    if (/\.test\.[jt]s$/.test(entry.name) || /\.d\.ts(\.map)?$/.test(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      copyDistRewritten(src, dest, assetPrefix);
    } else if (entry.name.endsWith(".js")) {
      fs.mkdirSync(destDir, { recursive: true });
      const processed = applyAssetPrefix(
        rewriteBrowserImports(fs.readFileSync(src, "utf-8")),
        assetPrefix,
      );
      fs.writeFileSync(dest, processed);
    } else if (/\.(css|woff2?|ttf|svg)$/.test(entry.name)) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * Copy the framework client packages (runtime/shared/types) into
 * `<outDir>/@kallojs/<pkg>/…`, mirroring the URL tree the dev server serves,
 * with browser-import + asset-prefix rewrites applied. Returns the list of
 * packages that were emitted.
 */
export function collectFrameworkAssets(
  outDir: string,
  assetPrefix: string,
): string[] {
  const emitted: string[] = [];
  const pkgs: Array<[string, string]> = [
    ["@kallojs/runtime", "runtime"],
    ["@kallojs/shared", "shared"],
    ["@kallojs/types", "types"],
  ];
  for (const [pkg, shortName] of pkgs) {
    const dist = resolveDistDir(pkg, shortName);
    if (!dist || !fs.existsSync(dist)) continue;
    const dest = path.join(outDir, "@kallojs", shortName);
    copyDistRewritten(dist, dest, assetPrefix);
    emitted.push(shortName);
  }
  return emitted;
}

/**
 * Substitute concrete params into an Express route pattern to build a URL.
 * `/blog/:slug` + `{slug:"hello"}` → `/blog/hello`.
 * `/docs/*path` + `{path:"a/b"}` (or `["a","b"]`) → `/docs/a/b`.
 */
export function buildUrlFromPattern(
  routePattern: string,
  params: Record<string, unknown>,
): string {
  const segments = routePattern.split("/").filter(Boolean);
  const out: string[] = [];
  for (const seg of segments) {
    if (seg.startsWith(":")) {
      const name = seg.slice(1);
      out.push(encodeSegment(String(params[name] ?? "")));
    } else if (seg.startsWith("*")) {
      const name = seg.slice(1);
      const val = params[name];
      const parts = (Array.isArray(val)
        ? val.map((p) => String(p))
        : String(val ?? "").split("/")
      ).filter(Boolean);
      for (const p of parts) out.push(encodeSegment(p));
    } else {
      out.push(seg);
    }
  }
  return "/" + out.join("/");
}

function encodeSegment(s: string): string {
  return encodeURIComponent(s);
}
