import test from "node:test";
import assert from "node:assert";
import type { Request, Response } from "express";
import {
  $action,
  getAction,
  dispatchAction,
  clearActions,
  type ActionContext,
} from "./actions.js";
import { $validate, $rule } from "./validate.js";
import { ForbiddenError } from "./errors.js";

function ctx(body: Record<string, unknown>, user?: unknown): ActionContext {
  return {
    req: {} as Request,
    res: {} as Response,
    body,
    params: {},
    user,
  };
}

test("$action registers and getAction resolves it", () => {
  clearActions();
  $action("noop", () => "ok");
  assert.strictEqual(typeof getAction("noop"), "function");
});

test("$action throws on duplicate names", () => {
  clearActions();
  $action("dup", () => 1);
  assert.throws(() => $action("dup", () => 2));
});

test("dispatchAction returns data wrapper on success", async () => {
  clearActions();
  $action("createTask", ({ body }) => ({ id: 1, title: body.title }));
  const result = await dispatchAction("createTask", ctx({ title: "Hello" }));
  assert.strictEqual(result.status, 200);
  assert.deepStrictEqual(result.body, { data: { id: 1, title: "Hello" } });
});

test("dispatchAction returns 404 for unknown action", async () => {
  clearActions();
  const result = await dispatchAction("missing", ctx({}));
  assert.strictEqual(result.status, 404);
});

test("dispatchAction surfaces ValidationError as 400 with field errors", async () => {
  clearActions();
  $action("signup", ({ body }) =>
    $validate(body, { email: [$rule.required(), $rule.email()] }),
  );
  const result = await dispatchAction("signup", ctx({ email: "bad" }));
  assert.strictEqual(result.status, 400);
  const body = result.body as { error: string; errors: { field: string }[] };
  assert.strictEqual(body.errors[0]?.field, "email");
});

test("dispatchAction maps KalloError to its status code", async () => {
  clearActions();
  $action("guarded", () => {
    throw new ForbiddenError("nope");
  });
  const result = await dispatchAction("guarded", ctx({}));
  assert.strictEqual(result.status, 403);
});

test("dispatchAction rethrows unexpected errors", async () => {
  clearActions();
  $action("boom", () => {
    throw new Error("unexpected");
  });
  await assert.rejects(() => dispatchAction("boom", ctx({})), /unexpected/);
});

test("$action handler receives user from context", async () => {
  clearActions();
  $action("whoami", ({ user }) => user);
  const result = await dispatchAction("whoami", ctx({}, { id: "u1" }));
  assert.deepStrictEqual(result.body, { data: { id: "u1" } });
});
