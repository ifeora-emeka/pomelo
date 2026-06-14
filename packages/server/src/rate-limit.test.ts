import test from "node:test";
import assert from "node:assert";
import type { Request, Response, NextFunction } from "express";
import {
  $rateLimit,
  MemoryRateLimitStore,
  type RateLimitStore,
  type RateLimitHit,
} from "./rate-limit.js";

function mockRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    __headers: headers,
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    __headers: Record<string, string>;
  };
}

function mockReq(
  opts: { ip?: string; headers?: Record<string, string> } = {},
): Request {
  return {
    ip: opts.ip ?? "1.2.3.4",
    headers: opts.headers ?? {},
    socket: { remoteAddress: "9.9.9.9" },
  } as unknown as Request;
}

function run(
  mw: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
) {
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);
  return { res, nextCalled };
}

test("$rateLimit allows requests under the limit", () => {
  const mw = $rateLimit({ max: 3, windowMs: 60000 });
  for (let i = 0; i < 3; i += 1) {
    const { res, nextCalled } = run(mw, mockReq());
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 200);
  }
});

test("$rateLimit rejects with 429 once over the limit", () => {
  const mw = $rateLimit({ max: 2, windowMs: 60000, message: "slow down" });
  run(mw, mockReq());
  run(mw, mockReq());
  const { res, nextCalled } = run(mw, mockReq());
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.body, "slow down");
  assert.ok(res.__headers["retry-after"]);
});

test("$rateLimit honors a custom statusCode", () => {
  const mw = $rateLimit({ max: 1, statusCode: 503 });
  run(mw, mockReq());
  const { res } = run(mw, mockReq());
  assert.strictEqual(res.statusCode, 503);
});

test("$rateLimit frees the limit after the window resets", () => {
  const store = new MemoryRateLimitStore();
  const mw = $rateLimit({ max: 1, windowMs: 20, store });
  const first = run(mw, mockReq());
  assert.strictEqual(first.nextCalled, true);
  const blocked = run(mw, mockReq());
  assert.strictEqual(blocked.res.statusCode, 429);

  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const after = run(mw, mockReq());
      assert.strictEqual(after.nextCalled, true);
      assert.strictEqual(after.res.statusCode, 200);
      resolve();
    }, 30);
  });
});

test("$rateLimit isolates keys via a custom keyGenerator", () => {
  const mw = $rateLimit({
    max: 1,
    keyGenerator: (req) => req.headers["x-user"] as string,
  });
  const userA = run(mw, mockReq({ headers: { "x-user": "a" } }));
  const userB = run(mw, mockReq({ headers: { "x-user": "b" } }));
  assert.strictEqual(userA.nextCalled, true);
  assert.strictEqual(userB.nextCalled, true);

  const userABlocked = run(mw, mockReq({ headers: { "x-user": "a" } }));
  assert.strictEqual(userABlocked.res.statusCode, 429);
});

test("$rateLimit falls back to x-forwarded-for then remoteAddress", () => {
  const mw = $rateLimit({ max: 1 });
  const req = {
    ip: undefined,
    headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
    socket: { remoteAddress: "9.9.9.9" },
  } as unknown as Request;
  const allowed = run(mw, req);
  assert.strictEqual(allowed.nextCalled, true);
  const blocked = run(mw, req);
  assert.strictEqual(blocked.res.statusCode, 429);
});

test("$rateLimit sets standard headers on allowed requests", () => {
  const mw = $rateLimit({ max: 5, windowMs: 60000 });
  const { res } = run(mw, mockReq());
  assert.strictEqual(res.__headers["ratelimit-limit"], "5");
  assert.strictEqual(res.__headers["ratelimit-remaining"], "4");
  assert.ok(res.__headers["ratelimit-reset"]);
});

test("$rateLimit can disable standard headers", () => {
  const mw = $rateLimit({ max: 5, standardHeaders: false });
  const { res } = run(mw, mockReq());
  assert.strictEqual(res.__headers["ratelimit-limit"], undefined);
  assert.strictEqual(res.__headers["ratelimit-remaining"], undefined);
});

test("$rateLimit honors a custom store", () => {
  const seen: string[] = [];
  const customStore: RateLimitStore = {
    increment(key: string): RateLimitHit {
      seen.push(key);
      return { count: 1, resetAt: Date.now() + 1000 };
    },
  };
  const mw = $rateLimit({ max: 10, store: customStore });
  const { nextCalled } = run(mw, mockReq({ ip: "7.7.7.7" }));
  assert.strictEqual(nextCalled, true);
  assert.deepStrictEqual(seen, ["7.7.7.7"]);
});

test("MemoryRateLimitStore.reset clears counters", () => {
  const store = new MemoryRateLimitStore();
  const mw = $rateLimit({ max: 1, store });
  run(mw, mockReq());
  assert.strictEqual(run(mw, mockReq()).res.statusCode, 429);
  store.reset();
  assert.strictEqual(run(mw, mockReq()).nextCalled, true);
});
