import test from "node:test";
import assert from "node:assert";
import {
  $router,
  createServer,
  responseHelpersMiddleware,
  handleSSR,
  errorHandler,
  PomeloError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  $auth,
  $roles,
  $guard,
  signToken,
  verifyToken,
} from "./index.js";

test("Server router registers and dispatches routes", () => {
  const router = $router();
  let getTriggered = false;
  let postTriggered = false;

  router.get("/home", (req) => {
    getTriggered = true;
    assert.strictEqual(req.id, 1);
  });

  router.post("/submit", (req, res) => {
    postTriggered = true;
    assert.strictEqual(res.sent, true);
  });

  const matchedGet = router.handle("GET", "/home", { id: 1 }, {});
  assert.ok(matchedGet);
  assert.ok(getTriggered);

  const matchedPost = router.handle("POST", "/submit", {}, { sent: true });
  assert.ok(matchedPost);
  assert.ok(postTriggered);

  const matchedNotFound = router.handle("GET", "/not-found", {}, {});
  assert.strictEqual(matchedNotFound, false);
});

test("Response helpers middleware decorates responses", () => {
  const req = {} as any;
  let statusVal = 0;
  let jsonVal: any = null;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json(d: any) {
      jsonVal = d;
      return this;
    },
    end() {},
  } as any;

  let nextCalled = false;
  responseHelpersMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled);
  assert.ok(typeof res.ok === "function");
  assert.ok(typeof res.badRequest === "function");

  res.ok({ success: true });
  assert.strictEqual(statusVal, 200);
  assert.deepStrictEqual(jsonVal, { success: true });

  res.badRequest("Oops");
  assert.strictEqual(statusVal, 400);
  assert.deepStrictEqual(jsonVal, { error: "Oops" });
});

test("handleSSR processes component, runs hooks, and generates HTML response", async () => {
  const mockComponent = {
    async $serverGuard() {
      return true;
    },
    async $serverPage() {
      return { title: "Hello SSR" };
    },
    async $serverMeta() {
      return { title: "Page Title", description: "Hello description" };
    },
    render(state: any) {
      return `<h1>${state.title}</h1>`;
    },
    css: ".h1 { color: red; }",
  };

  const req = { params: {}, query: {}, path: "/", route: { path: "/" } } as any;
  let statusVal = 0;
  let bodyHTML = "";

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    send(html: string) {
      bodyHTML = html;
      return this;
    },
    headersSent: false,
  } as any;

  await handleSSR(req, res, mockComponent);

  assert.strictEqual(statusVal, 200);
  assert.ok(bodyHTML.includes("<!DOCTYPE html>"));
  assert.ok(bodyHTML.includes("<h1>Hello SSR</h1>"));
  assert.ok(bodyHTML.includes("<title>Page Title</title>"));
  assert.ok(bodyHTML.includes(".h1 { color: red; }"));
});

test("handleSSR injects hydration script when component has setup function", async () => {
  const mockComponent = {
    setup() {
      return {};
    },
    render() {
      return "<p>Interactive</p>";
    },
  };

  const req = {
    params: {},
    query: {},
    path: "/test",
    route: { path: "/test" },
  } as any;
  let bodyHTML = "";

  const res = {
    status() {
      return this;
    },
    send(html: string) {
      bodyHTML = html;
      return this;
    },
    headersSent: false,
  } as any;

  await handleSSR(req, res, mockComponent);

  assert.ok(bodyHTML.includes('<script type="module">'));
  assert.ok(bodyHTML.includes("hydrate"));
  assert.ok(bodyHTML.includes("/@pomelo/runtime"));
});

test("handleSSR blocks access when guard returns false", async () => {
  const mockComponent = {
    async $serverGuard() {
      return false;
    },
    render() {
      return "<p>Secret</p>";
    },
  };

  const req = { params: {}, query: {} } as any;
  let statusVal = 0;
  let jsonVal: any = null;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json(d: any) {
      jsonVal = d;
      return this;
    },
    headersSent: false,
    forbidden(msg?: string) {
      statusVal = 403;
      jsonVal = { error: msg || "Forbidden" };
    },
  } as any;

  await handleSSR(req, res, mockComponent);

  assert.strictEqual(statusVal, 403);
});

test("Server boots, starts on port and closes", () => {
  const server = createServer({
    name: "Test Server",
    version: "1.0.0",
    port: 8888,
  });

  const activeServer = server.start();
  assert.ok(activeServer);
  activeServer.close();
});

