import { BLOCK_NAMES, type BlockName } from "./language.js";

export interface BlockRegion {
  name: BlockName;
  /** Raw attribute string from the opening tag (e.g. `lang="ts" scoped`). */
  attributes: string;
  /** Offset of the `<` of the opening tag. */
  tagStart: number;
  /** Offset just after the `>` of the opening tag (start of content). */
  contentStart: number;
  /** Offset of the `<` of the closing tag, or end-of-document if unclosed. */
  contentEnd: number;
  /** Offset just after the `>` of the closing tag, or end-of-document. */
  tagEnd: number;
  /** True when no matching closing tag was found. */
  unterminated: boolean;
}

const OPEN_TAG = new RegExp(
  `<(${BLOCK_NAMES.join("|")})\\b([^>]*)>`,
  "g",
);

/**
 * Splits a `.kal` document into its top-level blocks. Unlike the framework
 * parser, this never throws: malformed or half-typed documents return whatever
 * regions can be recovered, which is what a language server needs while typing.
 */
export function scanRegions(source: string): BlockRegion[] {
  const regions: BlockRegion[] = [];
  OPEN_TAG.lastIndex = 0;
  let open: RegExpExecArray | null;

  while ((open = OPEN_TAG.exec(source)) !== null) {
    const name = open[1] as BlockName;
    const attributes = (open[2] ?? "").trim();
    const tagStart = open.index;
    const contentStart = open.index + open[0].length;

    const close = `</${name}>`;
    const closeIdx = source.indexOf(close, contentStart);

    if (closeIdx === -1) {
      regions.push({
        name,
        attributes,
        tagStart,
        contentStart,
        contentEnd: source.length,
        tagEnd: source.length,
        unterminated: true,
      });
      break;
    }

    regions.push({
      name,
      attributes,
      tagStart,
      contentStart,
      contentEnd: closeIdx,
      tagEnd: closeIdx + close.length,
      unterminated: false,
    });

    OPEN_TAG.lastIndex = closeIdx + close.length;
  }

  return regions;
}

export function blockContent(source: string, region: BlockRegion): string {
  return source.slice(region.contentStart, region.contentEnd);
}

export function regionAtOffset(
  regions: BlockRegion[],
  offset: number,
): BlockRegion | undefined {
  return regions.find(
    (r) => offset >= r.contentStart && offset <= r.contentEnd,
  );
}
