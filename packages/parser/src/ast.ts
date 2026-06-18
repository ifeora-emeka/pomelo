import type { KalloAST, KalloASTNode } from "@kallojs/types";
import { NODE_ROOT } from "@kallojs/shared";

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
