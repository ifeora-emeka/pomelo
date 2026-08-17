import {
  MarkupKind,
  type Hover,
  type Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  scanRegions,
  regionAtOffset,
} from "../../../src/shared/regions.js";
import { keywordByName } from "../../../src/shared/language.js";
import { buildVirtualCss, cssService } from "../embedded/css.js";

const KEYWORD_AT = /\$[A-Za-z]+/g;

export function provideHover(
  document: TextDocument,
  position: Position,
): Hover | null {
  const offset = document.offsetAt(position);
  const regions = scanRegions(document.getText());
  const region = regionAtOffset(regions, offset);
  if (!region) return null;

  if (region.name === "Style") {
    const { doc, stylesheet } = buildVirtualCss(document);
    return cssService.doHover(doc, position, stylesheet);
  }

  const text = document.getText();
  KEYWORD_AT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KEYWORD_AT.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset < start || offset > end) continue;
    const kw = keywordByName(match[0]);
    if (!kw) return null;
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `\`\`\`ts\n${kw.detail}\n\`\`\`\n\n${kw.doc}`,
      },
      range: {
        start: document.positionAt(start),
        end: document.positionAt(end),
      },
    };
  }

  return null;
}
