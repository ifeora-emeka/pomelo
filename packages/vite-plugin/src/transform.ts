import { compile } from "@pomelo/compiler";
import { PomeloLogger, SFC_EXTENSION } from "@pomelo/shared";

export function handleSFCCompilation(code: string, id: string) {
  if (id.endsWith(SFC_EXTENSION)) {
    PomeloLogger.info(`Compiling template inside Vite: ${id}`);
    const result = compile(code, id);
    return result;
  }
  return null;
}

export function generateClientModule(
  code: string,
  css: string | undefined,
  componentId: string,
  id: string,
): string {
  let output = "";

  output += `import { hydrate, injectStyle, removeStyle, destroyInstance } from "@pomelo/runtime";\n`;

  if (css) {
    output += `const __pom_css__ = ${JSON.stringify(css)};\n`;
    output += `injectStyle(__pom_css__, ${JSON.stringify(componentId)});\n`;
  }

  output += code + "\n";

  output += `\nexport const componentId = ${JSON.stringify(componentId)};\n`;
  output += `export const css = ${css ? "__pom_css__" : "undefined"};\n`;

  output += `\nif (import.meta.hot) {\n`;
  output += `  import.meta.hot.accept((newModule) => {\n`;
  output += `    if (newModule) {\n`;
  output += `      const container = document.getElementById("app");\n`;
  output += `      if (container && newModule.setup) {\n`;
  output += `        if (window.__pom_instance__) {\n`;
  output += `          destroyInstance(window.__pom_instance__);\n`;
  output += `        }\n`;
  output += `        if (newModule.css) {\n`;
  output += `          injectStyle(newModule.css, newModule.componentId || ${JSON.stringify(componentId)});\n`;
  output += `        }\n`;
  output += `        window.__pom_instance__ = hydrate(container, {\n`;
  output += `          setup: newModule.setup,\n`;
  output += `          render: newModule.render,\n`;
  output += `          css: newModule.css || "",\n`;
  output += `          componentId: newModule.componentId || ${JSON.stringify(componentId)}\n`;
  output += `        });\n`;
  output += `      } else if (container && newModule.render) {\n`;
  output += `        container.innerHTML = newModule.render();\n`;
  output += `      }\n`;
  output += `    }\n`;
  output += `  });\n`;
  output += `}\n`;

  return output;
}