test("Error handler processes PomeloError instances", () => {
  const err = new NotFoundError("Page not found");
  let statusVal = 0;
  let jsonVal: any = null;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json(d: any) {
      jsonVal = d;
      return this;
    },
    headersSent: false,
  } as any;

  errorHandler(err, {} as any, res, (() => {}) as any);

  assert.strictEqual(statusVal, 404);
  assert.strictEqual(jsonVal.error, "Page not found");
  assert.strictEqual(jsonVal.type, "NotFoundError");
});

test("Error handler processes generic errors in dev mode", () => {
  const originalEnv = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "development";

  const err = new Error("Something broke");
  let statusVal = 0;
  let jsonVal: any = null;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json(d: any) {
      jsonVal = d;
      return this;
    },
    headersSent: false,
  } as any;

  errorHandler(err, {} as any, res, (() => {}) as any);

  assert.strictEqual(statusVal, 500);
  assert.strictEqual(jsonVal.error, "Something broke");
  assert.ok(jsonVal.stack);

  process.env["NODE_ENV"] = originalEnv;
});

test("Error hierarchy has correct status codes", () => {
  assert.strictEqual(new PomeloError("test", 418).statusCode, 418);
  assert.strictEqual(new NotFoundError().statusCode, 404);
  assert.strictEqual(new UnauthorizedError().statusCode, 401);
  assert.strictEqual(new ForbiddenError().statusCode, 403);
  assert.strictEqual(new BadRequestError().statusCode, 400);
});

test("$auth middleware rejects unauthenticated requests", async () => {
  const middleware = $auth(async () => null);

  const req = {} as any;
  let statusVal = 0;
  let jsonVal: any = null;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json(d: any) {
      jsonVal = d;
      return this;
    },
  } as any;

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(statusVal, 401);
  assert.strictEqual(nextCalled, false);
});

test("$auth middleware attaches user on success", async () => {
  const middleware = $auth(async () => ({ id: "user-1", roles: ["admin"] }));

  const req = {} as any;
  let nextCalled = false;

  const res = {} as any;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled);
  assert.strictEqual(req.user.id, "user-1");
  assert.deepStrictEqual(req.user.roles, ["admin"]);
});

test("$roles middleware enforces role-based access", () => {
  const middleware = $roles("admin", "manager");

  const reqWithRole = { user: { id: "1", roles: ["admin"] } } as any;
  let nextCalled = false;

  middleware(reqWithRole, {} as any, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled);

  const reqWithoutRole = { user: { id: "2", roles: ["viewer"] } } as any;
  let statusVal = 0;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json() {
      return this;
    },
  } as any;

  middleware(reqWithoutRole, res, () => {});
  assert.strictEqual(statusVal, 403);
});

test("$guard middleware blocks access when predicate returns false", async () => {
  const middleware = $guard(async () => false);

  const req = {} as any;
  let statusVal = 0;
  let jsonVal: any = null;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json(d: any) {
      jsonVal = d;
      return this;
    },
  } as any;

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(statusVal, 403);
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(jsonVal.error, "Forbidden");
});

test("$guard middleware allows access when predicate returns true", async () => {
  const middleware = $guard(async () => true);

  const req = {} as any;
  let nextCalled = false;

  await middleware(req, {} as any, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled);
});

test("$guard middleware forwards errors to next", async () => {
  const middleware = $guard(async () => {
    throw new Error("guard error");
  });

  const req = {} as any;
  let caughtErr: any = null;

  await middleware(req, {} as any, (err: any) => {
    caughtErr = err;
  });

  assert.ok(caughtErr instanceof Error);
  assert.strictEqual(caughtErr.message, "guard error");
});

test("handleSSR handles $abort with correct status code", async () => {
  const mockComponent = {
    async $serverPage() {
      const e = Object.assign(new Error("Pomelo Abort"), {
        statusCode: 404,
        isPomeloAbort: true,
      });
      throw e;
    },
    render() {
      return "<p>Secret</p>";
    },
  };

  const req = { params: {}, query: {} } as any;
  let statusVal = 0;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    end() {},
    headersSent: false,
  } as any;

  await handleSSR(req, res, mockComponent);
  assert.strictEqual(statusVal, 404);
});

test("handleSSR handles $abort 403 correctly", async () => {
  const mockComponent = {
    async $serverGuard() {
      const e = Object.assign(new Error("Pomelo Abort"), {
        statusCode: 403,
        isPomeloAbort: true,
      });
      throw e;
    },
    render() {
      return "<p>Private</p>";
    },
  };

  const req = { params: {}, query: {} } as any;
  let statusVal = 0;

  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    end() {},
    headersSent: false,
    forbidden(msg?: string) {
      statusVal = 403;
    },
  } as any;

  await handleSSR(req, res, mockComponent);
  assert.strictEqual(statusVal, 403);
});

