import type { PomeloASTNode } from "@pomelo/types";
import {
  VOID_TAGS,
  NODE_TEXT,
  NODE_ELEMENT,
  TAG_EACH,
  TAG_WHEN,
  TAG_ELSE,
  TAG_SLOT,
} from "@pomelo/shared";

function extractIdentifiers(expression: string): string[] {
  const cleanExpr = expression
    .replace(/\?\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*/g, "")
    .replace(/\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*/g, "");
  const matches = cleanExpr.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
  const keywords = new Set([
    "true",
    "false",
    "null",
    "undefined",
    "var",
    "let",
    "const",
    "function",
    "class",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "new",
    "this",
    "typeof",
    "instanceof",
    "in",
    "of",
    "delete",
    "void",
    "async",
    "await",
    "import",
    "export",
    "default",
    "from",
    "as",
    "map",
    "join",
    "filter",
    "reduce",
    "find",
    "forEach",
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Math",
    "JSON",
    "console",
    "log",
    "error",
    "warn",
    "window",
    "document",
    "global",
    "globalThis",
    "$event",
    "target",
  ]);
  return matches.filter((id) => !keywords.has(id));
}

function collectIdentifiers(node: PomeloASTNode, set: Set<string>): void {
  if (node.type === NODE_TEXT) {
    const rx = /\{\{([\s\S]*?)\}\}/g;
    let m;
    while ((m = rx.exec(node.content)) !== null) {
      if (m[1]) {
        extractIdentifiers(m[1]).forEach((id) => set.add(id));
      }
    }
  } else if (node.type === NODE_ELEMENT) {
    if (node.tagName === TAG_EACH) {
      const ofAttr = node.attributes?.["of"];
      const asAttr = node.attributes?.["as"];
      if (ofAttr) {
        extractIdentifiers(ofAttr).forEach((id) => set.add(id));
      }
      if (asAttr) {
        extractIdentifiers(asAttr).forEach((id) => set.add(id));
      }
    } else if (node.tagName === TAG_WHEN) {
      const cond = node.attributes?.["condition"];
      if (cond) {
        extractIdentifiers(cond).forEach((id) => set.add(id));
      }
    }

    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        if (key.startsWith("@") || key.startsWith(":")) {
          extractIdentifiers(value).forEach((id) => set.add(id));
        } else {
          const rx = /\{\{([\s\S]*?)\}\}/g;
          let m;
          while ((m = rx.exec(value)) !== null) {
            if (m[1]) {
              extractIdentifiers(m[1]).forEach((id) => set.add(id));
            }
          }
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        collectIdentifiers(child, set);
      }
    }
  }
}

export function transformTemplate(
  node: PomeloASTNode,
  componentId: string,
): string {
  const identifiers = new Set<string>();
  for (const child of node.children || []) {
    collectIdentifiers(child, identifiers);
  }

  const deconstruct =
    identifiers.size > 0
      ? `  const { ${Array.from(identifiers).join(", ")} } = state;\n`
      : "";

  function compileNode(n: PomeloASTNode, lastWhen: string): { html: string; nextWhen: string } {
    if (n.type === NODE_TEXT) {
      const html = n.content.replace(
        /\{\{([\s\S]*?)\}\}/g,
        (_, expr) => `\${${expr.trim()}}`,
      );
      return { html, nextWhen: lastWhen };
    }

    if (n.type === NODE_ELEMENT) {
      const tagName = n.tagName!;

      if (tagName === TAG_EACH) {
        const ofAttr = n.attributes?.["of"];
        const asAttr = n.attributes?.["as"];
        const childHTML = compileChildren(n.children || []);
        return {
          html: `\${(${ofAttr} || []).map((${asAttr}) => \`${childHTML}\`).join("")}`,
          nextWhen: ""
        };
      }

      if (tagName === TAG_WHEN) {
        const cond = n.attributes?.["condition"] || "true";
        const childHTML = compileChildren(n.children || []);
        return {
          html: `\${${cond} ? \`${childHTML}\` : ""}`,
          nextWhen: cond
        };
      }

      if (tagName === TAG_ELSE) {
        const cond = lastWhen ? `!(${lastWhen})` : "true";
        const childHTML = compileChildren(n.children || []);
        return {
          html: `\${${cond} ? \`${childHTML}\` : ""}`,
          nextWhen: ""
        };
      }

      if (tagName === TAG_SLOT) {
        const name = n.attributes?.["name"] || "default";
        return {
          html: `\${slots.${name} ? slots.${name}() : ""}`,
          nextWhen: ""
        };
      }

      // Normal HTML elements
      const attributes: string[] = [];
      attributes.push(`data-pom-${componentId}`);

      let className = "";
      let dynamicClass = "";

      if (n.attributes) {
        for (const [key, value] of Object.entries(n.attributes)) {
          if (key === "class") {
            className = value;
          } else if (key === ":class") {
            dynamicClass = value;
          } else if (key === ":bind") {
            // Two-way binding: e.g. :bind="search"
            attributes.push(`data-pom-bind="${value}"`);
            attributes.push(`value="\${${value}}"`);
            attributes.push(
              `data-pom-event-input="${value} = $event.target.value"`,
            );
          } else if (key.startsWith("@")) {
            const eventName = key.slice(1);
            attributes.push(`data-pom-event-${eventName}="${value}"`);
          } else if (key.startsWith(":")) {
            const propName = key.slice(1);
            attributes.push(`data-pom-bind-${propName}="${value}"`);
            attributes.push(`${propName}="\${${value}}"`);
          } else {
            // Static attribute (with interpolation support)
            const interpolatedValue = value.replace(
              /\{\{([\s\S]*?)\}\}/g,
              (_, expr) => `\${${expr.trim()}}`,
            );
            attributes.push(`${key}="${interpolatedValue}"`);
          }
        }
      }

      // Merge class and :class
      if (className || dynamicClass) {
        if (className && dynamicClass) {
          attributes.push(`class="${className} \${${dynamicClass}}"`);
        } else if (className) {
          attributes.push(`class="${className}"`);
        } else if (dynamicClass) {
          attributes.push(`class="\${${dynamicClass}}"`);
        }
      }

      const attrsStr = attributes.length > 0 ? " " + attributes.join(" ") : "";
      const isVoid = VOID_TAGS.includes(tagName.toLowerCase());

      if (isVoid) {
        return {
          html: `<${tagName}${attrsStr} />`,
          nextWhen: ""
        };
      }

      const childHTML = compileChildren(n.children || []);
      return {
        html: `<${tagName}${attrsStr}>${childHTML}</${tagName}>`,
        nextWhen: ""
      };
    }

    return { html: "", nextWhen: lastWhen };
  }

  function compileChildren(children: PomeloASTNode[]): string {
    let html = "";
    let currentWhen = "";
    for (const child of children) {
      const res = compileNode(child, currentWhen);
      html += res.html;
      currentWhen = res.nextWhen;
    }
    return html;
  }

  const content = compileChildren(node.children || []);
  return `export function render(state: any = {}, slots: any = {}) {\n${deconstruct}  return \`${content}\`;\n}\n`;
}
