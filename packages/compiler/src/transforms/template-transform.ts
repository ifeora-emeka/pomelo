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


  function compileNode(n: PomeloASTNode, lastWhen: string, activeLoopVars: string[]): { html: string; nextWhen: string } {
    if (n.type === NODE_TEXT) {
      const html = n.content.replace(
        /\{\{([\s\S]*?)\}\}/g,
        (_, expr) => `\${${expr.trim()}}`,
      );
      return { html, nextWhen: lastWhen };
    }

    if (n.type === NODE_ELEMENT) {
      const tagName = n.tagName!;

      const isComponent = tagName && tagName.charAt(0) === tagName.charAt(0).toUpperCase() && tagName !== TAG_EACH && tagName !== TAG_WHEN && tagName !== TAG_ELSE;
      if (isComponent) {
        const propsPairs: string[] = [];
        if (n.attributes) {
          for (const [key, value] of Object.entries(n.attributes)) {
            if (key.startsWith(":")) {
              propsPairs.push(`${key.slice(1)}: ${value}`);
            } else if (key.startsWith("@")) {
              propsPairs.push(`${key.slice(1)}: ${value}`);
            } else {
              propsPairs.push(`${key}: ${JSON.stringify(value)}`);
            }
          }
        }
        const propsObj = propsPairs.length > 0 ? `{ ${propsPairs.join(", ")} }` : `{}`;
        return {
          html: `\${typeof ${tagName} !== "undefined" && ${tagName}.render ? _renderComponent(${tagName}, ${propsObj}) : ""}`,
          nextWhen: ""
        };
      }

      if (tagName === TAG_EACH) {
        const ofAttr = n.attributes?.["of"];
        const asAttr = n.attributes?.["as"] || "item";
        const childHTML = compileChildren(n.children || [], [...activeLoopVars, asAttr]);
        return {
          html: `\${(${ofAttr} || []).map((${asAttr}) => \`${childHTML}\`).join("")}`,
          nextWhen: ""
        };
      }

      if (tagName === TAG_WHEN) {
        const cond = n.attributes?.["condition"] || "true";
        const childHTML = compileChildren(n.children || [], activeLoopVars);
        return {
          html: `\${${cond} ? \`${childHTML}\` : ""}`,
          nextWhen: cond
        };
      }

      if (tagName === TAG_ELSE) {
        const cond = lastWhen ? `!(${lastWhen})` : "true";
        const childHTML = compileChildren(n.children || [], activeLoopVars);
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
            
            // Serialize any active loop variables used in this event handler
            for (const loopVar of activeLoopVars) {
              const rx = new RegExp(`\\b${loopVar}\\b`);
              if (rx.test(value)) {
                attributes.push(
                  `data-pom-loop-item-${loopVar}="\${JSON.stringify(${loopVar}).replace(/\\"/g, '&quot;')}"`
                );
              }
            }
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

      const childHTML = compileChildren(n.children || [], activeLoopVars);
      return {
        html: `<${tagName}${attrsStr}>${childHTML}</${tagName}>`,
        nextWhen: ""
      };
    }

    return { html: "", nextWhen: lastWhen };
  }

  function compileChildren(children: PomeloASTNode[], activeLoopVars: string[]): string {
    let html = "";
    let currentWhen = "";
    for (const child of children) {
      const res = compileNode(child, currentWhen, activeLoopVars);
      html += res.html;
      currentWhen = res.nextWhen;
    }
    return html;
  }

  const loopVars = new Set<string>();
  function findLoopVars(n: PomeloASTNode) {
    if (n.type === NODE_ELEMENT) {
      if (n.tagName === TAG_EACH) {
        const asAttr = n.attributes?.["as"];
        if (asAttr) {
          loopVars.add(asAttr);
        }
      }
      for (const child of n.children || []) {
        findLoopVars(child);
      }
    }
  }
  for (const child of node.children || []) {
    findLoopVars(child);
  }
  for (const lv of loopVars) {
    identifiers.delete(lv);
  }
  for (const id of identifiers) {
    const first = id?.[0];
    if (first && first === first.toUpperCase()) {
      identifiers.delete(id);
    }
  }

  const deconstruct =
    identifiers.size > 0
      ? `  const { ${Array.from(identifiers).join(", ")} } = state;\n`
      : "";

  const content = compileChildren(node.children || [], []);
  return `export function render(state = {}, slots = {}) {
  function _unwrapSignal(v) {
    return (v !== null && v !== undefined && typeof v === "object" && typeof v.get === "function") ? v.get() : v;
  }
  function _renderComponent(C, props) {
    if (!C || !C.render) return "";
    var unwrappedProps = {};
    for (var _k in props) { unwrappedProps[_k] = typeof props[_k] === "function" ? props[_k] : _unwrapSignal(props[_k]); }
    var _s = C.setup ? Object.assign({}, C.setup(unwrappedProps), unwrappedProps) : unwrappedProps;
    var _a = Object.entries(unwrappedProps).filter(function(e) { return typeof e[1] !== "function"; }).map(function(e) { try { return 'data-pom-loop-item-' + e[0] + '="' + JSON.stringify(e[1]).replace(/"/g, '&quot;') + '"'; } catch(ex) { return ""; } }).filter(Boolean).join(" ");
    return '<span data-pom-component style="display:contents"' + (_a ? ' ' + _a : '') + '>' + C.render(_s) + '</span>';
  }
  if (typeof document !== "undefined" && typeof css !== "undefined" && css && !document.getElementById("pom-style-${componentId}")) {
    const styleEl = document.createElement("style");
    styleEl.id = "pom-style-${componentId}";
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
${deconstruct}  return \`${content}\`;
}
`;
}
