import path from "node:path";

export function rewriteRelativeImports(code: string, originalFilePath: string, cacheFilePath: string): string {
  const originalDir = path.dirname(originalFilePath);
  const cacheDir = path.dirname(cacheFilePath);

  return code.replace(
    /(\b(?:import|export)\s+[\s\S]*?\s+from\s+['"]|import\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, prefix, importPath, suffix) => {
      const targetAbsPath = path.resolve(originalDir, importPath);
      let relativePath = path.relative(cacheDir, targetAbsPath);
      if (!relativePath.startsWith(".")) {
        relativePath = "./" + relativePath;
      }
      return `${prefix}${relativePath}${suffix}`;
    }
  );
}
