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

  private addRoute(method: string, path: string, handler: Handler) {
    if (!this.routes[method]) {
      this.routes[method] = {};
    }
    this.routes[method]![path] = handler;
  }

  handle(method: string, path: string, req: any, res: any): boolean {
    const handler = this.routes[method]?.[path];
    if (handler) {
      handler(req, res);
      return true;
    }
    return false;
  }
}

export function $router(): Router {
  PomeloLogger.info("Initializing new Pomelo router...");
  return new Router();
}
