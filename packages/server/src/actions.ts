import type { Request, Response, NextFunction, Router } from "express";
import { KalloError } from "./errors.js";
import { ValidationError } from "./validate.js";

export interface ActionContext {
  req: Request;
  res: Response;
  body: Record<string, unknown>;
  params: Record<string, string>;
  user?: unknown;
}

export type ActionHandler = (ctx: ActionContext) => unknown | Promise<unknown>;

export interface ActionDefinition {
  name: string;
  handler: ActionHandler;
}

const registry = new Map<string, ActionHandler>();

/**
 * $action — defines a co-located server mutation, callable from a <form $action>
 * or fetch. The handler runs inside the Express pipeline; throw a KalloError (or
 * ValidationError) to produce a structured error response.
 *
 * Usage (in a <Server> block or *.action.ts):
 *   export const createTask = $action("createTask", async ({ body, user }) => {
 *     const data = $validate(body, { title: $rule.required() });
 *     return TaskService.create({ ...data, owner: user.id });
 *   });
 */
export function $action(
  name: string,
  handler: ActionHandler,
): ActionDefinition {
  if (registry.has(name)) {
    throw new Error(`Duplicate $action name: "${name}"`);
  }
  registry.set(name, handler);
  return { name, handler };
}

export function getAction(name: string): ActionHandler | undefined {
  return registry.get(name);
}

export function clearActions(): void {
  registry.clear();
}

export async function dispatchAction(
  name: string,
  ctx: ActionContext,
): Promise<{ status: number; body: unknown }> {
  const handler = registry.get(name);
  if (!handler) {
    return { status: 404, body: { error: `Unknown action: ${name}` } };
  }
  try {
    const result = await handler(ctx);
    return { status: 200, body: { data: result ?? null } };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { status: err.statusCode, body: { error: err.message, errors: err.errors } };
    }
    if (err instanceof KalloError) {
      return { status: err.statusCode, body: { error: err.message } };
    }
    throw err;
  }
}

/**
 * registerActionRoute — mounts the action dispatcher on a router at
 * POST /__kallo/action/:name. The Kallo client posts enhanced forms here;
 * CSRF/auth middleware applied before this still runs in the normal pipeline.
 */
export function registerActionRoute(
  router: Router,
  mountPath = "/__kallo/action/:name",
): void {
  router.post(
    mountPath,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const name = req.params.name as string;
        const ctx: ActionContext = {
          req,
          res,
          body: (req.body as Record<string, unknown>) ?? {},
          params: (req.params as Record<string, string>) ?? {},
          user: (req as Request & { user?: unknown }).user,
        };
        const { status, body } = await dispatchAction(name, ctx);
        res.status(status).json(body);
      } catch (err) {
        next(err);
      }
    },
  );
}
