import type { CompilerResult } from "@pomelo/types";
import { parse } from "@pomelo/parser";
import { transformServer } from "./transforms/server-transform.js";
import { transformClient } from "./transforms/client-transform.js";
import { transformStyle } from "./transforms/style-transform.js";
import { transformTemplate } from "./transforms/template-transform.js";
import {
  PomeloLogger,
  BLOCK_SERVER,
  BLOCK_CLIENT,
  BLOCK_STYLE,
  BLOCK_VIEW,
} from "@pomelo/shared";

export function compile(source: string, filename: string): CompilerResult {
  PomeloLogger.info(`Compiling component file: ${filename}`);

  const componentId = Math.abs(
    filename
      .split("")
      .reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0),
  )
    .toString(36)
    .slice(0, 6);

  const ast = parse(source);

  let serverCode = "";
  let clientCode = "";
  let cssCode = "";
  let templateCode = "";

  for (const node of ast.children) {
    if (node.type === BLOCK_SERVER) {
      serverCode += transformServer(node);
    } else if (node.type === BLOCK_CLIENT) {
      clientCode += transformClient(node);
    } else if (node.type === BLOCK_STYLE) {
      cssCode += transformStyle(node, componentId);
    } else if (node.type === BLOCK_VIEW) {
      templateCode += transformTemplate(node, componentId);
    }
  }

  const cssExport = cssCode ? `export const css = ${JSON.stringify(cssCode)};` : "";
  const idExport = `export const componentId = ${JSON.stringify(componentId)};`;
  const finalCode = [serverCode, clientCode, templateCode, cssExport, idExport]
    .filter(Boolean)
    .join("\n");

  return {
    code: finalCode,
    css: cssCode || undefined,
  };
}

export * from "./transforms/server-transform.js";
export * from "./transforms/client-transform.js";
export * from "./transforms/style-transform.js";
export * from "./transforms/template-transform.js";