test("signToken and verifyToken work correctly", () => {
  const secret = "super-secret-key";
  const payload = { id: "user-123", roles: ["admin"] };
  const token = signToken(payload, secret);
  assert.ok(token);
  assert.strictEqual(typeof token, "string");

  const verified = verifyToken(token, secret);
  assert.deepStrictEqual(verified, payload);

  const invalidToken = token + "modified";
  const verifiedInvalid = verifyToken(invalidToken, secret);
  assert.strictEqual(verifiedInvalid, null);
});

test("$auth middleware without provider allows authenticated session user", async () => {
  const middleware = $auth();

  const req = { user: { id: "user-1", roles: ["user"] } } as any;
  let nextCalled = false;

  await middleware(req, {} as any, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled);
});

test("$auth middleware without provider rejects unauthenticated session user", async () => {
  const middleware = $auth();

  const req = {} as any;
  let statusVal = 0;
  const res = {
    status(s: number) {
      statusVal = s;
      return this;
    },
    json() {
      return this;
    },
  } as any;

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(statusVal, 401);
  assert.strictEqual(nextCalled, false);
});

test("Server integrates CORS and Authentication endpoints", async () => {
  const server = createServer({
    name: "Auth Test App",
    version: "1.0.0",
    port: 4050,
    cors: {
      origin: "http://localhost:3000",
      credentials: true,
      methods: ["GET", "POST"],
    },
    auth: {
      secret: "test-secret",
      cookieName: "test.session",
      providers: [
        {
          id: "credentials",
          async authorize(credentials: Record<string, string>) {
            if (
              credentials.username === "admin" &&
              credentials.password === "secret"
            ) {
              return { id: "admin-id", name: "Admin User", roles: ["admin"] };
            }
            return null;
          },
        },
      ],
    },
  });

  const runServer = server.start();
  assert.ok(runServer);

  try {
    // 1. Test CORS preflight and headers
    const corsRes = await fetch("http://localhost:4050/api/auth/session", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.strictEqual(corsRes.status, 204);
    assert.strictEqual(
      corsRes.headers.get("Access-Control-Allow-Origin"),
      "http://localhost:3000",
    );
    assert.strictEqual(
      corsRes.headers.get("Access-Control-Allow-Credentials"),
      "true",
    );

    // 2. Test initial session is null
    const sessRes = await fetch("http://localhost:4050/api/auth/session");
    const sessData = await sessRes.json();
    assert.strictEqual(sessData.user, null);

    // 3. Test signin with invalid credentials
    const signinFailRes = await fetch("http://localhost:4050/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "credentials",
        credentials: { username: "admin", password: "wrong-password" },
      }),
    });
    assert.strictEqual(signinFailRes.status, 401);

    // 4. Test signin with valid credentials
    const signinSuccessRes = await fetch(
      "http://localhost:4050/api/auth/signin",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "credentials",
          credentials: { username: "admin", password: "secret" },
        }),
      },
    );
    assert.strictEqual(signinSuccessRes.status, 200);
    const signinSuccessData = await signinSuccessRes.json();
    assert.strictEqual(signinSuccessData.user.id, "admin-id");
    assert.strictEqual(signinSuccessData.user.name, "Admin User");

    const cookieHeader = signinSuccessRes.headers.get("Set-Cookie");
    assert.ok(cookieHeader);
    assert.ok(cookieHeader.includes("test.session="));

    // Extract cookie value
    const cookieValue = cookieHeader.split(";")[0] || "";

    // 5. Test active session with the cookie
    const activeSessRes = await fetch(
      "http://localhost:4050/api/auth/session",
      {
        headers: {
          Cookie: cookieValue,
        },
      },
    );
    const activeSessData = await activeSessRes.json();
    assert.ok(activeSessData.user);
    assert.strictEqual(activeSessData.user.id, "admin-id");

    // 6. Test signout clears the cookie
    const signoutRes = await fetch("http://localhost:4050/api/auth/signout", {
      method: "POST",
      headers: {
        Cookie: cookieValue,
      },
    });
    assert.strictEqual(signoutRes.status, 200);
    const signoutCookieHeader = signoutRes.headers.get("Set-Cookie");
    assert.ok(signoutCookieHeader);
    assert.ok(signoutCookieHeader.includes("test.session=;"));
  } finally {
    await new Promise<void>((resolve, reject) => {
      runServer.close((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
});
