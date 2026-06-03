import type { Request, Response, NextFunction } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { compile } from "@pomelo/compiler";
import { PomeloLogger, formatFrameworkName, rewriteRelativeImports } from "@pomelo/shared";
import type { FrameworkConfig } from "@pomelo/types";
import { PomeloError } from "./errors.js";
import { scanRoutes, sortRoutesBySpecificity } from "./route-scanner.js";
import { mergeMetadata, renderMetadataHTML } from "./metadata.js";
import { signToken, verifyToken } from "./auth.js";

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
  if (err instanceof PomeloError) {
    PomeloLogger.error(`${err.name}: ${err.message}`);
    if (!res.headersSent) {
      res.status(err.statusCode).json({
        error: err.message,
        type: err.name,
      });
    }
    return;
  }

  PomeloLogger.error(
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
import { hydrate } from "/@pomelo/runtime/index.js";
import * as component from "/@pomelo/pages/${cacheFileName}";
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
  imports.push(`import * as component from "/@pomelo/pages/${cacheFileName}";`);
  for (let i = 0; i < layoutCacheFileNames.length; i++) {
    imports.push(`import * as layout_${i} from "/@pomelo/pages/${layoutCacheFileNames[i]}";`);
  }

  return `<script type="module">
import { hydrate } from "/@pomelo/runtime/index.js";
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

export async function handleSSR(req: Request, res: Response, component: any, cacheFileName?: string) {
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
      }
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
      styleHTML = `<style id="pom-style-${component.componentId || "app"}">${component.css}</style>`;
    }

    const routePath = req.route?.path || req.path;
    const resolvedCacheFileName = cacheFileName || (routePath === "/" ? "index.pom.js" : `${routePath.replace(/^\//, "").replace(/[\/\\]/g, "_")}.pom.js`);
    const componentId = component.componentId || "app";
    const stateJSON = JSON.stringify(state);
    const hydrationScript = component.setup
      ? generateHydrationScript(resolvedCacheFileName, componentId, stateJSON)
      : "";

    const fullHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${metaHTML}
  ${styleHTML}
</head>
<body>
  <div id="app">${htmlContent}</div>
  ${hydrationScript}
</body>
</html>`;

    res.status(200).send(fullHTML);
  } catch (err: any) {
    if (err.isPomeloAbort === true && typeof err.statusCode === "number") {
      if (!res.headersSent) {
        res.status(err.statusCode).end();
      }
      return;
    }
    PomeloLogger.error(
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
      }
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

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    res.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${metaHTML}${styleHTML}</head><body><div id="app">`);
    res.write(htmlContent);
    res.write(`</div></body></html>`);
    res.end();
  } catch (err: any) {
    if (err.isPomeloAbort === true && typeof err.statusCode === "number") {
      if (!res.headersSent) {
        res.status(err.statusCode).end();
      }
      return;
    }
    PomeloLogger.error(
      "SSR Stream Error: " +
        (err instanceof Error ? err.stack : String(err)),
    );
    if (!res.headersSent) {
      res.serverError(err.message);
    }
  }
}

function compileTypeScriptDeps(cacheFile: string, cacheDir: string, visited: Set<string> = new Set()): void {
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
        const depCacheName = "dep_" + relative.replace(/[\/\\]/g, "_").replace(/\.ts$/, ".js");
        const depCacheFile = path.join(cacheDir, depCacheName);
        
        // Rewrite imports inside the transpiled dependency to be relative to the cache directory
        const rewroteOutput = rewriteRelativeImports(transpiled.outputText, absoluteTsPath, depCacheFile);
        fs.writeFileSync(depCacheFile, rewroteOutput);

        compileTypeScriptDeps(depCacheFile, cacheDir, visited);

        const newRelPath = "./" + path.relative(path.dirname(cacheFile), depCacheFile).replace(/\\/g, "/");
        rewrites.set(importPath, newRelPath);
      }
    }
  }

  if (rewrites.size > 0) {
    for (const [oldPath, newPath] of rewrites) {
      content = content.replace(
        new RegExp(`from\\s+['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`, "g"),
        `from "${newPath}"`,
      );
    }
    fs.writeFileSync(cacheFile, content);
  }
}

