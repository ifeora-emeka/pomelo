import type { Request, Response, NextFunction } from "express";

export type AuthProvider = (
  req: Request,
) => Promise<{ id: string; roles?: string[] } | null>;

export function $auth(provider: AuthProvider) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await provider(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      (req as any).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function $roles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userRoles: string[] = user.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function $guard(fn: (req: Request) => Promise<boolean> | boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allowed = await fn(req);
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
