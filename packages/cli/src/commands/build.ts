import { PomeloLogger, rewriteRelativeImports } from "@pomelo/shared";
import { scanRoutes } from "@pomelo/server";
import { compile } from "@pomelo/compiler";
import fs from "node:fs";
import path from "node:path";

export function executeBuildCommand(args: string[]): boolean {
  PomeloLogger.info("Starting compilation build...");

  const pagesDir = path.join(process.cwd(), "src/pages");
  const cacheDir = path.join(process.cwd(), ".pomelo-cache");

  if (!fs.existsSync(pagesDir)) {
    PomeloLogger.warn(`Pages directory ${pagesDir} does not exist. Nothing to build.`);
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
      const compiled = compile(content, route.path);

      const cacheFile = path.join(
        cacheDir,
        relative.replace(/[\/\\]/g, "_") + ".js",
      );
      const rewroteCode = rewriteRelativeImports(compiled.code, route.filePath, cacheFile);
      fs.writeFileSync(cacheFile, rewroteCode);
      if (compiled.css) {
        combinedCSS += compiled.css + "\n";
      }

      for (const layoutPath of route.layoutPaths) {
        const layoutRelative = path.relative(pagesDir, layoutPath);
        const layoutContent = fs.readFileSync(layoutPath, "utf-8");
        const layoutCompiled = compile(layoutContent, "__layout__");
        const layoutCacheFile = path.join(
          cacheDir,
          "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js",
        );
        const layoutRewroteCode = rewriteRelativeImports(layoutCompiled.code, layoutPath, layoutCacheFile);
        fs.writeFileSync(layoutCacheFile, layoutRewroteCode);
        if (layoutCompiled.css) {
          combinedCSS += layoutCompiled.css + "\n";
        }
      }
    }

    if (combinedCSS) {
      fs.writeFileSync(path.join(cacheDir, "bundle.css"), combinedCSS);
      PomeloLogger.info("Bundled styles written to .pomelo-cache/bundle.css");
    }

    PomeloLogger.info(`Successfully compiled ${routes.length} routes!`);
    return true;
  } catch (err) {
    PomeloLogger.error("Build failed: " + String(err));
    return false;
  }
}
