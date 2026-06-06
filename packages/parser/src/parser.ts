import type { KalloAST, KalloASTNode } from "@kallo/types";
import { createAST, createASTNode } from "./ast.js";
import {
  KalloLogger,
  BLOCK_VIEW,
  BLOCKS,
  VOID_TAGS,
  TAG_EACH,
  NODE_ELEMENT,
  NODE_TEXT,
  ATTR_EACH_OF,
  ATTR_EACH_AS,
} from "@kallo/shared";

export function parseAttributes(attrString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const cleanAttr = attrString.replace(/\/$/, "").trim();
  const attrRegex =
    /([@:]?[a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g;
  let match;
  while ((match = attrRegex.exec(cleanAttr)) !== null) {
    const key = match[1];
    if (key) {
      const val = match[2] ?? match[3] ?? match[4] ?? "";
      attributes[key] = val;
    }
  }
  return attributes;
}

function parseHTML(html: string): KalloASTNode[] {
  const nodes: KalloASTNode[] = [];
  const stack: KalloASTNode[] = [];
  let index = 0;

  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const closeIndex = html.indexOf("-->", index);
      if (closeIndex === -1) {
        throw new Error(
          `Syntax Error: Unclosed HTML comment at index ${index}`,
        );
      }
      index = closeIndex + 3;
      continue;
    }

    if (html[index] === "<") {
      if (html[index + 1] === "/") {
        const closeIndex = html.indexOf(">", index);
        if (closeIndex === -1) {
          throw new Error(
            `Syntax Error: Unclosed tag starting at index ${index}`,
          );
        }
        const tagName = html.slice(index + 2, closeIndex).trim();
        if (!tagName) {
          throw new Error(
            `Syntax Error: Invalid empty closing tag at index ${index}`,
          );
        }

        if (stack.length === 0) {
          throw new Error(
            `Syntax Error: Unexpected closing tag </${tagName}> without opening tag`,
          );
        }

        const topNode = stack.pop()!;
        if (topNode.tagName !== tagName) {
          throw new Error(
            `Syntax Error: Mismatched tag: expected </${topNode.tagName}> but found </${tagName}>`,
          );
        }

        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(topNode);
        } else {
          nodes.push(topNode);
        }

        index = closeIndex + 1;
        continue;
      }

      const tagMatch = /^<([a-zA-Z0-9_-]+)/.exec(html.slice(index));
      if (!tagMatch) {
        throw new Error(
          `Syntax Error: Invalid tag name starting at index ${index}`,
        );
      }

      const tagName = tagMatch[1];
      if (!tagName) {
        throw new Error(
          `Syntax Error: Invalid tag name starting at index ${index}`,
        );
      }
      const nextChar = html[index + tagMatch[0].length];
      if (
        nextChar &&
        nextChar !== " " &&
        nextChar !== "\t" &&
        nextChar !== "\n" &&
        nextChar !== "\r" &&
        nextChar !== "/" &&
        nextChar !== ">"
      ) {
        throw new Error(
          `Syntax Error: Invalid tag name starting at index ${index}`,
        );
      }
      const searchIndex = index + tagMatch[0].length;

      let tagEndIndex = -1;
      let inQuotes: string | null = null;
      for (let i = searchIndex; i < html.length; i++) {
        const char = html[i];
        if (char === '"' || char === "'") {
          if (inQuotes === char) {
            inQuotes = null;
          } else if (inQuotes === null) {
            inQuotes = char;
          }
        }
        if (inQuotes === null) {
          if (char === ">") {
            tagEndIndex = i;
            break;
          }
        }
      }

      if (tagEndIndex === -1) {
        throw new Error(
          `Syntax Error: Unclosed opening tag <${tagName}> starting at index ${index}`,
        );
      }

      const rawTagContent = html.slice(searchIndex, tagEndIndex).trim();
      const isSelfClosing = rawTagContent.endsWith("/");
      const attrString = isSelfClosing
        ? rawTagContent.slice(0, -1).trim()
        : rawTagContent;
      const attributes = parseAttributes(attrString);

      const node = createASTNode(
        NODE_ELEMENT,
        tagName,
        attributes,
        [],
        tagName,
      );

      const isVoid = isSelfClosing || VOID_TAGS.includes(tagName.toLowerCase());

      if (isVoid) {
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(node);
        } else {
          nodes.push(node);
        }
      } else {
        stack.push(node);
      }

      index = tagEndIndex + 1;
      continue;
    }

    let nextTagIndex = html.indexOf("<", index);
    if (nextTagIndex === -1) {
      nextTagIndex = html.length;
    }

    const textContent = html.slice(index, nextTagIndex);
    if (textContent.trim()) {
      const textNode = createASTNode(NODE_TEXT, textContent);
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children = parent.children ?? [];
        parent.children.push(textNode);
      } else {
        nodes.push(textNode);
      }
    }

    index = nextTagIndex;
  }

  if (stack.length > 0) {
    const unclosedTag = stack[stack.length - 1];
    if (unclosedTag) {
      throw new Error(
        `Syntax Error: Unclosed tag <${unclosedTag.tagName}> at the end of the template`,
      );
    }
  }

  return nodes;
}