export function registerFileSystemRoutes(
  app: express.Express,
  pagesDir: string,
) {
  if (!fs.existsSync(pagesDir)) return;

  const routes = sortRoutesBySpecificity(scanRoutes(pagesDir));
  const cacheDir = path.join(process.cwd(), ".pomelo-cache");

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const routeCacheMap = app.get("routeCacheMap") || new Map<string, string>();

  for (const route of routes) {
    const relative = path.relative(pagesDir, route.filePath);
    const content = fs.readFileSync(route.filePath, "utf-8");
    const compiled = compile(content, route.path);

    const cacheFile = path.join(
      cacheDir,
      relative.replace(/[\/\\]/g, "_") + ".js",
    );
    const importPath = route.path === "/" ? "/index.pom" : `${route.path}.pom`;
    routeCacheMap.set(importPath, cacheFile);
    const rewroteCode = rewriteRelativeImports(compiled.code, route.filePath, cacheFile);
    fs.writeFileSync(cacheFile, rewroteCode);
    compileTypeScriptDeps(cacheFile, cacheDir);

    const layoutCacheFiles: string[] = [];
    for (const layoutPath of route.layoutPaths) {
      const layoutRelative = path.relative(pagesDir, layoutPath);
      const layoutContent = fs.readFileSync(layoutPath, "utf-8");
      const layoutCompiled = compile(layoutContent, "__layout__");
      const layoutCacheFile = path.join(
        cacheDir,
        "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
      );
      const layoutRewroteCode = rewriteRelativeImports(layoutCompiled.code, layoutPath, layoutCacheFile);
      fs.writeFileSync(layoutCacheFile, layoutRewroteCode);
      compileTypeScriptDeps(layoutCacheFile, cacheDir);
      layoutCacheFiles.push(layoutCacheFile);
    }

    app.get(route.path, async (req, res, next) => {
      try {
        if (process.env.NODE_ENV === "development" || process.env.POMELO_ENV === "development") {
          const content = fs.readFileSync(route.filePath, "utf-8");
          const compiled = compile(content, route.path);
          const devRewroteCode = rewriteRelativeImports(compiled.code, route.filePath, cacheFile);
          fs.writeFileSync(cacheFile, devRewroteCode);
          compileTypeScriptDeps(cacheFile, cacheDir);

          for (const layoutPath of route.layoutPaths) {
            const layoutRelative = path.relative(pagesDir, layoutPath);
            const layoutContent = fs.readFileSync(layoutPath, "utf-8");
            const layoutCompiled = compile(layoutContent, "__layout__");
            const layoutCacheFile = path.join(
              cacheDir,
              "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
            );
            const devLayoutRewroteCode = rewriteRelativeImports(layoutCompiled.code, layoutPath, layoutCacheFile);
            fs.writeFileSync(layoutCacheFile, devLayoutRewroteCode);
            compileTypeScriptDeps(layoutCacheFile, cacheDir);
          }
        }

        const component = await import(`file://${cacheFile}?t=${Date.now()}`);
        const layouts: any[] = [];
        for (const layoutCacheFile of layoutCacheFiles) {
          const layout = await import(`file://${layoutCacheFile}?t=${Date.now()}`);
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
        next(err);
      }
    });

    PomeloLogger.info(`Registered route: ${route.path} → ${relative}`);
  }
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
        if (!res.headersSent) {
          res.forbidden();
        }
        return;
      }
    }

    for (const layout of layouts) {
      if (layout.$serverGuard) {
        const allowed = await layout.$serverGuard(ctx);
        if (allowed === false) {
          if (!res.headersSent) {
            res.forbidden();
          }
          return;
        }
      }
    }

    const layoutStates: Record<string, any>[] = [];
    let mergedMeta = {};

    for (const layout of layouts) {
      const layoutState = layout.$serverPage ? (await layout.$serverPage(ctx)) || {} : {};
      layoutStates.push(layoutState);

      if (layout.$serverMeta) {
        const layoutMeta = await layout.$serverMeta(layoutState);
        if (layoutMeta) {
          mergedMeta = mergeMetadata(mergedMeta, layoutMeta);
        }
      }
    }

    let state = component.$serverPage ? (await component.$serverPage(ctx)) || {} : {};
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
      }
    });

    const pageContent = component.render ? component.render(renderState) : "";

    let htmlContent = pageContent;
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
        }
      });
      htmlContent = layout.render
        ? layout.render(layoutRenderState, {
            default: () => htmlContent,
          })
        : htmlContent;
    }

    let styleHTML = "";
    if (component.css) {
      styleHTML += `<style id="pom-style-${component.componentId || "app"}">${component.css}</style>`;
    }
    for (let i = 0; i < layouts.length; i++) {
      const layout = layouts[i];
      if (layout.css) {
        styleHTML += `<style id="pom-style-${layout.componentId || "layout_" + i}">${layout.css}</style>`;
      }
    }

    const routePath = req.route?.path || req.path;
    const resolvedCacheFileName = cacheFileName || (routePath === "/" ? "index.pom.js" : `${routePath.replace(/^\//, "").replace(/[\/\\]/g, "_")}.pom.js`);
    const componentId = component.componentId || "app";
    const stateJSON = JSON.stringify(state);

    let hydrationScript = "";
    if (layouts.length > 0) {
      const layoutStatesJSON = layoutStates.map(s => JSON.stringify(s));
      hydrationScript = generateHydrationScriptWithLayouts(
        resolvedCacheFileName,
        componentId,
        stateJSON,
        layoutCacheFileNames,
        layoutStatesJSON
      );
    } else {
      hydrationScript = component.setup
        ? generateHydrationScript(resolvedCacheFileName, componentId, stateJSON)
        : "";
    }

    const fullHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${metaHTML}
  ${styleHTML}
</head>
<body>
  <div id="app">${htmlContent}</div>
  ${hydrationScript}
