import type { KalloASTNode } from "@kallojs/types";

const ID_START = /[A-Za-z_$]/;
const ID_CHAR = /[A-Za-z0-9_$]/;
const DECL_KEYWORDS = new Set(["const", "let", "var", "function"]);

/**
 * Scan JS source and return the identifiers declared at the top level (brace
 * depth 0) via const/let/var/function. Comments and string/template literals are
 * skipped so their contents are never mistaken for declarations. Supports simple
 * `{ a, b }` / `[a, b]` destructuring patterns at the top level.
 */
function collectTopLevelDeclarations(code: string): Set<string> {
  const names = new Set<string>();
  const n = code.length;
  const at = (idx: number): string => code.charAt(idx);
  let depth = 0;
  let i = 0;

  const skipString = (quote: string) => {
    i++; // opening quote
    while (i < n) {
      const c = at(i);
      if (c === "\\") { i += 2; continue; }
      if (quote === "`" && c === "$" && at(i + 1) === "{") {
        // Skip a template interpolation, balancing braces.
        i += 2;
        let d = 1;
        while (i < n && d > 0) {
          if (at(i) === "{") d++;
          else if (at(i) === "}") d--;
          i++;
        }
        continue;
      }
      if (c === quote) { i++; return; }
      i++;
    }
  };

  const collectPattern = () => {
    // Grab bare identifiers inside a { } / [ ] destructuring pattern.
    let d = 0;
    while (i < n) {
      const c = at(i);
      if (c === "{" || c === "[") { d++; i++; continue; }
      if (c === "}" || c === "]") { d--; i++; if (d === 0) return; continue; }
      if (c === '"' || c === "'" || c === "`") { skipString(c); continue; }
      if (ID_START.test(c)) {
        let j = i;
        while (j < n && ID_CHAR.test(at(j))) j++;
        const word = code.slice(i, j);
        // Look ahead: a key in `key:` is not a binding.
        let k = j;
        while (k < n && /\s/.test(at(k))) k++;
        if (at(k) !== ":") names.add(word);
        i = j;
        continue;
      }
      i++;
    }
  };

  while (i < n) {
    const c = at(i);
    if (c === "/" && at(i + 1) === "/") { i += 2; while (i < n && at(i) !== "\n") i++; continue; }
    if (c === "/" && at(i + 1) === "*") { i += 2; while (i < n && !(at(i) === "*" && at(i + 1) === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { skipString(c); continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; i++; continue; }
    if (c === "}" || c === ")" || c === "]") { depth--; i++; continue; }

    if (depth === 0 && ID_START.test(c)) {
      let j = i;
      while (j < n && ID_CHAR.test(at(j))) j++;
      const word = code.slice(i, j);
      if (DECL_KEYWORDS.has(word)) {
        let k = j;
        while (k < n && /\s/.test(at(k))) k++;
        if (word === "function" && at(k) === "*") { k++; while (k < n && /\s/.test(at(k))) k++; }
        if (at(k) === "{" || at(k) === "[") {
          i = k;
          collectPattern();
          continue;
        }
        let m = k;
        while (m < n && ID_CHAR.test(at(m))) m++;
        const ident = code.slice(k, m);
        if (ident && ID_START.test(ident.charAt(0))) names.add(ident);
        i = m;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }
  return names;
}

export function transformClient(node: KalloASTNode): string {
  // Extract imports to place them at the top level
  const imports: string[] = [];
  let cleanContent = node.content;

  // 1. Match standard imports with 'from' (prevent spanning across other 'import' keywords)
  const fromRegex = /import\s+((?:(?!import)[\s\S])*?)\s+from\s+['"]([^'"]+)['"];?/g;
  cleanContent = cleanContent.replace(fromRegex, (match, specifiers, importPath) => {
    if (importPath.endsWith(".css")) {
      return "";
    }
    imports.push(match);
    return "";
  });

  // 2. Match side-effect imports without 'from'
  const sideEffectRegex = /import\s+['"]([^'"]+)['"];?/g;
  cleanContent = cleanContent.replace(sideEffectRegex, (match, importPath) => {
    if (importPath.endsWith(".css")) {
      return "";
    }
    imports.push(match);
    return "";
  });

  // Collect the names declared at the TOP LEVEL of the client block so they can
  // be exposed as component state. This deliberately ignores declarations nested
  // inside functions/blocks (they are locals, not state) and anything inside
  // comments or string/template literals — a naive regex would wrongly hoist
  // `x` from `// let x` or from a callback body, breaking SSR.
  const declaredNames = collectTopLevelDeclarations(cleanContent);

  const returnObject = Array.from(declaredNames).join(", ");
  const returnItems = returnObject ? `...props, ${returnObject}` : "...props";
  const setupFunction = `export function setup(props = {}) {\n${cleanContent.trim()}\n  return { ${returnItems} };\n}`;

  const header = imports.length > 0 ? imports.join("\n") + "\n\n" : "";
  return `${header}// === Client Block ===\n${setupFunction}\n`;
}
