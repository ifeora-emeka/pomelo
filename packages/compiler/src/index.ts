import type { CompilerResult } from "@kallo/types";
import { parse } from "@kallo/parser";
import { transformServer } from "./transforms/server-transform.js";
import { transformClient } from "./transforms/client-transform.js";
import { transformStyle } from "./transforms/style-transform.js";
import { transformTemplate } from "./transforms/template-transform.js";
import {
  KalloLogger,
  BLOCK_SERVER,
  BLOCK_CLIENT,
  BLOCK_STYLE,
  BLOCK_VIEW,
  hashId,
} from "@kallo/shared";

export function compile(source: string, filename: string): CompilerResult {
  KalloLogger.info(`Compiling component file: ${filename}`);

  const componentId = hashId(filename);

  const ast = parse(source);

  let serverCode = "";
  let clientCode = "";
  let cssCode = "";
  let templateCode = "";

  // <Server>/<Client>/<Head> blocks are only valid in route entry files.
  const basename = filename.split(/[\\/]/).pop() || filename;
  const ROUTE_ENTRY_FILES = new Set([
    "page.kal",
    "layout.kal",
    "index.kal",
    "server.kal",
    "client.kal",
    "__layout__",
    "page",
    "layout",
  ]);
  const isPageOrLayout = ROUTE_ENTRY_FILES.has(basename);

  let viewNode: any = null;
  let headNode: any = null;

  for (const node of ast.children) {
    if (node.type === BLOCK_SERVER) {
      if (!isPageOrLayout) {
        throw new Error(`Using the <Server> block outside page.kal, layout.kal, or index.kal is not allowed (found in ${filename}).`);
      }
      serverCode += transformServer(node);
    } else if (node.type === BLOCK_CLIENT) {
      if (!isPageOrLayout) {
        throw new Error(`Using the <Client> block outside page.kal, layout.kal, or index.kal is not allowed (found in ${filename}).`);
      }
      clientCode += transformClient(node);
    } else if (node.type === BLOCK_STYLE) {
      cssCode += transformStyle(node, componentId);
    } else if (node.type === "Head") {
      if (!isPageOrLayout) {
        throw new Error(`Using the <Head> block outside page.kal, layout.kal, or index.kal is not allowed (found in ${filename}).`);
      }
      headNode = node;
    } else if (node.type === BLOCK_VIEW) {
      viewNode = node;
    }
  }

  if (viewNode) {
    templateCode += transformTemplate(viewNode, componentId, headNode);
  }

  const cssExport = cssCode
    ? `export const css = ${JSON.stringify(cssCode)};`
    : "";
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
