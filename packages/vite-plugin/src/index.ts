import { compilePomelo } from "@pomelo/compiler";
import { logInfo } from "@pomelo/shared";

export function pomeloVitePlugin() {
  return {
    name: "vite-plugin-pomelo",
    transform(code: string, id: string) {
      if (id.endsWith(".pom")) {
        logInfo(`Transforming SFC file: ${id}`);
        return {
          code: compilePomelo(code),
          map: null
        };
      }
      return null;
    }
  };
}
