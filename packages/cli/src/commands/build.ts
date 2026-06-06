import { KalloLogger, rewriteRelativeImports } from "@kallo/shared";
import { scanRoutes, compileAPIRoutes, resolveLayoutChain } from "@kallo/server";
import { compile } from "@kallo/compiler";
import fs from "node:fs";
import path from "node:path";

export function executeBuildCommand(args: string[]): boolean {
  process.env.NODE_ENV = "production";
  process.env.KALLO_ENV = "production";
  KalloLogger.info("Starting compilation build...");

  const globalCssPath = path.join(process.cwd(), "src/styles/global.css");
  const outputCssPath = path.join(process.cwd(), "public/tailwind.css");
  if (fs.existsSync(globalCssPath)) {
    KalloLogger.info("Compiling Tailwind CSS...");
    const { execSync } = require("node:child_process");
    try {
      execSync(`npx @tailwindcss/cli -i ${globalCssPath} -o ${outputCssPath}`, {
        stdio: "ignore",
      });
    } catch (err) {
      KalloLogger.warn("Failed to compile Tailwind CSS: " + String(err));
    }
  }

  const pagesDir = path.join(process.cwd(), "src/view");
  const cacheDir = path.join(process.cwd(), ".kallo");

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
    // Scan and compile all special files: error.kal, not-found.kal, unauthorized.kal
    const specialFileNames = ["error.kal", "not-found.kal", "unauthorized.kal"];
    const allSpecialFiles: string[] = [];

    const findSpecialFilesRecursive = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findSpecialFilesRecursive(fullPath);
        } else if (specialFileNames.includes(entry.name)) {
          allSpecialFiles.push(fullPath);
        }
      }
    };
    findSpecialFilesRecursive(pagesDir);

    for (const specialFile of allSpecialFiles) {
      const relative = path.relative(pagesDir, specialFile);
      const content = fs.readFileSync(specialFile, "utf-8");
      const compiled = compile(content, specialFile);

      const cacheFile = path.join(
        cacheDir,
        relative.replace(/[\/\\]/g, "_") + ".js"
      );
      const rewroteCode = rewriteRelativeImports(
        compiled.code,
        specialFile,
        cacheFile
      );
      fs.writeFileSync(cacheFile, rewroteCode);
      if (compiled.css) {
        combinedCSS += compiled.css + "\n";
      }

      // Compile layouts for this special file
      const layoutPaths = resolveLayoutChain(specialFile, pagesDir);
      for (const layoutPath of layoutPaths) {
        const layoutRelative = path.relative(pagesDir, layoutPath);
        const layoutContent = fs.readFileSync(layoutPath, "utf-8");
        const layoutCompiled = compile(layoutContent, layoutPath);
        const layoutCacheFile = path.join(
          cacheDir,
          "layout_" + layoutRelative.replace(/[\/\\]/g, "_") + ".js"
        );
        const layoutRewroteCode = rewriteRelativeImports(
          layoutCompiled.code,
          layoutPath,
          layoutCacheFile
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
      KalloLogger.info("Bundled styles written to .kallo/bundle.css");
    }

    KalloLogger.info(`Successfully compiled ${routes.length} routes!`);
    return true;
  } catch (err) {
    KalloLogger.error("Build failed: " + String(err));
    return false;
  }
}
