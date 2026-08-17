import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { scanRegions } from "../../../src/shared/regions.js";

export function provideDocumentSymbols(
  document: TextDocument,
): DocumentSymbol[] {
  const regions = scanRegions(document.getText());
  return regions.map((region) => {
    const range = {
      start: document.positionAt(region.tagStart),
      end: document.positionAt(region.tagEnd),
    };
    const selectionRange = {
      start: document.positionAt(region.tagStart),
      end: document.positionAt(region.contentStart),
    };
    return {
      name: region.name,
      detail: region.attributes,
      kind: SymbolKind.Namespace,
      range,
      selectionRange,
    } satisfies DocumentSymbol;
  });
}
