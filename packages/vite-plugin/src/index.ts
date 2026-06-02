import { handleSFCCompilation } from "./transform.js";

export function pomeloVitePlugin() {
  return {
    name: "vite-plugin-pomelo",
    transform(code: string, id: string) {
      const compiled = handleSFCCompilation(code, id);
      if (compiled) {
        return {
          code: compiled.code,
          map: null,
        };
      }
      return null;
    },
  };
}

export * from "./transform.js";
