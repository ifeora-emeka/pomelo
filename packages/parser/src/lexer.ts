import {
  BLOCK_SERVER,
  BLOCK_CLIENT,
  BLOCK_VIEW,
  BLOCK_STYLE,
  BLOCKS,
} from "@kallo/shared";
import { parseAttributes } from "./parser.js";

export interface Token {
  type:
    | typeof BLOCK_SERVER
    | typeof BLOCK_CLIENT
    | typeof BLOCK_VIEW
    | typeof BLOCK_STYLE;
  content: string;
  attributes?: Record<string, string>;
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const regex = new RegExp(
    `<(${BLOCKS.join("|")})([^>]*?)>([\\s\\S]*?)<\\/\\1>`,
    "g",
  );
  let match;
  while ((match = regex.exec(source)) !== null) {
    const type = match[1] as Token["type"];
    const attrString = match[2]?.trim() ?? "";
    const attributes = attrString ? parseAttributes(attrString) : undefined;
    const content = match[3]?.trim() ?? "";
    tokens.push({ type, content, attributes });
  }
  return tokens;
}
