import test from "node:test";
import assert from "node:assert";
import { $router, createServer } from "./index.js";

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

test("Server boots and starts on port", () => {
  const server = createServer({
    name: "Test Server",
    version: "1.0.0",
    port: 9999,
  });

  const success = server.start();
  assert.ok(success);
});
