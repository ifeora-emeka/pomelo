import type { Request, Response, NextFunction } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { compile } from "@kallo/compiler";
import {
  KalloLogger,
  formatFrameworkName,
  rewriteRelativeImports,
  SFC_EXTENSION,
  replaceEnvVars,
  stripServerBlock,
  loadEnv,
  serializeForScript,
} from "@kallo/shared";
import type { FrameworkConfig } from "@kallo/types";
import { KalloError } from "./errors.js";
import {
  scanRoutes,
  sortRoutesBySpecificity,
  extractParams,
  resolveLayoutChain,
} from "./route-scanner.js";
import { mergeMetadata, renderMetadataHTML } from "./metadata.js";
import { signToken, verifyToken } from "./auth.js";

function resolvePackageToAbsolute(packageName: string): string | null {
  try {
    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    return path.dirname(pkgJsonPath);
  } catch {
    return null;
  }
}

function getCacheDir(): string {
  const env = process.env.KALLO_ENV || process.env.NODE_ENV || "development";
  if (env === "production") {
    return path.join(process.cwd(), ".kallo");
  } else {
    return path.join(process.cwd(), "node_modules/.kallo-cache");
  }
}

function rewriteBareModuleImports(code: string): string {
  const pomPackages = ["@kallo/runtime", "@kallo/shared", "@kallo/types"];
  let result = code;
  for (const pkg of pomPackages) {
    const pkgDir = resolvePackageToAbsolute(pkg);
    if (!pkgDir) continue;
    try {
      const pkgJson = JSON.parse(
        fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"),
      ) as Record<string, any>;
      const exports = pkgJson["exports"] as Record<string, any> | undefined;
      const mainEntry = (exports?.["."]?.["import"] ??
        exports?.["."]?.["default"] ??
        pkgJson["main"] ??
        "dist/index.js") as string;
      const absEntry = `file://${path.join(pkgDir, mainEntry).replace(/\\/g, "/")}`;
      result = result.replace(
        new RegExp(
          `(from\\s+['"])${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(['"])`,
          "g",
        ),
        `$1${absEntry}$2`,
      );
    } catch {
      // Ignore packages that can't be resolved
    }
  }
  return result;
}

declare global {
  namespace Express {
    interface Response {
      ok(data: any): void;
      created(data: any): void;
      updated(data: any): void;
      deleted(): void;
      badRequest(message?: string): void;
      unauthorized(message?: string): void;
      forbidden(message?: string): void;
      notFound(message?: string): void;
      serverError(message?: string): void;
    }
  }
}

export function responseHelpersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.ok = (data: any) => res.status(200).json(data);
  res.created = (data: any) => res.status(201).json(data);
  res.updated = (data: any) => res.status(200).json(data);
  res.deleted = () => {
    res.status(204).end();
  };

  res.badRequest = (message?: string) => {
    res.status(400).json({ error: message || "Bad Request" });
  };
  res.unauthorized = (message?: string) => {
    res.status(401).json({ error: message || "Unauthorized" });
  };
  res.forbidden = (message?: string) => {
    res.status(403).json({ error: message || "Forbidden" });
  };
  res.notFound = (message?: string) => {
    res.status(404).json({ error: message || "Not Found" });
  };
  res.serverError = (message?: string) => {
    res.status(500).json({ error: message || "Internal Server Error" });
  };

  next();
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof KalloError) {
    KalloLogger.error(`${err.name}: ${err.message}`);
    if (!res.headersSent) {
      res.status(err.statusCode).json({
        error: err.message,
        type: err.name,
      });
    }
    return;
  }

  KalloLogger.error(
    "Unhandled Error: " + (err.stack || err.message || String(err)),
  );
  if (!res.headersSent) {
    const isDev = process.env["NODE_ENV"] !== "production";
    res.status(500).json({
      error: isDev ? err.message : "Internal Server Error",
      ...(isDev && { stack: err.stack }),
    });
  }
}

function generateHydrationScript(
  cacheFileName: string,
  componentId: string,
  stateJSON: string,
): string {
  return `<script type="module">
import { hydrate } from "/@kallo/runtime/index.js";
import * as component from "/@kallo/view/${cacheFileName}";
const container = document.getElementById("app");
const serverState = ${stateJSON};
if (container && component.setup) {
  hydrate(container, {
    setup: component.setup,
    render: component.render,
    css: component.css || "",
    componentId: "${componentId}"
  }, serverState);
}
</script>`;
}

function generateHydrationScriptWithLayouts(
  cacheFileName: string,
  componentId: string,
  stateJSON: string,
  layoutCacheFileNames: string[],
  layoutStatesJSON: string[],
): string {
  const imports: string[] = [];
  imports.push(`import * as component from "/@kallo/view/${cacheFileName}";`);
  for (let i = 0; i < layoutCacheFileNames.length; i++) {
    imports.push(
      `import * as layout_${i} from "/@kallo/view/${layoutCacheFileNames[i]}";`,
    );
  }

  return `<script type="module">
import { hydrate } from "/@kallo/runtime/index.js";
${imports.join("\n")}

const container = document.getElementById("app");
const serverPageState = ${stateJSON};
const serverLayoutStates = [${layoutStatesJSON.join(", ")}];

if (container) {
  const pageState = { ...serverPageState, ...(component.setup ? component.setup(serverPageState) : {}) };
  const layoutStates = [];
  
  const layoutModules = [${layoutCacheFileNames.map((_, i) => `layout_${i}`).join(", ")}];
  for (let i = 0; i < serverLayoutStates.length; i++) {
    const layoutMod = layoutModules[i];
    const s = serverLayoutStates[i];
    const layoutState = { ...s, ...(layoutMod.setup ? layoutMod.setup(s) : {}) };
    layoutStates.push(layoutState);
  }

  const combinedState = { ...pageState };
  for (const s of layoutStates) {
    Object.assign(combinedState, s);
  }

  const combinedRender = (state) => {
    let html = component.render ? component.render(state) : "";
    for (let i = layoutModules.length - 1; i >= 0; i--) {
      const layoutMod = layoutModules[i];
      const layoutStateForRender = { ...state, ...layoutStates[i] };
      html = layoutMod.render ? layoutMod.render(layoutStateForRender, { default: () => html }) : html;
    }
    return html;
  };

  hydrate(container, {
    setup: () => combinedState,
    render: combinedRender,
    css: component.css || "",
    componentId: "${componentId}"
  }, combinedState);
}
</script>`;
}

