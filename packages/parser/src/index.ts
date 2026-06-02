import type { PomeloAST } from "@pomelo/types";
import { logInfo } from "@pomelo/shared";

export function parsePomelo(source: string): PomeloAST {
  logInfo("Parsing source code...");
  return {
    type: "PomeloRoot",
    content: source.trim()
  };
}
