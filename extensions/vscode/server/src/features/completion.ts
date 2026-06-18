import {
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  type CompletionItem,
  type CompletionList,
  type Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  scanRegions,
  regionAtOffset,
} from "../../../src/shared/regions.js";
import {
  KEYWORDS,
  VIEW_TAGS,
  type KeywordDoc,
} from "../../../src/shared/language.js";
import { buildVirtualCss, cssService } from "../embedded/css.js";

const DIRECTIVES: { label: string; detail: string; insert: string }[] = [
  { label: ":bind", detail: "Two-way binding", insert: ':bind="$1"' },
  { label: ":class", detail: "Dynamic class binding", insert: ':class="$1"' },
  { label: ":when", detail: "Conditional (Show)", insert: ':when="$1"' },
  { label: ":of", detail: "Iterable (Each)", insert: ':of="$1"' },
  { label: ":as", detail: "Item alias (Each)", insert: ':as="$1"' },
  { label: "@click", detail: "Click handler", insert: '@click="$1"' },
  { label: "@change", detail: "Change handler", insert: '@change="$1"' },
  { label: "@submit", detail: "Submit handler", insert: '@submit="$1"' },
  { label: "#fallback", detail: "Suspense fallback slot", insert: "#fallback" },
  { label: "#error", detail: "Boundary error slot", insert: "#error" },
];

export function provideCompletion(
  document: TextDocument,
  position: Position,
): CompletionItem[] | CompletionList {
  const offset = document.offsetAt(position);
  const regions = scanRegions(document.getText());
  const region = regionAtOffset(regions, offset);
  if (!region) return [];

  if (region.name === "Style") {
    const { doc, stylesheet } = buildVirtualCss(document);
    return cssService.doComplete(doc, position, stylesheet);
  }

  if (region.name === "View") {
    return viewCompletions();
  }

  // Server / Client / Head → framework keywords
  const scope = region.name === "Client" ? "client" : "server";
  return KEYWORDS.filter((k) => k.scope === scope).map(keywordItem);
}

function keywordItem(k: KeywordDoc): CompletionItem {
  return {
    label: k.name,
    kind: CompletionItemKind.Function,
    detail: k.detail,
    documentation: { kind: MarkupKind.Markdown, value: k.doc },
    insertText: k.snippet ?? k.name,
    insertTextFormat: k.snippet
      ? InsertTextFormat.Snippet
      : InsertTextFormat.PlainText,
  };
}

function viewCompletions(): CompletionItem[] {
  const tags: CompletionItem[] = VIEW_TAGS.map((tag) => ({
    label: tag,
    kind: CompletionItemKind.Class,
    detail: "Kallo template tag",
    insertText: tag,
  }));

  const directives: CompletionItem[] = DIRECTIVES.map((d) => ({
    label: d.label,
    kind: CompletionItemKind.Property,
    detail: d.detail,
    insertText: d.insert,
    insertTextFormat: InsertTextFormat.Snippet,
  }));

  return [...tags, ...directives];
}
