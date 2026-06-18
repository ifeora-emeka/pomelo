import { TextDocument } from "vscode-languageserver-textdocument";
import {
  getCSSLanguageService,
  type Stylesheet,
} from "vscode-css-languageservice";
import { scanRegions } from "../../../src/shared/regions.js";

const cssService = getCSSLanguageService();

/**
 * Builds a virtual CSS document that preserves the original offsets/line
 * breaks of the source: every character outside a <Style> block is replaced
 * with a space (newlines kept), so positions returned by the CSS service map
 * 1:1 back to the .kal document with no further translation.
 */
export function buildVirtualCss(document: TextDocument): {
  doc: TextDocument;
  stylesheet: Stylesheet;
  hasStyle: boolean;
} {
  const source = document.getText();
  const regions = scanRegions(source).filter((r) => r.name === "Style");

  let masked = "";
  let cursor = 0;
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      masked += source[i] === "\n" || source[i] === "\r" ? source[i] : " ";
    }
  };

  for (const region of regions) {
    blank(cursor, region.contentStart);
    masked += source.slice(region.contentStart, region.contentEnd);
    cursor = region.contentEnd;
  }
  blank(cursor, source.length);

  const doc = TextDocument.create(
    document.uri,
    "css",
    document.version,
    masked,
  );
  return {
    doc,
    stylesheet: cssService.parseStylesheet(doc),
    hasStyle: regions.length > 0,
  };
}

export { cssService };
