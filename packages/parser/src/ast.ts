import type { KalloAST, KalloASTNode } from "@kallo/types";
import { NODE_ROOT } from "@kallo/shared";

export function createASTNode(
  type: KalloASTNode["type"],
  content: string,
  attributes?: Record<string, string>,
  children?: KalloASTNode[],
  tagName?: string,
): KalloASTNode {
  return {
    type,
    content,
    tagName,
    attributes,
    children,
  };
}

export function createAST(children: KalloASTNode[]): KalloAST {
  return {
    type: NODE_ROOT,
    children,
  };
}
