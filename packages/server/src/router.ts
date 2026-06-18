/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { KalloLogger } from "@kallojs/shared";

export type Handler = (
  req: Request,
  res: Response,
  next?: NextFunction,
) => unknown;

export interface KalloRouter {
  get(path: string, ...handlers: Handler[]): void;
  post(path: string, ...handlers: Handler[]): void;
  put(path: string, ...handlers: Handler[]): void;
  delete(path: string, ...handlers: Handler[]): void;
  patch(path: string, ...handlers: Handler[]): void;
  options(path: string, ...handlers: Handler[]): void;
  head(path: string, ...handlers: Handler[]): void;
  use(path: string, ...handlers: Handler[]): void;
  use(...handlers: Handler[]): void;
  handle(method: string, path: string, req: any, res: any): boolean;
  [key: string]: any;
}

export function $router(): KalloRouter {
  KalloLogger.info("Initializing new Kallo router...");
  
  const expressRouter = express.Router();
  const customRouter: any = expressRouter;
  
  const testRoutes: Record<string, Record<string, Handler>> = {};
  const methods = ["get", "post", "put", "delete", "patch", "options", "head"];
  
  for (const m of methods) {
    const originalMethod = customRouter[m].bind(customRouter);
    customRouter[m] = (path: string, ...handlers: any[]) => {
      originalMethod(path, ...handlers);
      
      const methodUpper = m.toUpperCase();
      if (!testRoutes[methodUpper]) {
        testRoutes[methodUpper] = {};
      }
      testRoutes[methodUpper][path] = handlers[handlers.length - 1];
    };
  }
  
  const originalHandle = (expressRouter as any).handle.bind(expressRouter);
  customRouter.handle = (first: any, second: any, third: any, fourth: any): any => {
    if (typeof first === "string") {
      const method = first;
      const path = second;
      const req = third;
      const res = fourth;

      const methodRoutes = testRoutes[method.toUpperCase()];
      if (!methodRoutes) return false;

      const exactHandler = methodRoutes[path];
      if (exactHandler) {
        exactHandler(req, res);
        return true;
      }

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
    } else {
      return originalHandle(first, second, third);
    }
  };
  
  return customRouter as KalloRouter;
}