function validateEach(node: KalloASTNode): void {
  if (node.type === NODE_ELEMENT && node.tagName === TAG_EACH) {
    if (!node.attributes || !node.attributes[ATTR_EACH_OF]) {
      throw new Error(
        `Syntax Error: <Each> loop is missing the required "${ATTR_EACH_OF}" attribute`,
      );
    }
    if (!node.attributes || !node.attributes[ATTR_EACH_AS]) {
      throw new Error(
        `Syntax Error: <Each> loop is missing the required "${ATTR_EACH_AS}" attribute`,
      );
    }
  }
  if (node.children) {
    for (const child of node.children) {
      validateEach(child);
    }
  }
}

export function parse(source: string): KalloAST {
  KalloLogger.info("Parsing SFC source into AST...");

  const children: KalloASTNode[] = [];
  let index = 0;
  const blockTypes = new Set<string>();

  while (index < source.length) {
    const remaining = source.slice(index);
    const wsMatch = /^\s+/.exec(remaining);
    if (wsMatch) {
      index += wsMatch[0].length;
      continue;
    }

    if (index >= source.length) {
      break;
    }

    if (source[index] !== "<") {
      throw new Error(
        `Syntax Error: Unexpected character "${source[index]}" at root level. Content outside top-level blocks is not allowed.`,
      );
    }

    const tagMatch = /^<([a-zA-Z0-9_-]+)/.exec(source.slice(index));
    if (!tagMatch) {
      throw new Error(
        `Syntax Error: Invalid tag start at root level at index ${index}`,
      );
    }

    const tagName = tagMatch[1];
    if (!tagName) {
      throw new Error(
        `Syntax Error: Invalid tag start at root level at index ${index}`,
      );
    }
    const nextChar = source[index + tagMatch[0].length];
    if (
      nextChar &&
      nextChar !== " " &&
      nextChar !== "\t" &&
      nextChar !== "\n" &&
      nextChar !== "\r" &&
      nextChar !== ">"
    ) {
      throw new Error(
        `Syntax Error: Invalid top-level block name "<${tagName}>". Only <Server>, <Client>, <View>, and <Style> are allowed.`,
      );
    }
    if (!BLOCKS.includes(tagName)) {
      throw new Error(
        `Syntax Error: Invalid top-level block name "<${tagName}>". Only <Server>, <Client>, <View>, and <Style> are allowed.`,
      );
    }

    if (blockTypes.has(tagName)) {
      throw new Error(
        `Syntax Error: Multiple <${tagName}> blocks are not allowed.`,
      );
    }
    blockTypes.add(tagName);

    let openingEndIndex = -1;
    let inQuotes: string | null = null;
    const searchIndex = index + tagMatch[0].length;
    for (let i = searchIndex; i < source.length; i++) {
      const char = source[i];
      if (char === '"' || char === "'") {
        if (inQuotes === char) {
          inQuotes = null;
        } else if (inQuotes === null) {
          inQuotes = char;
        }
      }
      if (inQuotes === null) {
        if (char === ">") {
          openingEndIndex = i;
          break;
        }
      }
    }

    if (openingEndIndex === -1) {
      throw new Error(
        `Syntax Error: Unclosed opening tag <${tagName}> at root level`,
      );
    }

    const rawTagContent = source.slice(searchIndex, openingEndIndex).trim();
    const isSelfClosing = rawTagContent.endsWith("/");
    if (isSelfClosing) {
      throw new Error(
        `Syntax Error: Top-level block <${tagName}> cannot be self-closing.`,
      );
    }

    const attributes = parseAttributes(rawTagContent);
    const closeTag = `</${tagName}>`;
    const closeIndex = source.indexOf(closeTag, openingEndIndex + 1);
    if (closeIndex === -1) {
      throw new Error(
        `Syntax Error: Missing closing tag </${tagName}> for top-level block`,
      );
    }

    const content = source.slice(openingEndIndex + 1, closeIndex);
    const node = createASTNode(
      tagName as KalloASTNode["type"],
      content,
      attributes,
    );

    if (tagName === BLOCK_VIEW || tagName === "Head") {
      node.children = parseHTML(content);
      for (const child of node.children || []) {
        validateEach(child);
      }
    }

    children.push(node);
    index = closeIndex + closeTag.length;
  }

  return createAST(children);
}
