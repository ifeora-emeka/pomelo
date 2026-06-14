import test from "node:test";
import assert from "node:assert";
import type { Request, Response, NextFunction } from "express";
import {
  $pwa,
  generateManifest,
  generateServiceWorker,
  pwaHeadTags,
  serviceWorkerRegistrationScript,
  __pwaInternals,
  type PWAConfig,
} from "./pwa.js";

const baseConfig: PWAConfig = {
  name: "Kallo Demo App",
  shortName: "Kallo",
  description: "A demo PWA",
  themeColor: "#0f172a",
  backgroundColor: "#ffffff",
  display: "standalone",
  startUrl: "/",
  scope: "/",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
  precache: ["/", "/offline.html", "/styles.css"],
  runtimeCaching: "staleWhileRevalidate",
};

function mockRes() {
  const headers: Record<string, string> = {};
  const res = {
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    send(body: unknown) {
      res.body = body;
      return res;
    },
    __headers: headers,
  };
  return res as unknown as Response & {
    body: unknown;
    __headers: Record<string, string>;
  };
}

function mockReq(method: string, path: string) {
  return { method, path } as unknown as Request;
}

test("generateManifest produces valid JSON with correct fields", () => {
  const json = generateManifest(baseConfig);
  const parsed = JSON.parse(json) as Record<string, unknown>;
  assert.strictEqual(parsed.name, "Kallo Demo App");
  assert.strictEqual(parsed.short_name, "Kallo");
  assert.strictEqual(parsed.description, "A demo PWA");
  assert.strictEqual(parsed.theme_color, "#0f172a");
  assert.strictEqual(parsed.background_color, "#ffffff");
  assert.strictEqual(parsed.display, "standalone");
  assert.strictEqual(parsed.start_url, "/");
  assert.strictEqual(parsed.scope, "/");
  assert.ok(Array.isArray(parsed.icons));
  assert.strictEqual((parsed.icons as unknown[]).length, 2);
});

test("generateManifest applies defaults for optional fields", () => {
  const json = generateManifest({ name: "App", shortName: "App" });
  const parsed = JSON.parse(json) as Record<string, unknown>;
  assert.strictEqual(parsed.start_url, "/");
  assert.strictEqual(parsed.scope, "/");
  assert.strictEqual(parsed.display, "standalone");
  assert.strictEqual(parsed.icons, undefined);
  assert.strictEqual(parsed.description, undefined);
});

test("generateServiceWorker contains install/activate/fetch listeners", () => {
  const sw = generateServiceWorker(baseConfig);
  assert.ok(sw.includes('addEventListener("install"'));
  assert.ok(sw.includes('addEventListener("activate"'));
  assert.ok(sw.includes('addEventListener("fetch"'));
  assert.ok(sw.includes("skipWaiting"));
  assert.ok(sw.includes("clients.claim"));
  assert.ok(sw.includes("caches.delete"));
});

test("generateServiceWorker includes the precache list and start url", () => {
  const sw = generateServiceWorker(baseConfig);
  assert.ok(sw.includes("/offline.html"));
  assert.ok(sw.includes("/styles.css"));
  assert.ok(sw.includes('"/"'));
});

test("generateServiceWorker derives a stable cache name from config", () => {
  const sw = generateServiceWorker(baseConfig);
  const name = __pwaInternals.cacheName(baseConfig);
  assert.strictEqual(name, "kallo-kallo-v1");
  assert.ok(sw.includes(name));
});

test("generateServiceWorker encodes the chosen runtime strategy", () => {
  const swStale = generateServiceWorker(baseConfig);
  assert.ok(swStale.includes('RUNTIME_STRATEGY = "staleWhileRevalidate"'));
  assert.ok(swStale.includes("cached || network"));

  const swCacheFirst = generateServiceWorker({
    ...baseConfig,
    runtimeCaching: "cacheFirst",
  });
  assert.ok(swCacheFirst.includes("if (cached) return cached"));

  const swNetwork = generateServiceWorker({
    name: "A",
    shortName: "A",
  });
  assert.ok(swNetwork.includes('RUNTIME_STRATEGY = "networkFirst"'));
  assert.ok(swNetwork.includes("caches.match(request)"));
});

test("$pwa serves the manifest route with correct content-type", () => {
  const req = mockReq("GET", __pwaInternals.MANIFEST_PATH);
  const res = mockRes();
  let called = false;
  $pwa(baseConfig)(req, res, (() => {
    called = true;
  }) as NextFunction);
  assert.strictEqual(called, false);
  assert.ok(
    res.__headers["content-type"]?.startsWith("application/manifest+json"),
  );
  const parsed = JSON.parse(res.body as string) as Record<string, unknown>;
  assert.strictEqual(parsed.name, "Kallo Demo App");
});

test("$pwa serves the service worker route with correct headers", () => {
  const req = mockReq("GET", __pwaInternals.SERVICE_WORKER_PATH);
  const res = mockRes();
  let called = false;
  $pwa(baseConfig)(req, res, (() => {
    called = true;
  }) as NextFunction);
  assert.strictEqual(called, false);
  assert.ok(res.__headers["content-type"]?.startsWith("text/javascript"));
  assert.ok(res.__headers["cache-control"]?.includes("no-cache"));
  assert.strictEqual(res.__headers["service-worker-allowed"], "/");
  assert.ok((res.body as string).includes('addEventListener("fetch"'));
});

test("$pwa calls next() for unrelated paths", () => {
  const req = mockReq("GET", "/about");
  const res = mockRes();
  let called = false;
  $pwa(baseConfig)(req, res, (() => {
    called = true;
  }) as NextFunction);
  assert.strictEqual(called, true);
  assert.strictEqual(res.body, undefined);
});

test("$pwa calls next() for non-GET methods on pwa paths", () => {
  const req = mockReq("POST", __pwaInternals.MANIFEST_PATH);
  const res = mockRes();
  let called = false;
  $pwa(baseConfig)(req, res, (() => {
    called = true;
  }) as NextFunction);
  assert.strictEqual(called, true);
  assert.strictEqual(res.body, undefined);
});

test("pwaHeadTags contains manifest link, theme-color, and apple-touch-icon", () => {
  const html = pwaHeadTags(baseConfig);
  assert.ok(
    html.includes('<link rel="manifest" href="/manifest.webmanifest">'),
  );
  assert.ok(html.includes('<meta name="theme-color" content="#0f172a">'));
  assert.ok(html.includes('rel="apple-touch-icon"'));
  assert.ok(html.includes('sizes="192x192"'));
  assert.ok(html.includes('href="/icons/icon-512.png"'));
});

test("pwaHeadTags omits theme-color and icons when not configured", () => {
  const html = pwaHeadTags({ name: "App", shortName: "App" });
  assert.ok(html.includes('rel="manifest"'));
  assert.ok(!html.includes("theme-color"));
  assert.ok(!html.includes("apple-touch-icon"));
});

test("serviceWorkerRegistrationScript guards on feature detection", () => {
  const script = serviceWorkerRegistrationScript();
  assert.ok(script.includes("'serviceWorker' in navigator"));
  assert.ok(script.includes("navigator.serviceWorker.register"));
  assert.ok(script.includes('"/service-worker.js"'));
  assert.ok(script.includes('"/"'));
});

test("serviceWorkerRegistrationScript honors custom path and scope", () => {
  const script = serviceWorkerRegistrationScript({
    path: "/sw.js",
    scope: "/app/",
  });
  assert.ok(script.includes('"/sw.js"'));
  assert.ok(script.includes('"/app/"'));
});
