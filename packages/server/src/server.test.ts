import test from "node:test";
import assert from "node:assert";
import { $router, createServer, responseHelpersMiddleware, handleSSR } from "./index.js";

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
    end() {}
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
    css: ".h1 { color: red; }"
  };

  const req = { params: {}, query: {} } as any;
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
    headersSent: false
  } as any;

  await handleSSR(req, res, mockComponent);

  assert.strictEqual(statusVal, 200);
  assert.ok(bodyHTML.includes("<!DOCTYPE html>"));
  assert.ok(bodyHTML.includes("<h1>Hello SSR</h1>"));
  assert.ok(bodyHTML.includes("<title>Page Title</title>"));
  assert.ok(bodyHTML.includes("<style>.h1 { color: red; }</style>"));
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
