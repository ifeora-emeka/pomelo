import type { PomeloAST, PomeloASTNode } from "@pomelo/types";
import { NODE_ROOT } from "@pomelo/shared";

export function createASTNode(
  type: PomeloASTNode["type"],
  content: string,
  attributes?: Record<string, string>,
  children?: PomeloASTNode[],
  tagName?: string,
): PomeloASTNode {
  return {
    type,
    content,
    tagName,
    attributes,
    children,
  };
}

export function createAST(children: PomeloASTNode[]): PomeloAST {
  return {
    type: NODE_ROOT,
    children,
  };
}
