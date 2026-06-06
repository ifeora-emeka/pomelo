import fs from "node:fs";
import path from "node:path";
import { KalloLogger, SFC_EXTENSION } from "@kallo/shared";
import type { RouteRecord, RouteManifest } from "@kallo/types";

const LAYOUT_FILENAME = "layout.kal";

export function extractParams(segment: string): {
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
      expressSegment: `:${catchAllMatch[1]}*`,
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
    if (part === "index.kal" || part === "page.kal") {
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

export function resolveLayoutChain(filePath: string, pagesDir: string): string[] {
  const layouts: string[] = [];
  let currentDir = path.dirname(filePath);

  while (true) {
    const relative = path.relative(pagesDir, currentDir);
    const isInside =
      currentDir === pagesDir ||
      (!relative.startsWith("..") && !path.isAbsolute(relative));
    if (!isInside) {
      break;
    }

    const layout = findLayoutInDir(currentDir);
    if (layout) {
      layouts.unshift(layout);
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return layouts;
}

export function scanRoutes(pagesDir: string): RouteRecord[] {
  if (!fs.existsSync(pagesDir)) {
    KalloLogger.warn(`Pages directory not found: ${pagesDir}`);
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
      if (entry.name !== "page.kal" && entry.name !== "index.kal") continue;

      const relativePath = path.relative(pagesDir, fullPath);
      const routePath = fileToRoutePath(relativePath);
      const paramNames = extractParamNames(routePath);
      const isDynamic = paramNames.length > 0;
      const isCatchAll = routePath.includes("*");
      const layoutPaths = resolveLayoutChain(fullPath, pagesDir);

      const route: RouteRecord = {
        path: routePath,
        filePath: fullPath,
        isDynamic,
        isCatchAll,
        paramNames,
        layoutPaths,
        children: [],
        depth,
      };

      routes.push(route);
    }
  }

  scan(pagesDir, 0);

  KalloLogger.info(`Scanned ${routes.length} route(s) from ${pagesDir}`);
  return routes;
}

export function buildManifest(pagesDir: string): RouteManifest {
  const routes = scanRoutes(pagesDir);
  const layouts = new Map<string, string>();

  for (const route of routes) {
    for (const layoutPath of route.layoutPaths) {
      layouts.set(layoutPath, layoutPath);
    }
  }

  return { routes, layouts };
}

function getSegmentType(segment: string): number {
  if (segment.includes("*") || segment.startsWith("*")) {
    return 0; // Catch-all
  }
  if (segment.startsWith(":")) {
    return 1; // Dynamic
  }
  return 2; // Static
}

export function sortRoutesBySpecificity(routes: RouteRecord[]): RouteRecord[] {
  return [...routes].sort((a, b) => {
    if (a.isCatchAll !== b.isCatchAll) return a.isCatchAll ? 1 : -1;

    const aSegs = a.path.split("/").filter(Boolean);
    const bSegs = b.path.split("/").filter(Boolean);
    const minLength = Math.min(aSegs.length, bSegs.length);

    for (let i = 0; i < minLength; i++) {
      const aSeg = aSegs[i]!;
      const bSeg = bSegs[i]!;
      const aType = getSegmentType(aSeg);
      const bType = getSegmentType(bSeg);

      if (aType !== bType) {
        return bType - aType;
      }
    }

    if (aSegs.length !== bSegs.length) {
      return aSegs.length - bSegs.length;
    }

    return a.path.localeCompare(b.path);
  });
}
