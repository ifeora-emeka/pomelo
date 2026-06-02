import type { Request, Response, NextFunction } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { compile } from "@pomelo/compiler";
import { PomeloLogger, formatFrameworkName } from "@pomelo/shared";
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
  routePath: string,
  componentId: string,
  stateJSON: string,
): string {
  return `<script type="module">
import { hydrate } from "/@pomelo/runtime";
import * as component from "/@pomelo/pages${routePath === "/" ? "/index" : routePath}.pom";
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

export async function handleSSR(req: Request, res: Response, component: any) {
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

    const htmlContent = component.render ? component.render(state) : "";

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

    const routePath = req.route?.path || req.path;
    const componentId = component.componentId || "app";
    const stateJSON = JSON.stringify(state);
    const hydrationScript = component.setup
      ? generateHydrationScript(routePath, componentId, stateJSON)
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

    const htmlContent = component.render ? component.render(state) : "";

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

  for (const route of routes) {
    const relative = path.relative(pagesDir, route.filePath);
    const content = fs.readFileSync(route.filePath, "utf-8");
    const compiled = compile(content, route.path);

    const cacheFile = path.join(
      cacheDir,
      relative.replace(/[\/\\]/g, "_") + ".js",
    );
    fs.writeFileSync(cacheFile, compiled.code);

    const layoutCacheFiles: string[] = [];
    for (const layoutPath of route.layoutPaths) {
      const layoutRelative = path.relative(pagesDir, layoutPath);
      const layoutContent = fs.readFileSync(layoutPath, "utf-8");
      const layoutCompiled = compile(layoutContent, "__layout__");
      const layoutCacheFile = path.join(
        cacheDir,
        "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
      );
      fs.writeFileSync(layoutCacheFile, layoutCompiled.code);
      layoutCacheFiles.push(layoutCacheFile);
    }

    app.get(route.path, async (req, res, next) => {
      try {
        if (process.env.NODE_ENV === "development" || process.env.POMELO_ENV === "development") {
          const content = fs.readFileSync(route.filePath, "utf-8");
          const compiled = compile(content, route.path);
          fs.writeFileSync(cacheFile, compiled.code);

          for (const layoutPath of route.layoutPaths) {
            const layoutRelative = path.relative(pagesDir, layoutPath);
            const layoutContent = fs.readFileSync(layoutPath, "utf-8");
            const layoutCompiled = compile(layoutContent, "__layout__");
            const layoutCacheFile = path.join(
              cacheDir,
              "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
            );
            fs.writeFileSync(layoutCacheFile, layoutCompiled.code);
          }
        }

        const component = await import(`file://${cacheFile}?t=${Date.now()}`);
        const layouts: any[] = [];
        for (const layoutCacheFile of layoutCacheFiles) {
          const layout = await import(`file://${layoutCacheFile}?t=${Date.now()}`);
          layouts.push(layout);
        }

        if (layouts.length > 0) {
          await handleSSRWithLayouts(req, res, component, layouts);
        } else {
          await handleSSR(req, res, component);
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

    let state: Record<string, any> = {};
    if (component.$serverPage) {
      state = (await component.$serverPage(ctx)) || {};
    }

    if (res.headersSent) {
      return;
    }

    if (component.$serverMeta) {
      const pageMeta = await component.$serverMeta(state);
      if (pageMeta) {
        mergedMeta = mergeMetadata(mergedMeta, pageMeta);
      }
    }

    const metaHTML = renderMetadataHTML(mergedMeta);

    const pageContent = component.render ? component.render(state) : "";

    let htmlContent = pageContent;
    for (let i = layouts.length - 1; i >= 0; i--) {
      const layout = layouts[i];
      const layoutState = layoutStates[i] || {};
      htmlContent = layout.render
        ? layout.render(layoutState, {
            default: () => htmlContent,
          })
        : htmlContent;
    }

    let styleHTML = "";
    if (component.css) {
      styleHTML += `<style>${component.css}</style>`;
    }
    for (const layout of layouts) {
      if (layout.css) {
        styleHTML += `<style>${layout.css}</style>`;
      }
    }

    const routePath = req.route?.path || req.path;
    const componentId = component.componentId || "app";
    const stateJSON = JSON.stringify(state);
    const hydrationScript = component.setup
      ? generateHydrationScript(routePath, componentId, stateJSON)
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

export function createServer(config: FrameworkConfig): ServerInstance {
  const name = formatFrameworkName(config);
  PomeloLogger.info(`Creating server for ${name}...`);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(responseHelpersMiddleware);

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
