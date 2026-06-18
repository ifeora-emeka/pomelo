import {
  DiagnosticSeverity,
  type Diagnostic,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  scanRegions,
  type BlockRegion,
} from "../../../src/shared/regions.js";
import { SINGLETON_BLOCKS } from "../../../src/shared/language.js";
import { buildVirtualCss, cssService } from "../embedded/css.js";

export interface DiagnosticSettings {
  validate: boolean;
  cssValidate: boolean;
}

export function computeDiagnostics(
  document: TextDocument,
  settings: DiagnosticSettings,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!settings.validate) return diagnostics;

  const source = document.getText();
  const regions = scanRegions(source);

  structuralDiagnostics(document, regions, diagnostics);

  if (settings.cssValidate) {
    cssDiagnostics(document, diagnostics);
  }

  return diagnostics;
}

function structuralDiagnostics(
  document: TextDocument,
  regions: BlockRegion[],
  out: Diagnostic[],
): void {
  const seen = new Map<string, number>();

  for (const region of regions) {
    const range = {
      start: document.positionAt(region.tagStart),
      end: document.positionAt(region.contentStart),
    };

    if (region.unterminated) {
      out.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: `<${region.name}> block is never closed. Add a matching </${region.name}>.`,
        source: "kallo",
      });
    }

    if (SINGLETON_BLOCKS.includes(region.name)) {
      const count = (seen.get(region.name) ?? 0) + 1;
      seen.set(region.name, count);
      if (count > 1) {
        out.push({
          severity: DiagnosticSeverity.Error,
          range,
          message: `Duplicate <${region.name}> block. A .kal file may contain at most one.`,
          source: "kallo",
        });
      }
    }
  }

  if (regions.length > 0 && !regions.some((r) => r.name === "View")) {
    out.push({
      severity: DiagnosticSeverity.Warning,
      range: {
        start: document.positionAt(0),
        end: document.positionAt(Math.min(1, document.getText().length)),
      },
      message:
        "This .kal file has no <View> block, so it renders nothing. Add a <View> block.",
      source: "kallo",
    });
  }
}

function cssDiagnostics(document: TextDocument, out: Diagnostic[]): void {
  const { doc, stylesheet, hasStyle } = buildVirtualCss(document);
  if (!hasStyle) return;
  for (const d of cssService.doValidation(doc, stylesheet)) {
    out.push({ ...d, source: "kallo(css)" });
  }
}