export async function handleSSR(
  req: Request,
  res: Response,
  component: any,
  cacheFileName?: string,
) {
  try {
    const ctx = {
      req,
      res,
      params: req.params,
      query: req.query,
    };

    if (component.$serverGuard) {
      const allowed = await component.$serverGuard(ctx);
      if (allowed === false) {
        if (!res.headersSent) {
          if (typeof res.forbidden === "function") {
            res.forbidden();
          } else {
            res.status(403).send("Forbidden");
          }
        }
        return;
      }
    }

    let state: Record<string, any> = {};
    if (component.$serverPage) {
      state = (await component.$serverPage(ctx)) || {};
    }

    if (res.headersSent) {
      return;
    }

    if (component.setup) {
      const clientSetupState = component.setup(state) || {};
      state = { ...state, ...clientSetupState };
    }

    const renderState = new Proxy(state, {
      get(target, key) {
        if (key === "state") return target;
        const val = Reflect.get(target, key);
        if (val && typeof val === "object" && typeof val.get === "function") {
          return val.get();
        }
        return val;
      },
    });

    const ssrCtx = { headTags: [] as string[] };
    (globalThis as any).__kallo_ssr_context__ = ssrCtx;

    let htmlContent = "";
    try {
      htmlContent = component.render ? component.render(renderState) : "";
    } finally {
      delete (globalThis as any).__kallo_ssr_context__;
    }

    let metaHTML = "";
    if (component.$serverMeta) {
      const meta = await component.$serverMeta(state);
      if (meta) {
        metaHTML = renderMetadataHTML(meta);
      }
    }

    const headTagsHTML = ssrCtx.headTags.join("\n");

    let styleHTML = "";
    if (component.css) {
      styleHTML = `<style id="kallo-style-${component.componentId || "app"}">${component.css}</style>`;
    }

    let faviconTag = "";
    const hasFavicon =
      headTagsHTML.includes('rel="icon"') ||
      headTagsHTML.includes("rel='icon'") ||
      headTagsHTML.includes('rel="shortcut icon"') ||
      headTagsHTML.includes("rel='shortcut icon'") ||
      metaHTML.includes('rel="icon"') ||
      metaHTML.includes("rel='icon'");

    if (!hasFavicon) {
      faviconTag = `\n  <link rel="icon" href="/favicon.ico">`;
    }

    const routePath = req.route?.path || req.path;
    const resolvedCacheFileName =
      cacheFileName ||
      (routePath === "/"
        ? `index${SFC_EXTENSION}.js`
        : `${routePath.replace(/^\//, "").replace(/[\/\\]/g, "_")}${SFC_EXTENSION}.js`);
    const componentId = component.componentId || "app";
    const stateJSON = serializeForScript(state);
    const hydrationScript = component.setup
      ? generateHydrationScript(resolvedCacheFileName, componentId, stateJSON)
      : "";

    let fullHTML = "";
    const hasHtmlOrBody = /<html|<body/i.test(htmlContent);

    if (hasHtmlOrBody) {
      fullHTML = htmlContent;
      if (!/^<!DOCTYPE/i.test(fullHTML.trim())) {
        fullHTML = "<!DOCTYPE html>\n" + fullHTML;
      }
      const headInject = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaHTML}${faviconTag}${headTagsHTML}${styleHTML}`;
      if (/<head[^>]*>/i.test(fullHTML)) {
        fullHTML = fullHTML.replace(/(<head[^>]*>)/i, `$1${headInject}`);
      } else if (/<html[^>]*>/i.test(fullHTML)) {
        fullHTML = fullHTML.replace(/(<html[^>]*>)/i, `$1<head>${headInject}</head>`);
      }
      const bodyInject = `${hydrationScript}`;
      if (/<body[^>]*>/i.test(fullHTML)) {
        if (!/id=["']app["']/i.test(fullHTML)) {
          fullHTML = fullHTML.replace(/(<body[^>]*>)/i, `$1<div id="app">`);
          fullHTML = fullHTML.replace(/(<\/body>)/i, `${bodyInject}</div>$1`);
        } else {
          fullHTML = fullHTML.replace(/(<\/body>)/i, `${bodyInject}$1`);
        }
      }
    } else {
      fullHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${metaHTML}${faviconTag}
  ${headTagsHTML}
  ${styleHTML}
</head>
<body>
  <div id="app">${htmlContent}</div>
  ${hydrationScript}
</body>
</html>`;
    }

    res.status(200).send(fullHTML);
  } catch (err: any) {
    if (err.isKalloAbort === true && typeof err.statusCode === "number") {
      if (!res.headersSent) {
        res.status(err.statusCode).end();
      }
      return;
    }
    KalloLogger.error(
      "SSR Rendering Error: " +
        (err instanceof Error ? err.stack : String(err)),
    );
    if (!res.headersSent) {
      res.serverError(err.message);
    }
  }
}

export async function handleSSRStream(
  req: Request,
  res: Response,
  component: any,
) {
  try {
    const ctx = {
      req,
      res,
      params: req.params,
      query: req.query,
    };

    if (component.$serverGuard) {
      const allowed = await component.$serverGuard(ctx);
      if (allowed === false) {
        if (!res.headersSent) {
          res.forbidden();
        }
        return;
      }
    }

    let state: Record<string, any> = {};
    if (component.$serverPage) {
      state = (await component.$serverPage(ctx)) || {};
    }

    if (res.headersSent) {
      return;
    }

    if (component.setup) {
      const clientSetupState = component.setup(state) || {};
      state = { ...state, ...clientSetupState };
    }

    const renderState = new Proxy(state, {
      get(target, key) {
        if (key === "state") return target;
        const val = Reflect.get(target, key);
        if (val && typeof val === "object" && typeof val.get === "function") {
          return val.get();
        }
        return val;
      },
    });

    const htmlContent = component.render ? component.render(renderState) : "";

    let metaHTML = "";
    if (component.$serverMeta) {
      const meta = await component.$serverMeta(state);
      if (meta) {
        metaHTML = renderMetadataHTML(meta);
      }
    }

    let styleHTML = "";
    if (component.css) {
      styleHTML = `<style>${component.css}</style>`;
    }

    let faviconTag = "";
    const hasFavicon =
      metaHTML.includes('rel="icon"') ||
      metaHTML.includes("rel='icon'") ||
      metaHTML.includes('rel="shortcut icon"') ||
      metaHTML.includes("rel='shortcut icon'");

    if (!hasFavicon) {
      faviconTag = `<link rel="icon" href="/favicon.ico">`;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    res.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8">${metaHTML}${faviconTag}${styleHTML}</head><body><div id="app">`,
    );
    res.write(htmlContent);
    res.write(`</div></body></html>`);
    res.end();
  } catch (err: any) {
    if (err.isKalloAbort === true && typeof err.statusCode === "number") {
      if (!res.headersSent) {
        res.status(err.statusCode).end();
      }
      return;
    }
    KalloLogger.error(
      "SSR Stream Error: " + (err instanceof Error ? err.stack : String(err)),
    );
    if (!res.headersSent) {
      res.serverError(err.message);
    }
  }
}

