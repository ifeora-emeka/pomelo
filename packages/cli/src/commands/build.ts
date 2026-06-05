import { KalloLogger, rewriteRelativeImports } from "@kallo/shared";
import { scanRoutes, compileAPIRoutes } from "@kallo/server";
import { compile } from "@kallo/compiler";
import fs from "node:fs";
import path from "node:path";

export function executeBuildCommand(args: string[]): boolean {
  KalloLogger.info("Starting compilation build...");

  const pagesDir = path.join(process.cwd(), "src/view");
  const cacheDir = path.join(process.cwd(), ".kallo-cache");

  if (!fs.existsSync(pagesDir)) {
    KalloLogger.warn(
      `View directory ${pagesDir} does not exist. Nothing to build.`,
    );
    return true;
  }

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  try {
    const routes = scanRoutes(pagesDir);
    let combinedCSS = "";

    for (const route of routes) {
      const relative = path.relative(pagesDir, route.filePath);
      const content = fs.readFileSync(route.filePath, "utf-8");
      const compiled = compile(content, route.filePath);

      const cacheFile = path.join(
        cacheDir,
        relative.replace(/[\/\\]/g, "_") + ".js",
      );
      const rewroteCode = rewriteRelativeImports(
        compiled.code,
        route.filePath,
        cacheFile,
      );
      fs.writeFileSync(cacheFile, rewroteCode);
      if (compiled.css) {
        combinedCSS += compiled.css + "\n";
      }

      for (const layoutPath of route.layoutPaths) {
        const layoutRelative = path.relative(pagesDir, layoutPath);
        const layoutContent = fs.readFileSync(layoutPath, "utf-8");
        const layoutCompiled = compile(layoutContent, layoutPath);
        const layoutCacheFile = path.join(
          cacheDir,
          "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
        );
        const layoutRewroteCode = rewriteRelativeImports(
          layoutCompiled.code,
          layoutPath,
          layoutCacheFile,
        );
        fs.writeFileSync(layoutCacheFile, layoutRewroteCode);
        if (layoutCompiled.css) {
          combinedCSS += layoutCompiled.css + "\n";
        }
      }
    }

    const apiDir = path.join(process.cwd(), "src/api");
    compileAPIRoutes(apiDir, cacheDir);

    if (combinedCSS) {
      fs.writeFileSync(path.join(cacheDir, "bundle.css"), combinedCSS);
      KalloLogger.info("Bundled styles written to .kallo-cache/bundle.css");
    }

    KalloLogger.info(`Successfully compiled ${routes.length} routes!`);
    return true;
  } catch (err) {
    KalloLogger.error("Build failed: " + String(err));
    return false;
  }
}
