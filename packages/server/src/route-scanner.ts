import fs from "node:fs";
import path from "node:path";
import { PomeloLogger, SFC_EXTENSION } from "@pomelo/shared";
import type { RouteRecord, RouteManifest } from "@pomelo/types";

const LAYOUT_FILENAME = "layout.pom";

function extractParams(segment: string): {
  isDynamic: boolean;
  isCatchAll: boolean;
  paramName: string;
  expressSegment: string;
} {
  const catchAllMatch = /^\[\.\.\.([^\]]+)\]$/.exec(segment);
  if (catchAllMatch && catchAllMatch[1]) {
    return {
      isDynamic: true,
      isCatchAll: true,
      paramName: catchAllMatch[1],
      expressSegment: `:${catchAllMatch[1]}(*)`,
    };
  }

  const dynamicMatch = /^\[([^\]]+)\]$/.exec(segment);
  if (dynamicMatch && dynamicMatch[1]) {
    return {
      isDynamic: true,
      isCatchAll: false,
      paramName: dynamicMatch[1],
      expressSegment: `:${dynamicMatch[1]}`,
    };
  }

  return {
    isDynamic: false,
    isCatchAll: false,
    paramName: "",
    expressSegment: segment,
  };
}

function fileToRoutePath(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  const segments: string[] = [];

  for (const part of parts) {
    if (part === "index.pom" || part === "page.pom") {
      continue;
    }
    if (part.endsWith(SFC_EXTENSION)) {
      const name = part.slice(0, -SFC_EXTENSION.length);
      const { expressSegment } = extractParams(name);
      segments.push(expressSegment);
    } else {
      const { expressSegment } = extractParams(part);
      segments.push(expressSegment);
    }
  }

  const routePath = "/" + segments.join("/");
  return routePath === "/" ? "/" : routePath.replace(/\/$/, "");
}

function extractParamNames(routePath: string): string[] {
  const params: string[] = [];
  const regex = /:([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = regex.exec(routePath)) !== null) {
    if (match[1]) {
      params.push(match[1]);
    }
  }
  return params;
}

function findLayoutInDir(dir: string): string | null {
  const layoutPath = path.join(dir, LAYOUT_FILENAME);
  if (fs.existsSync(layoutPath)) {
    return layoutPath;
  }
  return null;
}

function resolveLayoutChain(
  filePath: string,
  pagesDir: string,
): string | null {
  let currentDir = path.dirname(filePath);

  while (
    currentDir.startsWith(pagesDir) ||
    currentDir === pagesDir
  ) {
    const layout = findLayoutInDir(currentDir);
    if (layout) {
      return layout;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

export function scanRoutes(pagesDir: string): RouteRecord[] {
  if (!fs.existsSync(pagesDir)) {
    PomeloLogger.warn(`Pages directory not found: ${pagesDir}`);
    return [];
  }

  const routes: RouteRecord[] = [];

  function scan(dir: string, depth: number) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    const sortedEntries = entries.sort((a, b) => {
      const aIsDynamic = a.name.startsWith("[");
      const bIsDynamic = b.name.startsWith("[");
      if (aIsDynamic !== bIsDynamic) return aIsDynamic ? 1 : -1;

      const aIsCatchAll = a.name.startsWith("[...");
      const bIsCatchAll = b.name.startsWith("[...");
      if (aIsCatchAll !== bIsCatchAll) return aIsCatchAll ? 1 : -1;

      return a.name.localeCompare(b.name);
    });

    for (const entry of sortedEntries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath, depth + 1);
        continue;
      }

      if (!entry.name.endsWith(SFC_EXTENSION)) continue;
      if (entry.name === LAYOUT_FILENAME) continue;

      const relativePath = path.relative(pagesDir, fullPath);
      const routePath = fileToRoutePath(relativePath);
      const paramNames = extractParamNames(routePath);
      const isDynamic = paramNames.length > 0;
      const isCatchAll = routePath.includes("(*)");
      const layoutPath = resolveLayoutChain(fullPath, pagesDir);

      const route: RouteRecord = {
        path: routePath,
        filePath: fullPath,
        isDynamic,
        isCatchAll,
        paramNames,
        layoutPath,
        children: [],
        depth,
      };

      routes.push(route);
    }
  }

  scan(pagesDir, 0);

  PomeloLogger.info(`Scanned ${routes.length} route(s) from ${pagesDir}`);
  return routes;
}

export function buildManifest(pagesDir: string): RouteManifest {
  const routes = scanRoutes(pagesDir);
  const layouts = new Map<string, string>();

  for (const route of routes) {
    if (route.layoutPath) {
      layouts.set(route.layoutPath, route.layoutPath);
    }
  }

  return { routes, layouts };
}

export function sortRoutesBySpecificity(routes: RouteRecord[]): RouteRecord[] {
  return [...routes].sort((a, b) => {
    if (a.isCatchAll !== b.isCatchAll) return a.isCatchAll ? 1 : -1;
    if (a.isDynamic !== b.isDynamic) return a.isDynamic ? 1 : -1;

    const aSegments = a.path.split("/").length;
    const bSegments = b.path.split("/").length;
    if (aSegments !== bSegments) return bSegments - aSegments;

    return a.path.localeCompare(b.path);
  });
}
