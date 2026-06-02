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
