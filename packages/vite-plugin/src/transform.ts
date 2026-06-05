import { compile } from "@kallo/compiler";
import {
  KalloLogger,
  SFC_EXTENSION,
  replaceEnvVars,
  stripServerBlock,
} from "@kallo/shared";

export function handleSFCCompilation(code: string, id: string) {
  if (id.endsWith(SFC_EXTENSION)) {
    KalloLogger.info(`Compiling template inside Vite: ${id}`);
    const result = compile(code, id);
    return result;
  }
  return null;
}

function computeHash(str: string): string {
  return Math.abs(
    str
      .split("")
      .reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0),
  )
    .toString(36)
    .slice(0, 8);
}

export function generateClientModule(
  code: string,
  css: string | undefined,
  componentId: string,
  id: string,
): string {
  let output = "";

  output += `import { hydrate, injectStyle, removeStyle, destroyInstance } from "@kallo/runtime";\n`;

  if (css) {
    output += `const __kal_css__ = ${JSON.stringify(css)};\n`;
    output += `injectStyle(__kal_css__, ${JSON.stringify(componentId)});\n`;
  }

  // Strip server block and replace environment variables for client-side execution
  const processedCode = replaceEnvVars(stripServerBlock(code));
  output += processedCode + "\n";

  output += `\nexport const componentId = ${JSON.stringify(componentId)};\n`;
  output += `export const css = ${css ? "__kal_css__" : "undefined"};\n`;

  const setupCode = code.split("// === Template Block ===")[0] ?? code;
  const setupHash = computeHash(setupCode);
  output += `export const __kal_setup_hash__ = ${JSON.stringify(setupHash)};\n`;

  output += `\nif (import.meta.hot) {\n`;
  output += `  import.meta.hot.accept((newModule) => {\n`;
  output += `    if (!newModule) return;\n`;
  output += `    const container = document.getElementById("app");\n`;
  output += `    if (!container) return;\n`;
  output += `    const prevInst = window.__kal_instance__;\n`;
  output += `    if (newModule.setup) {\n`;
  output += `      const setupUnchanged = !!prevInst && newModule.__kal_setup_hash__ === __kal_setup_hash__;\n`;
  output += `      if (setupUnchanged && prevInst.hotUpdate) {\n`;
  output += `        if (newModule.css) {\n`;
  output += `          injectStyle(newModule.css, newModule.componentId || ${JSON.stringify(componentId)});\n`;
  output += `        }\n`;
  output += `        prevInst.hotUpdate(newModule.render);\n`;
  output += `      } else {\n`;
  output += `        if (prevInst) {\n`;
  output += `          destroyInstance(prevInst);\n`;
  output += `        }\n`;
  output += `        if (newModule.css) {\n`;
  output += `          injectStyle(newModule.css, newModule.componentId || ${JSON.stringify(componentId)});\n`;
  output += `        }\n`;
  output += `        window.__kal_instance__ = hydrate(container, {\n`;
  output += `          setup: newModule.setup,\n`;
  output += `          render: newModule.render,\n`;
  output += `          css: newModule.css || "",\n`;
  output += `          componentId: newModule.componentId || ${JSON.stringify(componentId)}\n`;
  output += `        });\n`;
  output += `      }\n`;
  output += `    } else if (newModule.render) {\n`;
  output += `      container.innerHTML = newModule.render();\n`;
  output += `    }\n`;
  output += `  });\n`;
  output += `}\n`;

  return output;
}
