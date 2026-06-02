import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { scanRoutes, sortRoutesBySpecificity, buildManifest } from "./route-scanner.js";

const tmpDir = path.join(process.cwd(), ".test-pages");

function createMockPages() {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  const files = [
    "index.pom",
    "about.pom",
    "blog/index.pom",
    "blog/[id].pom",
    "blog/[...catchall].pom",
    "layout.pom",
    "blog/layout.pom"
  ];

  for (const file of files) {
    const filePath = path.join(tmpDir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "<View>Test</View>");
  }
}

function cleanupMockPages() {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test("Route scanner extracts static and dynamic routes", () => {
  createMockPages();
  const routes = scanRoutes(tmpDir);

  assert.strictEqual(routes.length, 5);

  const routePaths = routes.map((r) => r.path);
  assert.ok(routePaths.includes("/"));
  assert.ok(routePaths.includes("/about"));
  assert.ok(routePaths.includes("/blog"));
  assert.ok(routePaths.includes("/blog/:id"));
  assert.ok(routePaths.includes("/blog/:catchall(*)"));

  cleanupMockPages();
});

test("Route scanner resolves layout chains", () => {
  createMockPages();
  const routes = scanRoutes(tmpDir);

  const homeRoute = routes.find((r) => r.path === "/");
  assert.ok(homeRoute);
  assert.deepStrictEqual(homeRoute.layoutPaths, [path.join(tmpDir, "layout.pom")]);

  const blogRoute = routes.find((r) => r.path === "/blog/:id");
  assert.ok(blogRoute);
  assert.deepStrictEqual(blogRoute.layoutPaths, [
    path.join(tmpDir, "layout.pom"),
    path.join(tmpDir, "blog/layout.pom")
  ]);

  cleanupMockPages();
});

test("Route sorting prioritizes static over dynamic over catchall", () => {
  const routes = [
    { path: "/blog/:catchall(*)", isDynamic: true, isCatchAll: true },
    { path: "/blog/:id", isDynamic: true, isCatchAll: false },
    { path: "/blog/new", isDynamic: false, isCatchAll: false },
    { path: "/about", isDynamic: false, isCatchAll: false }
  ] as any[];

  const sorted = sortRoutesBySpecificity(routes);
  
  assert.strictEqual(sorted[0]!.path, "/about");
  assert.strictEqual(sorted[1]!.path, "/blog/new");
  assert.strictEqual(sorted[2]!.path, "/blog/:id");
  assert.strictEqual(sorted[3]!.path, "/blog/:catchall(*)");
});
