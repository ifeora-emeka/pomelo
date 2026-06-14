import test from "node:test";
import assert from "node:assert";
import type { Request, Response, NextFunction } from "express";
import { $csrf, $securityHeaders, __csrfInternals } from "./security.js";
import { ForbiddenError } from "./errors.js";

function mockRes() {
  const headers: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const res = {
    locals: {} as Record<string, unknown>,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    cookie(name: string, value: string) {
      cookies[name] = value;
    },
    __headers: headers,
    __cookies: cookies,
  };
  return res as unknown as Response & {
    __headers: Record<string, string>;
    __cookies: Record<string, string>;
  };
}

function mockReq(
  method: string,
  opts: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    path?: string;
  } = {},
) {
  return {
    method,
    path: opts.path ?? "/",
    cookies: opts.cookies,
    headers: opts.headers ?? {},
    body: opts.body,
  } as unknown as Request;
}

test("$csrf issues a token cookie on safe requests", () => {
  const req = mockReq("GET");
  const res = mockRes();
  let called = false;
  $csrf()(req, res, (() => {
    called = true;
  }) as NextFunction);
  assert.ok(called);
  assert.ok(res.__cookies[__csrfInternals.CSRF_COOKIE]);
  assert.strictEqual(
    res.locals.csrfToken,
    res.__cookies[__csrfInternals.CSRF_COOKIE],
  );
});

test("$csrf rejects unsafe request with no token", () => {
  const req = mockReq("POST", { cookies: { [__csrfInternals.CSRF_COOKIE]: "abc" } });
  const res = mockRes();
  let err: unknown;
  $csrf()(req, res, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.ok(err instanceof ForbiddenError);
});

test("$csrf accepts matching header token", () => {
  const token = "secrettoken123";
  const req = mockReq("POST", {
    cookies: { [__csrfInternals.CSRF_COOKIE]: token },
    headers: { [__csrfInternals.CSRF_HEADER]: token },
  });
  const res = mockRes();
  let err: unknown = "untouched";
  $csrf()(req, res, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.strictEqual(err, undefined);
});

test("$csrf accepts matching body token", () => {
  const token = "bodytoken456";
  const req = mockReq("POST", {
    cookies: { [__csrfInternals.CSRF_COOKIE]: token },
    body: { [__csrfInternals.CSRF_FIELD]: token },
  });
  const res = mockRes();
  let err: unknown = "untouched";
  $csrf()(req, res, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.strictEqual(err, undefined);
});

test("$csrf rejects mismatched token", () => {
  const req = mockReq("POST", {
    cookies: { [__csrfInternals.CSRF_COOKIE]: "real" },
    headers: { [__csrfInternals.CSRF_HEADER]: "fake" },
  });
  const res = mockRes();
  let err: unknown;
  $csrf()(req, res, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.ok(err instanceof ForbiddenError);
});

test("$csrf honors ignorePaths", () => {
  const req = mockReq("POST", {
    cookies: { [__csrfInternals.CSRF_COOKIE]: "real" },
    path: "/webhook",
  });
  const res = mockRes();
  let err: unknown = "untouched";
  $csrf({ ignorePaths: ["/webhook"] })(req, res, ((e?: unknown) => {
    err = e;
  }) as NextFunction);
  assert.strictEqual(err, undefined);
});

test("$securityHeaders sets CSP and protective headers", () => {
  const req = mockReq("GET");
  const res = mockRes();
  $securityHeaders()(req, res, (() => {}) as NextFunction);
  assert.ok(res.__headers["content-security-policy"]);
  assert.ok(!res.__headers["content-security-policy"].includes("unsafe-eval"));
  assert.strictEqual(res.__headers["x-content-type-options"], "nosniff");
  assert.strictEqual(res.__headers["x-frame-options"], "SAMEORIGIN");
});

test("$securityHeaders allows disabling CSP", () => {
  const req = mockReq("GET");
  const res = mockRes();
  $securityHeaders({ contentSecurityPolicy: false })(
    req,
    res,
    (() => {}) as NextFunction,
  );
  assert.strictEqual(res.__headers["content-security-policy"], undefined);
});
