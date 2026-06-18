import { handleSFCCompilation, generateClientModule } from "./transform.js";
import { KalloLogger, SFC_EXTENSION, hashId } from "@kallojs/shared";

const CSS_VIRTUAL_PREFIX = "\0kallo-css:";

export function kalloVitePlugin(_options: { pagesDir?: string } = {}) {
  const cssMap = new Map<string, string>();
  let isServing = false;

  return {
    name: "vite-plugin-kallo",

    configResolved(config: { command: string }) {
      isServing = config.command === "serve";
    },

    resolveId(id: string) {
      if (id.startsWith("kallo-css:")) {
        return CSS_VIRTUAL_PREFIX + id.slice("kallo-css:".length);
      }
      if (id === "@kallojs/runtime") {
        return id;
      }
      return null;
    },

    load(id: string) {
      if (id.startsWith(CSS_VIRTUAL_PREFIX)) {
        const realId = id.slice(CSS_VIRTUAL_PREFIX.length);
        const css = cssMap.get(realId);
        if (css) {
          return `const css = ${JSON.stringify(css)};\nexport default css;\n`;
        }
        return "export default '';";
      }
      return null;
    },

    transform(code: string, id: string) {
      if (!id.endsWith(SFC_EXTENSION)) {
        return null;
      }

      try {
        const compiled = handleSFCCompilation(code, id);
        if (!compiled) {
          return null;
        }

        const componentId = generateComponentId(id);

        if (compiled.css) {
          cssMap.set(id, compiled.css);
        }

        if (isServing) {
          const clientCode = generateClientModule(
            compiled.code,
            compiled.css,
            componentId,
            id,
          );
          return {
            code: clientCode,
            map: null,
          };
        }

        let output = compiled.code;
        if (compiled.css) {
          output += `\nexport const css = ${JSON.stringify(compiled.css)};\n`;
        }
        output += `export const componentId = ${JSON.stringify(componentId)};\n`;

        return {
          code: output,
          map: null,
        };
      } catch (err) {
        const message = (err as Error).message;
        KalloLogger.error(`Compilation error in ${id}: ${message}`);

        if (isServing) {
          return {
            code: generateErrorOverlay(id, message),
            map: null,
          };
        }

        throw err;
      }
    },

    handleHotUpdate(ctx: {
      file: string;
      modules: Array<{ file: string | null }>;
    }) {
      if (!ctx.file.endsWith(SFC_EXTENSION)) {
        return;
      }

      KalloLogger.info(`HMR update: ${ctx.file}`);

      const affectedModules = ctx.modules.filter(
        (mod) => mod.file === ctx.file,
      );

      if (affectedModules.length > 0) {
        return affectedModules;
      }

      return ctx.modules;
    },
  };
}

function generateComponentId(filename: string): string {
  return hashId(filename);
}

function generateErrorOverlay(file: string, message: string): string {
  const escaped = message
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
  return `
if (typeof document !== "undefined") {
  const overlay = document.createElement("div");
  overlay.id = "kallo-error-overlay";
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);color:#ff6b6b;font-family:monospace;font-size:14px;padding:32px;z-index:999999;overflow:auto;box-sizing:border-box";
  overlay.innerHTML = \`
    <div style="max-width:800px;margin:0 auto">
      <h2 style="color:#ff6b6b;font-size:18px;margin-bottom:8px">Kallo Compilation Error</h2>
      <p style="color:#999;margin-bottom:16px">${file}</p>
      <pre style="background:#1a1a1a;padding:16px;border-radius:8px;overflow-x:auto;white-space:pre-wrap;color:#ff6b6b">${escaped}</pre>
      <button onclick="this.parentElement.parentElement.remove()" style="margin-top:16px;padding:8px 16px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer">Dismiss</button>
    </div>
  \`;
  const existing = document.getElementById("kallo-error-overlay");
  if (existing) existing.remove();
  document.body.appendChild(overlay);
}
export default {};
`;
}

export { handleSFCCompilation, generateClientModule } from "./transform.js";
