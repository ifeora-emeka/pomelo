import type { Express } from "express";
import type { FrameworkConfig, KalloPlugin } from "@kallojs/types";
import { KalloLogger } from "@kallojs/shared";

/**
 * defineConfig — identity helper that gives kallo.config.ts full type-checking
 * and autocomplete on the framework config (including its `plugins` array).
 *
 * Usage (kallo.config.ts):
 *   export default defineConfig({
 *     name: "shop",
 *     plugins: [analyticsPlugin()],
 *   });
 */
export function defineConfig(config: FrameworkConfig): FrameworkConfig {
  return config;
}

/**
 * definePlugin — identity helper for authoring a Kallo plugin with typed hooks.
 *
 * Usage:
 *   const analytics = definePlugin({
 *     name: "analytics",
 *     transform(code, id) { ... },
 *     configureServer(app) { ... },
 *   });
 */
export function definePlugin(plugin: KalloPlugin): KalloPlugin {
  return plugin;
}

/**
 * applyConfigHooks — runs every plugin's `config` hook in order, threading the
 * (possibly mutated) config through. A hook returning void leaves config as-is.
 */
export function applyConfigHooks(
  config: FrameworkConfig,
  plugins: KalloPlugin[] = config.plugins ?? [],
): FrameworkConfig {
  let result = config;
  for (const plugin of plugins) {
    if (plugin.config) {
      const next = plugin.config(result);
      if (next) result = next;
    }
  }
  return result;
}

/**
 * applyTransform — runs source through every plugin's `transform` hook in order.
 * Used by the compile pipeline so plugins can rewrite module output. A hook may
 * return a string, `{ code }`, or void (no change).
 */
export function applyTransform(
  plugins: KalloPlugin[],
  code: string,
  id: string,
): string {
  let result = code;
  for (const plugin of plugins) {
    if (plugin.transform) {
      const out = plugin.transform(result, id);
      if (typeof out === "string") {
        result = out;
      } else if (out && typeof out === "object" && typeof out.code === "string") {
        result = out.code;
      }
    }
  }
  return result;
}

/**
 * applyServerHooks — invokes every plugin's `configureServer` hook, giving each
 * a chance to register Express middleware/routes. Failures in one plugin are
 * logged and do not abort the others.
 */
export function applyServerHooks(
  app: Express,
  plugins: KalloPlugin[],
): void {
  for (const plugin of plugins) {
    if (plugin.configureServer) {
      try {
        plugin.configureServer(app);
      } catch (err) {
        KalloLogger.error(
          `Plugin "${plugin.name}" configureServer failed: ` + String(err),
        );
      }
    }
  }
}
