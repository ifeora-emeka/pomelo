import type { Request, Response, NextFunction } from "express";

export interface AuthUser {
  id: string;
  roles?: string[];
}

interface AuthRequest extends Request {
  user?: AuthUser;
  session?: { user: AuthUser };
}

export type AuthProvider = (req: Request) => Promise<AuthUser | null>;

export function $auth(provider?: AuthProvider) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (provider) {
        const user = await provider(req);
        if (!user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        (req as AuthRequest).user = user;
        (req as AuthRequest).session = { user };
        next();
      } else {
        const user = (req as AuthRequest).user;
        if (!user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        next();
      }
    } catch (err) {
      next(err);
    }
  };
}

export function $roles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
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