</body>
</html>`;

    res.status(200).send(fullHTML);
  } catch (err: any) {
    if (err.isPomeloAbort === true && typeof err.statusCode === "number") {
      if (!res.headersSent) {
        res.status(err.statusCode).end();
      }
      return;
    }
    PomeloLogger.error(
      "SSR Layouts Rendering Error: " +
        (err instanceof Error ? err.stack : String(err)),
    );
    if (!res.headersSent) {
      res.serverError(err.message);
    }
  }
}

export interface ServerInstance {
  app: express.Express;
  start: () => any;
}

function rewriteBrowserImports(content: string): string {
  return content.replace(
    /(\b(?:import|export)\s+[\s\S]*?\s+from\s+['"]|import\s+['"])@pomelo\/runtime(['"])/g,
    "$1/@pomelo/runtime/index.js$2"
  );
}

export function createServer(config: FrameworkConfig): ServerInstance {
  const name = formatFrameworkName(config);
  PomeloLogger.info(`Creating server for ${name}...`);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(responseHelpersMiddleware);

  const routeCacheMap = new Map<string, string>();
  app.set("routeCacheMap", routeCacheMap);

  // Serve @pomelo/runtime client-side files
  try {
    const runtimePkgPath = require.resolve("@pomelo/runtime/package.json", { paths: [process.cwd()] });
    const runtimeDir = path.dirname(runtimePkgPath);
    app.use("/@pomelo/runtime", express.static(path.join(runtimeDir, "dist")));
  } catch (err) {
    let resolved = false;
    const pathsToTry = [
      path.join(__dirname, "../../../runtime"),
      path.join(process.cwd(), "packages/runtime"),
      path.join(process.cwd(), "../runtime"),
    ];
    for (const p of pathsToTry) {
      if (fs.existsSync(path.join(p, "package.json"))) {
        app.use("/@pomelo/runtime", express.static(path.join(p, "dist")));
        resolved = true;
        break;
      }
    }
    if (!resolved) {
      PomeloLogger.warn("Could not resolve @pomelo/runtime path for static serving: " + String(err));
    }
  }

  app.use("/@pomelo/pages", (req, res, next) => {
    const cleanPath = decodeURIComponent(req.path).replace(/^\//, "");
    let cacheFileName = cleanPath;
    if (cleanPath.endsWith(".pom")) {
      const importPath = "/" + cleanPath;
      const cacheFile = routeCacheMap.get(importPath);
      if (cacheFile && fs.existsSync(cacheFile)) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        const content = fs.readFileSync(cacheFile, "utf-8");
        res.send(rewriteBrowserImports(content));
        return;
      }
      cacheFileName = cleanPath.replace(/[\/\\]/g, "_") + ".js";
    }

    const cacheFile = path.join(process.cwd(), ".pomelo-cache", cacheFileName);
    if (fs.existsSync(cacheFile)) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      const content = fs.readFileSync(cacheFile, "utf-8");
      res.send(rewriteBrowserImports(content));
    } else {
      res.status(404).send(`Cache file not found: ${cacheFileName}`);
    }
  });

  // Serve compiled cache files
  app.use("/.pomelo-cache", (req, res, next) => {
    const cleanPath = req.path.replace(/^\//, "");
    const cacheFile = path.join(process.cwd(), ".pomelo-cache", cleanPath);
    if (fs.existsSync(cacheFile)) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      const content = fs.readFileSync(cacheFile, "utf-8");
      res.send(rewriteBrowserImports(content));
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

    const tsFilePath = path.join(process.cwd(), req.path.replace(/\.js$/, ".ts"));
    if (fs.existsSync(tsFilePath)) {
      try {
        const sourceCode = fs.readFileSync(tsFilePath, "utf-8");
        const transpiled = ts.transpileModule(sourceCode, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            isolatedModules: true,
          }
        });
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.send(rewriteBrowserImports(transpiled.outputText));
        return;
      } catch (err) {
        PomeloLogger.error(`On-the-fly TS compilation failed for ${tsFilePath}: ` + String(err));
        res.status(500).send("Compilation error: " + String(err));
        return;
      }
    }
    next();
  });

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
        res.setHeader("Access-Control-Allow-Methods", corsOptions.methods.join(", "));
      } else {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
      }
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

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
    const cookieName = authOptions.cookieName || "pomelo.session";

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

        const token = signToken(user, authOptions.secret);
        res.cookie(cookieName, token, {
          httpOnly: true,
          secure: config.env === "production" || process.env.NODE_ENV === "production",
          path: "/",
          domain: authOptions.cookieDomain,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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
        secure: config.env === "production" || process.env.NODE_ENV === "production",
        path: "/",
        domain: authOptions.cookieDomain,
      });
      res.json({ success: true });
    });
  }

  const isDev = config.env === "development" || !config.env;
  if (isDev) {
    app.use(
      (req: Request, _res: Response, next: NextFunction) => {
        PomeloLogger.info(`${req.method} ${req.url}`);
        next();
      },
    );
  }

  return {
    app,
    start() {
      app.use(errorHandler);

      const port = config.port || 3000;
      const server = app.listen(port, () => {
        PomeloLogger.info(`Pomelo server running at http://localhost:${port}`);
      });
      return server;
    },
  };
}
