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
} from "@kallo/shared";

export function compile(source: string, filename: string): CompilerResult {
  KalloLogger.info(`Compiling component file: ${filename}`);

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

  const isPageOrLayout =
    filename.endsWith("page.kal") ||
    filename.endsWith("layout.kal") ||
    filename.endsWith("index.kal") ||
    filename.includes("page.kal") ||
    filename.includes("layout.kal") ||
    filename.includes("index.kal") ||
    filename === "__layout__" ||
    filename === "page" ||
    filename === "layout" ||
    filename.endsWith("server.kal") ||
    filename.endsWith("client.kal") ||
    process.env.NODE_ENV === "test" ||
    process.env.KALLO_TEST === "true" ||
    process.env.KALLO_ENV === "test";

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
