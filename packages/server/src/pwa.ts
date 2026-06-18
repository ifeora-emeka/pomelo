import type { Request, Response, NextFunction } from "express";
import { escapeAttr, serializeForScript } from "@kallojs/shared";

export type PWADisplay =
  | "standalone"
  | "fullscreen"
  | "minimal-ui"
  | "browser";

export type PWARuntimeCaching =
  | "networkFirst"
  | "cacheFirst"
  | "staleWhileRevalidate";

export interface PWAIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

export interface PWAConfig {
  name: string;
  shortName: string;
  description?: string;
  themeColor?: string;
  backgroundColor?: string;
  display?: PWADisplay;
  startUrl?: string;
  scope?: string;
  icons?: PWAIcon[];
  precache?: string[];
  runtimeCaching?: PWARuntimeCaching;
}

const MANIFEST_PATH = "/manifest.webmanifest";
const SERVICE_WORKER_PATH = "/service-worker.js";

function cacheName(config: PWAConfig): string {
  const base = (config.shortName || config.name || "kallo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `kallo-${base || "app"}-v1`;
}

interface WebAppManifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: PWADisplay;
  description?: string;
  theme_color?: string;
  background_color?: string;
  icons?: PWAIcon[];
}

/**
 * generateManifest — builds a valid web app manifest as a JSON string.
 *
 * Usage:
 *   const json = generateManifest(config);
 */
export function generateManifest(config: PWAConfig): string {
  const manifest: WebAppManifest = {
    name: config.name,
    short_name: config.shortName,
    start_url: config.startUrl ?? "/",
    scope: config.scope ?? "/",
    display: config.display ?? "standalone",
  };
  if (config.description !== undefined) manifest.description = config.description;
  if (config.themeColor !== undefined) manifest.theme_color = config.themeColor;
  if (config.backgroundColor !== undefined) {
    manifest.background_color = config.backgroundColor;
  }
  if (config.icons && config.icons.length > 0) {
    manifest.icons = config.icons.map((icon) => {
      const out: PWAIcon = { src: icon.src, sizes: icon.sizes };
      if (icon.type !== undefined) out.type = icon.type;
      if (icon.purpose !== undefined) out.purpose = icon.purpose;
      return out;
    });
  }
  return JSON.stringify(manifest, null, 2);
}

function runtimeStrategyBody(strategy: PWARuntimeCaching): string {
  switch (strategy) {
    case "cacheFirst":
      return `  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );`;
    case "staleWhileRevalidate":
      return `  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return cached;
        });
      return cached || network;
    })
  );`;
    case "networkFirst":
    default:
      return `  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request);
      })
  );`;
  }
}

/**
 * generateServiceWorker — builds self-contained service worker JS source
 * implementing install-precache, activate-cleanup of stale caches, and the
 * configured runtime caching strategy (default "networkFirst").
 *
 * Usage:
 *   const sw = generateServiceWorker(config);
 */
export function generateServiceWorker(config: PWAConfig): string {
  const name = cacheName(config);
  const precache = config.precache ?? [];
  const strategy = config.runtimeCaching ?? "networkFirst";
  const startUrl = config.startUrl ?? "/";
  const precacheList = Array.from(new Set([startUrl, ...precache]));

  return `var CACHE_NAME = ${JSON.stringify(name)};
var PRECACHE_URLS = ${JSON.stringify(precacheList)};
var RUNTIME_STRATEGY = ${JSON.stringify(strategy)};

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
${runtimeStrategyBody(strategy)}
});
`;
}

/**
 * pwaHeadTags — returns the <head> markup linking the manifest, declaring the
 * theme color, and pointing apple-touch-icon at the configured icons.
 *
 * Usage:
 *   const head = pwaHeadTags(config);
 */
export function pwaHeadTags(config: PWAConfig): string {
  let html = `<link rel="manifest" href="${escapeAttr(MANIFEST_PATH)}">\n`;
  if (config.themeColor) {
    html += `<meta name="theme-color" content="${escapeAttr(config.themeColor)}">\n`;
  }
  if (config.icons) {
    for (const icon of config.icons) {
      html += `<link rel="apple-touch-icon"${
        icon.sizes ? ` sizes="${escapeAttr(icon.sizes)}"` : ""
      } href="${escapeAttr(icon.src)}">\n`;
    }
  }
  return html;
}

export interface ServiceWorkerRegistrationOptions {
  scope?: string;
  path?: string;
}

/**
 * serviceWorkerRegistrationScript — returns an inline <script> body that
 * registers the service worker once the page loads, guarded by feature
 * detection. Drop the returned string inside a <script> tag.
 *
 * Usage:
 *   `<script>${serviceWorkerRegistrationScript()}</script>`
 */
export function serviceWorkerRegistrationScript(
  options: ServiceWorkerRegistrationOptions = {},
): string {
  const path = options.path ?? SERVICE_WORKER_PATH;
  const scope = options.scope ?? "/";
  return `if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(${serializeForScript(path)}, { scope: ${serializeForScript(scope)} }).catch(function (err) {
      console.error('Service worker registration failed:', err);
    });
  });
}`;
}

/**
 * $pwa — Express middleware that serves the web app manifest and the generated
 * service worker, then defers to the next handler for all other requests.
 *
 * Serves:
 *   GET /manifest.webmanifest  (application/manifest+json)
 *   GET /service-worker.js     (text/javascript, no-cache, Service-Worker-Allowed)
 *
 * Usage:
 *   app.use($pwa(config));
 */
export function $pwa(config: PWAConfig) {
  const manifest = generateManifest(config);
  const serviceWorker = generateServiceWorker(config);
  const swScope = config.scope ?? "/";

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    if (req.path === MANIFEST_PATH) {
      res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      res.send(manifest);
      return;
    }

    if (req.path === SERVICE_WORKER_PATH) {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Service-Worker-Allowed", swScope);
      res.send(serviceWorker);
      return;
    }

    next();
  };
}

export const __pwaInternals = {
  MANIFEST_PATH,
  SERVICE_WORKER_PATH,
  cacheName,
};
