/* eslint-disable @typescript-eslint/no-explicit-any */
import { PomeloLogger } from "@pomelo/shared";

export type Handler = (req: any, res: any) => void;

export class Router {
  private routes: Record<string, Record<string, Handler>> = {};

  get(path: string, handler: Handler) {
    this.addRoute("GET", path, handler);
  }

  post(path: string, handler: Handler) {
    this.addRoute("POST", path, handler);
  }

  put(path: string, handler: Handler) {
    this.addRoute("PUT", path, handler);
  }

  delete(path: string, handler: Handler) {
    this.addRoute("DELETE", path, handler);
  }

  patch(path: string, handler: Handler) {
    this.addRoute("PATCH", path, handler);
  }

  options(path: string, handler: Handler) {
    this.addRoute("OPTIONS", path, handler);
  }

  head(path: string, handler: Handler) {
    this.addRoute("HEAD", path, handler);
  }

  private addRoute(method: string, path: string, handler: Handler) {
    if (!this.routes[method]) {
      this.routes[method] = {};
    }
    this.routes[method]![path] = handler;
  }

  handle(method: string, path: string, req: any, res: any): boolean {
    const methodRoutes = this.routes[method];
    if (!methodRoutes) return false;

    // First try exact match
    const exactHandler = methodRoutes[path];
    if (exactHandler) {
      exactHandler(req, res);
      return true;
    }

    // Try pattern matching (e.g. /:id)
    for (const [pattern, handler] of Object.entries(methodRoutes)) {
      if (pattern.includes(":")) {
        const paramNames: string[] = [];
        const regexStr = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
          paramNames.push(name);
          return "([^/]+)";
        });
        const regex = new RegExp(`^${regexStr}$`);
        const match = regex.exec(path);
        if (match) {
          req.params = req.params || {};
          for (let i = 0; i < paramNames.length; i++) {
            req.params[paramNames[i]!] = decodeURIComponent(match[i + 1]!);
          }
          handler(req, res);
          return true;
        }
      }
    }

    return false;
  }
}

export function $router(): Router {
  PomeloLogger.info("Initializing new Pomelo router...");
  return new Router();
}
