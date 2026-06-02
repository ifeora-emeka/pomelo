import type { Request, Response, NextFunction } from "express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { compile } from "@pomelo/compiler";
import { PomeloLogger, formatFrameworkName } from "@pomelo/shared";
import type { FrameworkConfig } from "@pomelo/types";

// Type declaration extensions for Express Response
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

export function responseHelpersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.ok = (data: any) => res.status(200).json(data);
  res.created = (data: any) => res.status(201).json(data);
  res.updated = (data: any) => res.status(200).json(data);
  res.deleted = () => { res.status(204).end(); };

  res.badRequest = (message?: string) => { res.status(400).json({ error: message || "Bad Request" }); };
  res.unauthorized = (message?: string) => { res.status(401).json({ error: message || "Unauthorized" }); };
  res.forbidden = (message?: string) => { res.status(403).json({ error: message || "Forbidden" }); };
  res.notFound = (message?: string) => { res.status(404).json({ error: message || "Not Found" }); };
  res.serverError = (message?: string) => { res.status(500).json({ error: message || "Internal Server Error" }); };

  next();
}

export async function handleSSR(req: Request, res: Response, component: any) {
  try {
    const ctx = {
      req,
      res,
      params: req.params,
      query: req.query,
    };

    // 1. Run Guard if exists
    if (component.$serverGuard) {
      const allowed = await component.$serverGuard(ctx);
      if (allowed === false) {
        if (!res.headersSent) {
          res.forbidden();
        }
        return;
      }
    }

    // 2. Fetch server state if exists
    let state = {};
    if (component.$serverPage) {
      state = await component.$serverPage(ctx);
    }

    if (res.headersSent) {
      return;
    }

    // 3. Render HTML template
    const htmlContent = component.render ? component.render(state) : "";

    // 4. Resolve Meta if exists
    let metaHTML = "";
    if (component.$serverMeta) {
      const meta = await component.$serverMeta(ctx);
      if (meta) {
        if (meta.title) metaHTML += `<title>${meta.title}</title>\n`;
        if (meta.description) metaHTML += `<meta name="description" content="${meta.description}">\n`;
        if (meta.charset) metaHTML += `<meta charset="${meta.charset}">\n`;
      }
    }

    // 5. Style tag injection
    let styleHTML = "";
    if (component.css) {
      styleHTML = `<style>${component.css}</style>`;
    }

    const fullHTML = `<!DOCTYPE html>
<html>
<head>
  ${metaHTML}
  ${styleHTML}
</head>
<body>
  <div id="app">${htmlContent}</div>
</body>
</html>`;

    res.status(200).send(fullHTML);
  } catch (err: any) {
    PomeloLogger.error("SSR Rendering Error: " + (err instanceof Error ? err.stack : String(err)));
    if (!res.headersSent) {
      res.serverError(err.message);
    }
  }
}

export function registerFileSystemRoutes(app: express.Express, pagesDir: string) {
  if (!fs.existsSync(pagesDir)) return;

  function scan(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (file.endsWith(".pom")) {
        const relative = path.relative(pagesDir, fullPath);
        let routePath = "/" + relative.slice(0, -4);
        if (routePath.endsWith("/index")) {
          routePath = routePath.slice(0, -6);
        }
        if (routePath === "") {
          routePath = "/";
        }

        // Support dynamic routes like [id].pom -> :id
        routePath = routePath.replace(/\[([^\]]+)\]/g, ":$1");

        const content = fs.readFileSync(fullPath, "utf-8");
        const compiled = compile(content, routePath);

        const cacheDir = path.join(process.cwd(), ".pomelo-cache");
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }

        const cacheFile = path.join(cacheDir, relative.replace(/[\/\\]/g, "_") + ".js");
        fs.writeFileSync(cacheFile, compiled.code);

        app.get(routePath, async (req, res, next) => {
          try {
            const component = await import(`file://${cacheFile}`);
            await handleSSR(req, res, component);
          } catch (err) {
            next(err);
          }
        });
      }
    }
  }

  scan(pagesDir);
}

export function createServer(config: FrameworkConfig): {
  app: express.Express;
  start: () => any;
} {
  const name = formatFrameworkName(config);
  PomeloLogger.info(`Creating server for ${name}...`);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(responseHelpersMiddleware);

  return {
    app,
    start() {
      const port = config.port || 3000;
      const server = app.listen(port, () => {
        PomeloLogger.info(`Pomelo server running at http://localhost:${port}`);
      });
      return server;
    },
  };
}