function compileTypeScriptDeps(
  cacheFile: string,
  cacheDir: string,
  visited: Set<string> = new Set(),
): void {
  if (visited.has(cacheFile)) return;
  visited.add(cacheFile);

  let content = fs.readFileSync(cacheFile, "utf-8");
  const importRegex = /from\s+['"](\.[^'"]+\.js)['"]/g;
  let match;
  const rewrites = new Map<string, string>();

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]!;
    const absoluteJsPath = path.resolve(path.dirname(cacheFile), importPath);

    if (!fs.existsSync(absoluteJsPath)) {
      const absoluteTsPath = absoluteJsPath.replace(/\.js$/, ".ts");
      if (fs.existsSync(absoluteTsPath)) {
        const tsSource = fs.readFileSync(absoluteTsPath, "utf-8");
        const transpiled = ts.transpileModule(tsSource, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        });

        const projectRoot = path.dirname(cacheDir);
        const relative = path.relative(projectRoot, absoluteTsPath);
        const depCacheName =
          "dep_" + relative.replace(/[\/\\]/g, "_").replace(/\.ts$/, ".js");
        const depCacheFile = path.join(cacheDir, depCacheName);

        const rewroteOutput = rewriteRelativeImports(
          transpiled.outputText,
          absoluteTsPath,
          depCacheFile,
        );
        fs.writeFileSync(depCacheFile, rewriteBareModuleImports(rewroteOutput));

        compileTypeScriptDeps(depCacheFile, cacheDir, visited);

        const newRelPath =
          "./" +
          path
            .relative(path.dirname(cacheFile), depCacheFile)
            .replace(/\\/g, "/");
        rewrites.set(importPath, newRelPath);
      }
    }
  }

  if (rewrites.size > 0) {
    for (const [oldPath, newPath] of rewrites) {
      content = content.replace(
        new RegExp(
          `from\\s+['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`,
          "g",
        ),
        `from "${newPath}"`,
      );
    }
    fs.writeFileSync(cacheFile, content);
  }
}

