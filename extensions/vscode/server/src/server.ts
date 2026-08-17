import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  type InitializeResult,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  computeDiagnostics,
  type DiagnosticSettings,
} from "./features/diagnostics.js";
import { provideCompletion } from "./features/completion.js";
import { provideHover } from "./features/hover.js";
import { provideDocumentSymbols } from "./features/symbols.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface Settings {
  validate: { enable: boolean };
  css: { validate: boolean };
}

const DEFAULTS: Settings = {
  validate: { enable: true },
  css: { validate: true },
};

let settings: Settings = DEFAULTS;

function diagnosticSettings(): DiagnosticSettings {
  return {
    validate: settings.validate.enable,
    cssValidate: settings.css.validate,
  };
}

connection.onInitialize((): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ["$", "<", ":", "@", "#", "-", "."],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
    },
  };
});

connection.onDidChangeConfiguration((change) => {
  const incoming = (change.settings as { kallo?: Partial<Settings> })?.kallo;
  settings = {
    validate: { enable: incoming?.validate?.enable ?? true },
    css: { validate: incoming?.css?.validate ?? true },
  };
  documents.all().forEach(validate);
});

function validate(document: TextDocument): void {
  const diagnostics = computeDiagnostics(document, diagnosticSettings());
  void connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

documents.onDidChangeContent((event) => validate(event.document));
documents.onDidClose((event) => {
  void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return provideCompletion(document, params.position);
});

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  return provideHover(document, params.position);
});

connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return provideDocumentSymbols(document);
});

documents.listen(connection);
connection.listen();