function compileKalDeps(
  cacheFile: string,
  cacheDir: string,
  projectRoot: string,
  visited: Set<string> = new Set(),
): void {
  if (visited.has(cacheFile)) return;
  visited.add(cacheFile);

  let content = fs.readFileSync(cacheFile, "utf-8");
  const kalImportRegex = new RegExp(`import\\s+(\\w+)\\s+from\\s+['"]([^'"]+\\${SFC_EXTENSION})['"]`, "g");
  let match;
  const rewrites = new Map<string, string>();

  while ((match = kalImportRegex.exec(content)) !== null) {
    const importName = match[1]!;
    const importPath = match[2]!;

    let absolutePomPath: string;
    if (path.isAbsolute(importPath)) {
      absolutePomPath = importPath;
    } else {
      absolutePomPath = path.resolve(path.dirname(cacheFile), importPath);
      if (!fs.existsSync(absolutePomPath)) {
        absolutePomPath = path.resolve(
          projectRoot,
          importPath.replace(/^\.\.\//, ""),
        );
      }
    }

    if (fs.existsSync(absolutePomPath)) {
      const pomSource = fs.readFileSync(absolutePomPath, "utf-8");
      const compiled = compile(pomSource, absolutePomPath);
      const relative = path.relative(projectRoot, absolutePomPath);
      const compCacheName =
        "comp_" + relative.replace(/[\/\\]/g, "_").replace(new RegExp(`\\${SFC_EXTENSION}$`), ".js");
      const compCacheFile = path.join(cacheDir, compCacheName);
      const rewroteCode = rewriteRelativeImports(
        compiled.code,
        absolutePomPath,
        compCacheFile,
      );
      fs.writeFileSync(compCacheFile, rewriteBareModuleImports(rewroteCode));
      compileTypeScriptDeps(compCacheFile, cacheDir, new Set());
      compileKalDeps(compCacheFile, cacheDir, projectRoot, visited);

      const newRelPath =
        "./" +
        path
          .relative(path.dirname(cacheFile), compCacheFile)
          .replace(/\\/g, "/");
      rewrites.set(
        `import ${importName} from '${importPath}'`,
        `import * as ${importName} from '${newRelPath}'`,
      );
      rewrites.set(
        `import ${importName} from "${importPath}"`,
        `import * as ${importName} from "${newRelPath}"`,
      );
    }
  }

  if (rewrites.size > 0) {
    for (const [oldImport, newImport] of rewrites) {
      content = content.replace(oldImport, newImport);
    }
    fs.writeFileSync(cacheFile, content);
  }
}

class UnauthorizedError extends Error {
  constructor(message = "Unauthorized access") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function findSpecialFile(startDir: string, pagesDir: string, type: string): string | null {
  let currentDir = startDir;
  while (true) {
    const relative = path.relative(pagesDir, currentDir);
    const isInside =
      currentDir === pagesDir ||
      (!relative.startsWith("..") && !path.isAbsolute(relative));
    if (!isInside) {
      break;
    }

    const specialFile = path.join(currentDir, `${type}.kal`);
    if (fs.existsSync(specialFile)) {
      return specialFile;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

async function renderSpecialFile(
  req: Request,
  res: Response,
  specialFile: string,
  pagesDir: string,
  statusCode: number,
  extraState: any = {}
) {
  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const relative = path.relative(pagesDir, specialFile);
  const cacheFile = path.join(
    cacheDir,
    relative.replace(/[\/\\]/g, "_") + ".js"
  );

  const env = process.env.KALLO_ENV || process.env.NODE_ENV || "development";
  const isDev = env === "development";

  if (isDev) {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const content = fs.readFileSync(specialFile, "utf-8");
    const compiled = compile(content, specialFile);
    const rewroteCode = rewriteRelativeImports(compiled.code, specialFile, cacheFile);
    fs.writeFileSync(cacheFile, rewriteBareModuleImports(rewroteCode));
    compileTypeScriptDeps(cacheFile, cacheDir);
    compileKalDeps(cacheFile, cacheDir, process.cwd());
  }

  const layoutPaths = resolveLayoutChain(specialFile, pagesDir);
  const layoutCacheFiles: string[] = [];

  for (const layoutPath of layoutPaths) {
    const layoutRelative = path.relative(pagesDir, layoutPath);
    const layoutCacheFile = path.join(
      cacheDir,
      "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js"
    );
    if (isDev) {
      const layoutContent = fs.readFileSync(layoutPath, "utf-8");
      const layoutCompiled = compile(layoutContent, layoutPath);
      const layoutRewroteCode = rewriteRelativeImports(
        layoutCompiled.code,
        layoutPath,
        layoutCacheFile
      );
      fs.writeFileSync(layoutCacheFile, rewriteBareModuleImports(layoutRewroteCode));
      compileTypeScriptDeps(layoutCacheFile, cacheDir);
      compileKalDeps(layoutCacheFile, cacheDir, process.cwd());
    }
    layoutCacheFiles.push(layoutCacheFile);
  }

  const rawComponent = await import(`file://${cacheFile}?t=${Date.now()}`);
  const layouts: any[] = [];
  for (const layoutCacheFile of layoutCacheFiles) {
    const layout = await import(`file://${layoutCacheFile}?t=${Date.now()}`);
    layouts.push(layout);
  }

  res.status(statusCode);

  const originalServerPage = rawComponent.$serverPage;
  const component = {
    ...rawComponent,
    $serverPage: async (ctx: any) => {
      const base = originalServerPage ? await originalServerPage(ctx) : {};
      return { ...base, ...extraState };
    },
  };

  const cacheFileName = path.basename(cacheFile);
  if (layouts.length > 0) {
    await handleSSRWithLayouts(
      req,
      res,
      component,
      layouts,
      cacheFileName,
      layoutCacheFiles.map((f) => path.basename(f))
    );
  } else {
    await handleSSR(req, res, component, cacheFileName);
  }
}

export function registerFileSystemRoutes(
  app: express.Express,
  pagesDir: string,
) {
  if (!fs.existsSync(pagesDir)) return;

  const routes = sortRoutesBySpecificity(scanRoutes(pagesDir));
  const cacheDir = getCacheDir();

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const routeCacheMap = app.get("routeCacheMap") || new Map<string, string>();

  const env = process.env.KALLO_ENV || process.env.NODE_ENV || "development";
  const isDev = env === "development";

  for (const route of routes) {
    const relative = path.relative(pagesDir, route.filePath);
    const cacheFile = path.join(
      cacheDir,
      relative.replace(/[\/\\]/g, "_") + ".js",
    );
    const importPath = route.path === "/" ? `/index${SFC_EXTENSION}` : `${route.path}${SFC_EXTENSION}`;
    routeCacheMap.set(importPath, cacheFile);

    if (isDev) {
      const content = fs.readFileSync(route.filePath, "utf-8");
      const compiled = compile(content, route.filePath);
      const rewroteCode = rewriteRelativeImports(
        compiled.code,
        route.filePath,
        cacheFile,
      );
      fs.writeFileSync(cacheFile, rewriteBareModuleImports(rewroteCode));
      compileTypeScriptDeps(cacheFile, cacheDir);
      compileKalDeps(cacheFile, cacheDir, process.cwd());
    }

    const layoutCacheFiles: string[] = [];
    for (const layoutPath of route.layoutPaths) {
      const layoutRelative = path.relative(pagesDir, layoutPath);
      const layoutCacheFile = path.join(
        cacheDir,
        "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
      );
      if (isDev) {
        const layoutContent = fs.readFileSync(layoutPath, "utf-8");
        const layoutCompiled = compile(layoutContent, layoutPath);
        const layoutRewroteCode = rewriteRelativeImports(
          layoutCompiled.code,
          layoutPath,
          layoutCacheFile,
        );
        fs.writeFileSync(
          layoutCacheFile,
          rewriteBareModuleImports(layoutRewroteCode),
        );
        compileTypeScriptDeps(layoutCacheFile, cacheDir);
        compileKalDeps(layoutCacheFile, cacheDir, process.cwd());
      }
      layoutCacheFiles.push(layoutCacheFile);
    }

    app.get(route.path, async (req, res, next) => {
      try {
        if (
          process.env.NODE_ENV === "development" ||
          process.env.KALLO_ENV === "development"
        ) {
          if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
          }
          const content = fs.readFileSync(route.filePath, "utf-8");
          const compiled = compile(content, route.filePath);
          const devRewroteCode = rewriteRelativeImports(
            compiled.code,
            route.filePath,
            cacheFile,
          );
          fs.writeFileSync(cacheFile, rewriteBareModuleImports(devRewroteCode));
          compileTypeScriptDeps(cacheFile, cacheDir);
          compileKalDeps(cacheFile, cacheDir, process.cwd());

          for (const layoutPath of route.layoutPaths) {
            const layoutRelative = path.relative(pagesDir, layoutPath);
            const layoutContent = fs.readFileSync(layoutPath, "utf-8");
            const layoutCompiled = compile(layoutContent, layoutPath);
            const layoutCacheFile = path.join(
              cacheDir,
              "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
            );
            const devLayoutRewroteCode = rewriteRelativeImports(
              layoutCompiled.code,
              layoutPath,
              layoutCacheFile,
            );
            fs.writeFileSync(
              layoutCacheFile,
              rewriteBareModuleImports(devLayoutRewroteCode),
            );
            compileTypeScriptDeps(layoutCacheFile, cacheDir);
            compileKalDeps(layoutCacheFile, cacheDir, process.cwd());
          }
        }

        const component = await import(`file://${cacheFile}?t=${Date.now()}`);
        const layouts: any[] = [];
        for (const layoutCacheFile of layoutCacheFiles) {
          const layout = await import(
            `file://${layoutCacheFile}?t=${Date.now()}`
          );
          layouts.push(layout);
        }

        const cacheFileName = path.basename(cacheFile);
        if (layouts.length > 0) {
          await handleSSRWithLayouts(
            req,
            res,
            component,
            layouts,
            cacheFileName,
            layoutCacheFiles.map((f) => path.basename(f)),
          );
        } else {
          await handleSSR(req, res, component, cacheFileName);
        }
      } catch (err) {
        const pagesDir = app.get("pagesDir") || path.join(process.cwd(), "src/view");
        if (err instanceof Error && err.name === "UnauthorizedError") {
          const specialFile = findSpecialFile(path.dirname(route.filePath), pagesDir, "unauthorized");
          if (specialFile) {
            try {
              await renderSpecialFile(req, res, specialFile, pagesDir, 403, {
                message: err.message
              });
              return;
            } catch (renderErr) {
              KalloLogger.error("Failed to render unauthorized.kal: " + String(renderErr));
            }
          }
          if (!res.headersSent) {
            if (typeof res.forbidden === "function") {
              res.forbidden();
            } else {
              res.status(403).send("Forbidden");
            }
          }
          return;
        }

        const specialFile = findSpecialFile(path.dirname(route.filePath), pagesDir, "error");
        if (specialFile) {
          try {
            await renderSpecialFile(req, res, specialFile, pagesDir, 500, {
              error: {
                message: err instanceof Error ? err.message : String(err),
                stack: process.env.NODE_ENV !== "production" && err instanceof Error ? err.stack : undefined
              }
            });
            return;
          } catch (renderErr) {
            KalloLogger.error("Failed to render error.kal: " + String(renderErr));
          }
        }
        next(err);
      }
    });

    KalloLogger.info(`Registered route: ${route.path} → ${relative}`);
  }

  // Catch-all 404 handler for unmatched pages
  app.get("*splat", async (req, res, next) => {
    if (req.path.startsWith("/api") || (req.accepts && !req.accepts("html"))) {
      return next();
    }
    const pagesDir = app.get("pagesDir") || path.join(process.cwd(), "src/view");
    const cleanPath = req.path.replace(/^\//, "");
    const startDir = path.join(pagesDir, cleanPath);
    const specialFile = findSpecialFile(startDir, pagesDir, "not-found");
    if (specialFile) {
      try {
        await renderSpecialFile(req, res, specialFile, pagesDir, 404, {
          message: "Page not found"
        });
        return;
      } catch (renderErr) {
        KalloLogger.error("Failed to render not-found.kal: " + String(renderErr));
      }
    }
    next();
  });
}

export function apiFileToRoutePath(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  const segments: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const isLast = i === parts.length - 1;

    if (isLast) {
      const name = part
        .replace(/\.api\.(ts|js)$/, "")
        .replace(/\.(ts|js)$/, "");
      if (name === "route" || name === "index") {
        continue;
      }
      const parent = parts[i - 1];
      if (parent && name === parent) {
        continue;
      }
      const { expressSegment } = extractParams(name);
      segments.push(expressSegment);
    } else {
      const { expressSegment } = extractParams(part);
      segments.push(expressSegment);
    }
  }

  const routePath = "/api/" + segments.join("/");
  return routePath.replace(/\/+/g, "/").replace(/\/$/, "") || "/api";
}

export function getApiEntryPoint(apiDir: string): string | null {
  const possibleEntries = [
    "index.ts",
    "index.js",
    "routes.ts",
    "routes.js",
  ];
  for (const entry of possibleEntries) {
    const fullPath = path.join(apiDir, entry);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export function compileAPIRoutes(apiDir: string, cacheDir: string) {
  if (!fs.existsSync(apiDir)) return;

  const entryPath = getApiEntryPoint(apiDir);
  if (!entryPath) {
    KalloLogger.warn(`No API entry point found in ${apiDir}. Create src/api/index.ts or routes.ts.`);
    return;
  }

  const relative = path.relative(apiDir, entryPath);
  const tsSource = fs.readFileSync(entryPath, "utf-8");

  let transpiledCode = tsSource;
  if (entryPath.endsWith(".ts")) {
    const transpiled = ts.transpileModule(tsSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });
    transpiledCode = transpiled.outputText;
  }

  const cacheFileName =
    "api_" + relative.replace(/[\/\\]/g, "_").replace(/\.(ts|js)$/, ".js");
  const cacheFile = path.join(cacheDir, cacheFileName);

  const rewroteOutput = rewriteRelativeImports(
    transpiledCode,
    entryPath,
    cacheFile,
  );
  fs.writeFileSync(cacheFile, rewriteBareModuleImports(rewroteOutput));

  compileTypeScriptDeps(cacheFile, cacheDir);
  compileKalDeps(cacheFile, cacheDir, process.cwd());

  KalloLogger.info(
    `Compiled API entry route: /api → ${path.basename(cacheDir)}/${cacheFileName}`,
  );
}

export function registerAPIRoutes(app: express.Express, apiDir: string) {
  if (!fs.existsSync(apiDir)) return;

  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const entryPath = getApiEntryPoint(apiDir);
  if (!entryPath) {
    KalloLogger.warn(`No API entry point found in ${apiDir}. Create src/api/index.ts or routes.ts.`);
    return;
  }

  const relative = path.relative(apiDir, entryPath);
  const cacheFileName =
    "api_" + relative.replace(/[\/\\]/g, "_").replace(/\.(ts|js)$/, ".js");
  const cacheFile = path.join(cacheDir, cacheFileName);

  app.use(
    "/api",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (
          process.env.NODE_ENV === "development" ||
          process.env.KALLO_ENV === "development"
        ) {
          const freshTsSource = fs.readFileSync(entryPath, "utf-8");
          let freshTranspiledCode = freshTsSource;
          if (entryPath.endsWith(".ts")) {
            const freshTranspiled = ts.transpileModule(freshTsSource, {
              compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2022,
              },
            });
            freshTranspiledCode = freshTranspiled.outputText;
          }
          const freshRewrote = rewriteRelativeImports(
            freshTranspiledCode,
            entryPath,
            cacheFile,
          );
          fs.writeFileSync(
            cacheFile,
            rewriteBareModuleImports(freshRewrote),
          );
          compileTypeScriptDeps(cacheFile, cacheDir);
          compileKalDeps(cacheFile, cacheDir, process.cwd());
        }

        const apiModule = await import(
          `file://${cacheFile}?t=${Date.now()}`
        );
        const router = apiModule.default || apiModule;

        if (router && typeof router.handle === "function" && !router.use) {
          const handled = router.handle(req.method, req.path, req, res);
          if (!handled) {
            next();
          }
        } else if (typeof router === "function") {
          router(req, res, next);
        } else {
          next();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  KalloLogger.info(`Registered API route: /api → ${relative}`);
}

export async function handleSSRWithLayouts(
  req: Request,
  res: Response,
  component: any,
  layouts: any[],
  cacheFileName?: string,
  layoutCacheFileNames: string[] = [],
) {
  try {
    const ctx = {
      req,
      res,
      params: req.params,
      query: req.query,
    };

     if (component.$serverGuard) {
      const allowed = await component.$serverGuard(ctx);
      if (allowed === false) {
        throw new UnauthorizedError();
      }
    }

    for (const layout of layouts) {
      if (layout.$serverGuard) {
        const allowed = await layout.$serverGuard(ctx);
        if (allowed === false) {
          throw new UnauthorizedError();
        }
      }
    }

    const layoutStates: Record<string, any>[] = [];
    let mergedMeta = {};

    for (const layout of layouts) {
      const layoutState = layout.$serverPage
        ? (await layout.$serverPage(ctx)) || {}
        : {};
      layoutStates.push(layoutState);

      if (layout.$serverMeta) {
        const layoutMeta = await layout.$serverMeta(layoutState);
        if (layoutMeta) {
          mergedMeta = mergeMetadata(mergedMeta, layoutMeta);
        }
      }
    }

    let state = component.$serverPage
      ? (await component.$serverPage(ctx)) || {}
      : {};
    if (component.$serverMeta) {
      const pageMeta = await component.$serverMeta(state);
      if (pageMeta) {
        mergedMeta = mergeMetadata(mergedMeta, pageMeta);
      }
    }

    if (res.headersSent) {
      return;
    }

    const metaHTML = renderMetadataHTML(mergedMeta);

    if (component.setup) {
      const clientSetupState = component.setup(state) || {};
      state = { ...state, ...clientSetupState };
    }

    const renderState = new Proxy(state, {
      get(target, key) {
        if (key === "state") return target;
        const val = Reflect.get(target, key);
        if (val && typeof val === "object" && typeof val.get === "function") {
          return val.get();
        }
        return val;
      },
    });

    const ssrCtx = { headTags: [] as string[] };
    (globalThis as any).__kallo_ssr_context__ = ssrCtx;

    let htmlContent = "";
    try {
      const pageContent = component.render ? component.render(renderState) : "";
      htmlContent = pageContent;
      for (let i = layouts.length - 1; i >= 0; i--) {
        const layout = layouts[i];
        let layoutState = layoutStates[i] || {};
        if (layout.setup) {
          const clientSetupState = layout.setup(layoutState) || {};
          layoutState = { ...layoutState, ...clientSetupState };
        }
        const layoutRenderState = new Proxy(layoutState, {
          get(target, key) {
            if (key === "state") return target;
            const val = Reflect.get(target, key);
            if (val && typeof val === "object" && typeof val.get === "function") {
              return val.get();
            }
            return val;
          },
        });
        htmlContent = layout.render
          ? layout.render(layoutRenderState, {
              default: () => htmlContent,
            })
          : htmlContent;
      }
    } finally {
      delete (globalThis as any).__kallo_ssr_context__;
    }

    const headTagsHTML = ssrCtx.headTags.join("\n");

    let styleHTML = "";
    if (component.css) {
      styleHTML += `<style id="kallo-style-${component.componentId || "app"}">${component.css}</style>`;
    }
    for (let i = 0; i < layouts.length; i++) {
      const layout = layouts[i];
      if (layout.css) {
        styleHTML += `<style id="kallo-style-${layout.componentId || "layout_" + i}">${layout.css}</style>`;
      }
    }
    if ((ssrCtx as any).css) {
      for (const itemStr of (ssrCtx as any).css) {
        try {
          const item = JSON.parse(itemStr);
          styleHTML += `<style id="kallo-style-${item.id}">${item.css}</style>`;
        } catch {}
      }
    }

    const routePath = req.route?.path || req.path;
    const resolvedCacheFileName =
      cacheFileName ||
      (routePath === "/"
        ? `index${SFC_EXTENSION}.js`
        : `${routePath.replace(/^\//, "").replace(/[\/\\]/g, "_")}${SFC_EXTENSION}.js`);
    const componentId = component.componentId || "app";
    const stateJSON = serializeForScript(state);

    if (req.headers && req.headers["x-kallo-navigation"]) {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          html: htmlContent,
          state: state,
          layoutStates: layoutStates,
          cacheFileName: resolvedCacheFileName,
          layoutCacheFileNames: layoutCacheFileNames,
          componentId: component.componentId || "app",
          metadata: {
            title: (mergedMeta as any).title || "",
          },
        })
      );
      return;
    }

    let hydrationScript = "";
    if (layouts.length > 0) {
      const layoutStatesJSON = layoutStates.map((s) => serializeForScript(s));
      hydrationScript = generateHydrationScriptWithLayouts(
        resolvedCacheFileName,
        componentId,
        stateJSON,
        layoutCacheFileNames,
        layoutStatesJSON,
      );
    } else {
      hydrationScript = component.setup
        ? generateHydrationScript(resolvedCacheFileName, componentId, stateJSON)
        : "";
    }

    let faviconTag = "";
    const hasFavicon =
      headTagsHTML.includes('rel="icon"') ||
      headTagsHTML.includes("rel='icon'") ||
      headTagsHTML.includes('rel="shortcut icon"') ||
      headTagsHTML.includes("rel='shortcut icon'") ||
      metaHTML.includes('rel="icon"') ||
      metaHTML.includes("rel='icon'");

    if (!hasFavicon) {
      faviconTag = `\n  <link rel="icon" href="/favicon.ico">`;
    }

    let hmrClientScript = "";
    if (process.env.NODE_ENV === "development" || process.env.KALLO_ENV === "development") {
      hmrClientScript = `
<script type="module">
  if (typeof window !== 'undefined') {
    const es = new EventSource('/kallo-hmr');
    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'reload') {
          console.log('[Kallo HMR] Change detected, reloading page...');
          window.location.reload();
        }
      } catch (err) {}
    });
    console.log('[Kallo HMR] Connected to dev server HMR');
  }
</script>
      `;
    }

    let fullHTML = "";
    const hasHtmlOrBody = /<html|<body/i.test(htmlContent);

    if (hasHtmlOrBody) {
      fullHTML = htmlContent;
      if (!/^<!DOCTYPE/i.test(fullHTML.trim())) {
        fullHTML = "<!DOCTYPE html>\n" + fullHTML;
      }
      const headInject = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metaHTML}${faviconTag}${headTagsHTML}${styleHTML}`;
      if (/<head[^>]*>/i.test(fullHTML)) {
        fullHTML = fullHTML.replace(/(<head[^>]*>)/i, `$1${headInject}`);
      } else if (/<html[^>]*>/i.test(fullHTML)) {
        fullHTML = fullHTML.replace(/(<html[^>]*>)/i, `$1<head>${headInject}</head>`);
      }
      const bodyInject = `${hydrationScript}${hmrClientScript}`;
      if (/<body[^>]*>/i.test(fullHTML)) {
        if (!/id=["']app["']/i.test(fullHTML)) {
          fullHTML = fullHTML.replace(/(<body[^>]*>)/i, `$1<div id="app">`);
          fullHTML = fullHTML.replace(/(<\/body>)/i, `${bodyInject}</div>$1`);
        } else {
          fullHTML = fullHTML.replace(/(<\/body>)/i, `${bodyInject}$1`);
        }
      }
    } else {
      fullHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${metaHTML}${faviconTag}
  ${headTagsHTML}
  ${styleHTML}
</head>
<body>
  <div id="app">${htmlContent}</div>
  ${hydrationScript}${hmrClientScript}
</body>
</html>`;
    }

    res.status(200).send(fullHTML);
  } catch (err: any) {
    if (err.isKalloAbort === true && typeof err.statusCode === "number") {
      if (!res.headersSent) {
        res.status(err.statusCode).end();
      }
      return;
    }
    KalloLogger.error(
      "SSR Layouts Rendering Error: " +
        (err instanceof Error ? err.stack : String(err)),
    );
    if (!res.headersSent) {
      if (typeof res.serverError === "function") {
        res.serverError(err.message);
      } else {
        res.status(500).send(err.message || "Internal Server Error");
      }
    }
  }
}

export interface ServerInstance {
  app: express.Express;
  start: () => any;
}

function rewriteBrowserImports(content: string): string {
  let result = content.replace(
    /(\b(?:import|export)\s+[\s\S]*?\s+from\s+['"]|import\s+['"])@kallo\/runtime(['"])/g,
    "$1/@kallo/runtime/index.js$2",
  );

  const pomPackages = ["@kallo/runtime", "@kallo/shared", "@kallo/types"];
  for (const pkg of pomPackages) {
    const pkgDir = resolvePackageToAbsolute(pkg);
    if (!pkgDir) continue;

    const absEntry = `file://${pkgDir.replace(/\\/g, "/")}`;
    const escapedPkgDir = absEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(\\b(?:import|export)\\s+[\\s\\S]*?\\s+from\\s+['"]|import\\s+['"])${escapedPkgDir}([^'"]*)(['"])`,
      "g",
    );

    const shortName = pkg.replace("@kallo/", "");
    result = result.replace(regex, (match, prefix, subpath, suffix) => {
      let targetPath = `/@kallo/${shortName}${subpath}`;
      if (subpath.startsWith("/dist/")) {
        targetPath = `/@kallo/${shortName}/${subpath.slice(6)}`;
      } else if (subpath === "/dist/index.js") {
        targetPath = `/@kallo/${shortName}/index.js`;
      }
      return `${prefix}${targetPath}${suffix}`;
    });
  }

  return result;
}

export function createServer(config: FrameworkConfig): ServerInstance {
  loadEnv(config.env);
  const name = formatFrameworkName(config);
  KalloLogger.info(`Creating server for ${name}...`);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(responseHelpersMiddleware);

  const serverCleanup: Array<() => void> = [];

  const routeCacheMap = new Map<string, string>();
  app.set("routeCacheMap", routeCacheMap);

  // Serve @kallo/runtime client-side files
  try {
    const runtimePkgPath = require.resolve("@kallo/runtime/package.json", {
      paths: [process.cwd()],
    });
    const runtimeDir = path.dirname(runtimePkgPath);
    app.use("/@kallo/runtime", express.static(path.join(runtimeDir, "dist")));
  } catch (err) {
    let resolved = false;
    const pathsToTry = [
      path.join(__dirname, "../../../runtime"),
      path.join(process.cwd(), "packages/runtime"),
      path.join(process.cwd(), "../runtime"),
    ];
    for (const p of pathsToTry) {
      if (fs.existsSync(path.join(p, "package.json"))) {
        app.use("/@kallo/runtime", express.static(path.join(p, "dist")));
        resolved = true;
        break;
      }
    }
    if (!resolved) {
      KalloLogger.warn(
        "Could not resolve @kallo/runtime path for static serving: " +
          String(err),
      );
    }
  }

  app.use("/@kallo/view", (req, res, next) => {
    const cleanPath = decodeURIComponent(req.path).replace(/^\//, "");
    let cacheFileName = cleanPath;
    if (cleanPath.endsWith(SFC_EXTENSION)) {
      const importPath = "/" + cleanPath;
      const cacheFile = routeCacheMap.get(importPath);
      if (cacheFile && fs.existsSync(cacheFile)) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        const content = fs.readFileSync(cacheFile, "utf-8");
        const processed = replaceEnvVars(stripServerBlock(rewriteBrowserImports(content)));
        res.send(processed);
        return;
      }
      cacheFileName = cleanPath.replace(/[\/\\]/g, "_") + ".js";
    }

    const cacheFile = path.join(getCacheDir(), cacheFileName);
    if (fs.existsSync(cacheFile)) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      const content = fs.readFileSync(cacheFile, "utf-8");
      const processed = replaceEnvVars(stripServerBlock(rewriteBrowserImports(content)));
      res.send(processed);
    } else {
      res.status(404).send(`Cache file not found: ${cacheFileName}`);
    }
  });

  // Serve compiled cache files
  app.use("/.kallo-cache", (req, res, next) => {
    const cleanPath = req.path.replace(/^\//, "");
    const cacheFile = path.join(getCacheDir(), cleanPath);
    if (fs.existsSync(cacheFile)) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      const content = fs.readFileSync(cacheFile, "utf-8");
      const processed = replaceEnvVars(stripServerBlock(rewriteBrowserImports(content)));
      res.send(processed);
    } else {
      res.status(404).send("Not found");
    }
  });

  // On-the-fly TypeScript compilation middleware for dev mode
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }
    const parsedPath = path.parse(req.path);
    if (parsedPath.ext !== ".js") {
      return next();
    }

    const tsFilePath = path.join(
      process.cwd(),
      req.path.replace(/\.js$/, ".ts"),
    );
    if (fs.existsSync(tsFilePath)) {
      try {
        const sourceCode = fs.readFileSync(tsFilePath, "utf-8");
        const transpiled = ts.transpileModule(sourceCode, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            isolatedModules: true,
          },
        });
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.send(rewriteBrowserImports(transpiled.outputText));
        return;
      } catch (err) {
        KalloLogger.error(
          `On-the-fly TS compilation failed for ${tsFilePath}: ` + String(err),
        );
        res.status(500).send("Compilation error: " + String(err));
        return;
      }
    }
    next();
  });

  // Serve public directory if it exists
  const publicDir = path.join(process.cwd(), "public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // Serve other project root files statically (e.g. assets, static resources)
  app.use(express.static(process.cwd()));

  // CORS Configuration
  if (config.cors) {
    const corsOptions = config.cors;
    app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = corsOptions.origin;
      if (origin) {
        if (Array.isArray(origin)) {
          const reqOrigin = req.headers.origin;
          if (reqOrigin && origin.includes(reqOrigin)) {
            res.setHeader("Access-Control-Allow-Origin", reqOrigin);
          }
        } else {
          res.setHeader("Access-Control-Allow-Origin", origin);
        }
      }
      if (corsOptions.credentials) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      if (corsOptions.methods) {
        res.setHeader(
          "Access-Control-Allow-Methods",
          corsOptions.methods.join(", "),
        );
      } else {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        );
      }
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With",
      );

      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  // Authentication & Session Configuration
  if (config.auth) {
    const authOptions = config.auth;
    const cookieName = authOptions.cookieName || "kallo.session";

    // 1. Simple custom cookie parser
    app.use((req: Request, res: Response, next: NextFunction) => {
      const cookieHeader = req.headers.cookie;
      const cookies: Record<string, string> = {};
      if (cookieHeader) {
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.split("=");
          const k = parts[0];
          const v = parts[1];
          if (parts.length === 2 && k && v) {
            cookies[k.trim()] = v.trim();
          }
        });
      }
      (req as any).cookies = cookies;
      next();
    });

    // 2. Session identification and context injection
    app.use((req: Request, res: Response, next: NextFunction) => {
      const token = (req as any).cookies?.[cookieName];
      if (token) {
        const user = verifyToken(token, authOptions.secret);
        if (user) {
          (req as any).user = user;
          (req as any).session = { user };
        }
      }
      next();
    });

    // 3. NextAuth-like built-in auth API endpoints
    app.get("/api/auth/session", (req: Request, res: Response) => {
      res.json({ user: (req as any).user || null });
    });

    app.post("/api/auth/signin", async (req: Request, res: Response) => {
      const { provider: providerId, credentials } = req.body || {};
      if (!providerId || !credentials) {
        res.status(400).json({ error: "Missing provider or credentials" });
        return;
      }

      const provider = authOptions.providers?.find((p) => p.id === providerId);
      if (!provider) {
        res.status(400).json({ error: `Provider ${providerId} not found` });
        return;
      }

      try {
        const user = await provider.authorize(credentials);
        if (!user) {
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }

        const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
        const token = signToken(user, authOptions.secret, SESSION_MAX_AGE_MS);
        res.cookie(cookieName, token, {
          httpOnly: true,
          secure:
            config.env === "production" ||
            process.env.NODE_ENV === "production",
          path: "/",
          domain: authOptions.cookieDomain,
          maxAge: SESSION_MAX_AGE_MS,
          sameSite: "lax",
        });

        res.json({ user });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    app.post("/api/auth/signout", (req: Request, res: Response) => {
      res.clearCookie(cookieName, {
        httpOnly: true,
        secure:
          config.env === "production" || process.env.NODE_ENV === "production",
        path: "/",
        domain: authOptions.cookieDomain,
      });
      res.json({ success: true });
    });
  }

  app.get("/favicon.ico", (req: Request, res: Response, next: NextFunction) => {
    const faviconPath = path.join(process.cwd(), "public/favicon.ico");
    if (fs.existsSync(faviconPath)) {
      res.sendFile(faviconPath);
    } else {
      const defaultFavicon = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVR42mP8z8BQD8AEjDqAYVAZGA2DyoBhUBkYDYPKgGFQGRgNg8qAYVAZGA2DCgCt2gf82rr1OQAAAABJRU5ErkJggg==",
        "base64",
      );
      res.writeHead(200, {
        "Content-Type": "image/x-icon",
        "Content-Length": defaultFavicon.length,
      });
      res.end(defaultFavicon);
    }
  });

  const isDev = config.env === "development" || !config.env;
  // Dev HMR (file watchers + SSE) is wired up lazily in start(), so merely
  // constructing a server never spawns watchers or leaks handles.
  const setupDevHmr = () => {
    if (!isDev) return;
    app.use((req: Request, _res: Response, next: NextFunction) => {
      KalloLogger.info(`${req.method} ${req.url}`);
      next();
    });

    const hmrClients = new Set<Response>();
    serverCleanup.push(() => {
      for (const client of hmrClients) {
        try {
          client.end();
        } catch {
          // client already closed
        }
      }
      hmrClients.clear();
    });

    app.get("/kallo-hmr", (req: Request, res: Response) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      hmrClients.add(res);

      req.on("close", () => {
        hmrClients.delete(res);
      });
    });

    const srcDir = path.join(process.cwd(), "src");
    if (fs.existsSync(srcDir)) {
      const watchers: fs.FSWatcher[] = [];
      let debounceTimer: NodeJS.Timeout | null = null;
      serverCleanup.push(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        for (const watcher of watchers) {
          try {
            watcher.close();
          } catch {
            // watcher already closed
          }
        }
        watchers.length = 0;
      });
      const watchCallback = (event: string, filePath: string) => {
        if (
          filePath.endsWith(".kal") ||
          filePath.endsWith(".ts") ||
          filePath.endsWith(".js") ||
          filePath.endsWith(".css")
        ) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            KalloLogger.info(`[Kallo Dev] File change detected: ${filePath}. Notifying clients...`);
            const msg = JSON.stringify({ type: "reload" });
            for (const client of hmrClients) {
              client.write(`data: ${msg}\n\n`);
            }
          }, 100);
        }
      };

      const watchDir = (dirPath: string) => {
        try {
          const watcher = fs.watch(dirPath, (event, filename) => {
            if (filename) {
              const fullPath = path.join(dirPath, filename);
              try {
                if (fs.statSync(fullPath).isDirectory()) {
                  watchDir(fullPath);
                }
              } catch {}
              watchCallback(event, fullPath);
            }
          });
          watchers.push(watcher);
        } catch {}

        try {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            const fullPath = path.join(dirPath, file);
            try {
              if (fs.statSync(fullPath).isDirectory()) {
                watchDir(fullPath);
              }
            } catch {}
          }
        } catch {}
      };

      watchDir(srcDir);
      KalloLogger.info(`[Kallo Dev] Watching ${srcDir} for HMR...`);
    }
  };

  return {
    app,
    start() {
      setupDevHmr();
      app.use(errorHandler);

      const port = config.port || 3000;
      const server = app.listen(port, () => {
        KalloLogger.info(`Kallo server running at http://localhost:${port}`);
      });

      const originalClose = server.close.bind(server);
      server.close = ((cb?: (err?: Error) => void) => {
        for (const cleanup of serverCleanup) {
          try {
            cleanup();
          } catch {
            // ignore cleanup failures during shutdown
          }
        }
        return originalClose(cb);
      }) as typeof server.close;

      return server;
    },
  };
}
