import type { KalloASTNode } from "@kallojs/types";
import {
  VOID_TAGS,
  NODE_TEXT,
  NODE_ELEMENT,
  TAG_EACH,
  TAG_WHEN,
  TAG_SHOW,
  TAG_ELSE,
  TAG_SLOT,
  TAG_IMAGE,
  TAG_SUSPENSE,
  TAG_BOUNDARY,
} from "@kallojs/shared";

const BOOLEAN_ATTRS = new Set([
  "checked", "disabled", "selected", "readonly", "required",
  "multiple", "autofocus", "open", "hidden",
]);

function extractIdentifiers(expression: string): string[] {
  const cleanExpr = expression
    .replace(/\?\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*/g, "")
    .replace(/\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*/g, "");
  const matches =
    cleanExpr.match(/(?<![\w$])[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
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

// A template is eligible for fine-grained, per-binding reactivity only when it
// contains no structural / dynamic-scope constructs. Those (loops, conditionals,
// slots, child components, <Head>, and dynamic :class) keep the coarse
// whole-component re-render path, which is already correct for them.
function isFineGrainedEligible(
  node: KalloASTNode,
  headNode?: KalloASTNode,
): boolean {
  if (headNode) return false;
  let eligible = true;
  function visit(n: KalloASTNode): void {
    if (!eligible || n.type !== NODE_ELEMENT) return;
    const t = n.tagName || "";
    if (
      t === TAG_EACH ||
      t === TAG_WHEN ||
      t === TAG_ELSE ||
      t === TAG_SLOT ||
      t === "Head"
    ) {
      eligible = false;
      return;
    }
    const isComponent =
      t.charAt(0) === t.charAt(0).toUpperCase() && t.charAt(0) !== "";
    if (isComponent) {
      eligible = false;
      return;
    }
    // Dynamic class merges static + computed parts; keep it coarse for v1.
    if (n.attributes && ":class" in n.attributes) {
      eligible = false;
      return;
    }
    for (const child of n.children || []) visit(child);
  }
  for (const child of node.children || []) visit(child);
  return eligible;
}

function collectIdentifiers(node: KalloASTNode, set: Set<string>): void {
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
    } else if (node.tagName === TAG_SHOW) {
      const cond = node.attributes?.["when"];
      if (cond) {
        extractIdentifiers(cond).forEach((id) => set.add(id));
      }
    }

    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes)) {
        if (key.startsWith("@") || key.startsWith(":") || key === "$model") {
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
  node: KalloASTNode,
  componentId: string,
  headNode?: KalloASTNode,
): string {
  const identifiers = new Set<string>();
  for (const child of node.children || []) {
    collectIdentifiers(child, identifiers);
  }
  if (headNode) {
    collectIdentifiers(headNode, identifiers);
  }

  const eligible = isFineGrainedEligible(node, headNode);

  // Fine-grained bindings are compiled to read-only thunks (CSP-safe, like
  // event handlers). Each returns the current value of one template expression;
  // the runtime wires a single effect per binding so only the affected DOM node
  // updates on change — no whole-component re-render.
  const bindings: string[] = [];
  function buildBinding(expr: string): number {
    const idents = extractIdentifiers(expr);
    const destructure = idents.length
      ? `const { ${idents.join(", ")} } = $state;`
      : "";
    bindings.push(`function($state) { ${destructure} return (${expr}); }`);
    return bindings.length - 1;
  }

  // Event handlers are compiled to real functions at build time (no runtime
  // eval), so they remain valid under a strict Content-Security-Policy.
  const eventHandlers: string[] = [];
  function buildEventHandler(expr: string, activeLoopVars: string[]): number {
    const idents = extractIdentifiers(expr);
    const loopVars = idents.filter((v) => activeLoopVars.includes(v));
    const stateVars = idents.filter((v) => !activeLoopVars.includes(v));
    const stateDestructure = stateVars.length
      ? `let { ${stateVars.join(", ")} } = $state;`
      : "";
    const loopDestructure = loopVars.length
      ? `const { ${loopVars.join(", ")} } = $scope;`
      : "";
    const snapshot = stateVars.length
      ? `const $init = [${stateVars.join(", ")}];`
      : "";
    const writeBack = stateVars
      .map((v, i) => `if (${v} !== $init[${i}]) $state.${v} = ${v};`)
      .join(" ");
    const body = `${stateDestructure} ${loopDestructure} ${snapshot} const $r = (${expr}); ${writeBack} return $r;`;
    eventHandlers.push(`function($state, $scope, $event) { ${body.trim()} }`);
    return eventHandlers.length - 1;
  }

  function compileNode(
    n: KalloASTNode,
    lastWhen: string,
    activeLoopVars: string[],
    keyExpr?: string,
  ): { html: string; nextWhen: string } {
    if (n.type === NODE_TEXT) {
      const html = n.content.replace(/\{\{([\s\S]*?)\}\}/g, (_, raw) => {
        const expr = raw.trim();
        if (eligible) {
          const idx = buildBinding(expr);
          return `<span data-kal-txt="${componentId}::${idx}">\${_escape(${expr})}</span>`;
        }
        return `\${_escape(${expr})}`;
      });
      return { html, nextWhen: lastWhen };
    }

    if (n.type === NODE_ELEMENT) {
      const tagName = n.tagName!;

      if (tagName === TAG_IMAGE) {
        const propsPairs: string[] = [];
        if (n.attributes) {
          for (const [key, value] of Object.entries(n.attributes)) {
            if (key.startsWith(":")) {
              propsPairs.push(`${JSON.stringify(key.slice(1))}: ${value}`);
            } else if (!key.startsWith("@")) {
              propsPairs.push(`${JSON.stringify(key)}: ${JSON.stringify(value)}`);
            }
          }
        }
        return {
          html: `\${_image({ ${propsPairs.join(", ")} })}`,
          nextWhen: "",
        };
      }

      if (tagName === TAG_SUSPENSE) {
        const { matched, rest } = findTemplateSlot(n.children || [], "fallback");
        const contentHTML = compileChildren(rest, activeLoopVars);
        const fallbackHTML = matched
          ? compileChildren(matched.children || [], activeLoopVars)
          : "";
        return {
          html: `\${_suspense(function(){ return \`${contentHTML}\`; }, function(){ return \`${fallbackHTML}\`; })}`,
          nextWhen: "",
        };
      }

      if (tagName === TAG_BOUNDARY) {
        const { matched, rest } = findTemplateSlot(n.children || [], "error");
        const contentHTML = compileChildren(rest, activeLoopVars);
        const errVar = matched?.attributes?.["error"] || "error";
        const errorHTML = matched
          ? compileChildren(matched.children || [], activeLoopVars)
          : "";
        return {
          html: `\${_boundary(function(){ return \`${contentHTML}\`; }, function(${errVar}){ return \`${errorHTML}\`; })}`,
          nextWhen: "",
        };
      }

      const isComponent =
        tagName &&
        tagName.charAt(0) === tagName.charAt(0).toUpperCase() &&
        tagName !== TAG_EACH &&
        tagName !== TAG_WHEN &&
        tagName !== TAG_SHOW &&
        tagName !== TAG_ELSE &&
        tagName !== TAG_SLOT &&
        tagName !== TAG_IMAGE &&
        tagName !== TAG_SUSPENSE &&
        tagName !== TAG_BOUNDARY &&
        tagName !== "Head";
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
        const propsObj =
          propsPairs.length > 0 ? `{ ${propsPairs.join(", ")} }` : `{}`;
        return {
          html: `\${typeof ${tagName} !== "undefined" && ${tagName}.render ? _renderComponent(${tagName}, ${propsObj}) : ""}`,
          nextWhen: "",
        };
      }

      if (tagName === "Head") {
        const childHTML = compileChildren(n.children || [], activeLoopVars);
        const htmlString = JSON.stringify(childHTML);
        return {
          html: `\${(typeof globalThis !== "undefined" && globalThis.__kallo_ssr_context__) ? (globalThis.__kallo_ssr_context__.headTags.push(${htmlString}), "") : _injectHead(${htmlString})}`,
          nextWhen: "",
        };
      }

      if (tagName === TAG_EACH) {
        const ofAttr = n.attributes?.["of"];
        const asAttr = n.attributes?.["as"] || "item";
        const keyAttr = n.attributes?.["key"];
        const childHTML = compileChildren(
          n.children || [],
          [...activeLoopVars, asAttr],
          keyAttr,
        );
        return {
          html: `\${(${ofAttr} || []).map((${asAttr}) => \`${childHTML}\`).join("")}`,
          nextWhen: "",
        };
      }

      if (tagName === TAG_WHEN) {
        const cond = n.attributes?.["condition"] || "true";
        const childHTML = compileChildren(n.children || [], activeLoopVars);
        return {
          html: `\${${cond} ? \`${childHTML}\` : ""}`,
          nextWhen: cond,
        };
      }

      if (tagName === TAG_SHOW) {
        const cond = n.attributes?.["when"] || "true";
        const childHTML = compileChildren(n.children || [], activeLoopVars);
        return {
          html: `\${${cond} ? \`${childHTML}\` : ""}`,
          nextWhen: cond,
        };
      }

      if (tagName === TAG_ELSE) {
        const cond = lastWhen ? `!(${lastWhen})` : "true";
        const childHTML = compileChildren(n.children || [], activeLoopVars);
        return {
          html: `\${${cond} ? \`${childHTML}\` : ""}`,
          nextWhen: "",
        };
      }

      if (tagName === TAG_SLOT) {
        const name = n.attributes?.["name"] || "default";
        return {
          html: `\${slots.${name} ? slots.${name}() : ""}`,
          nextWhen: "",
        };
      }

      // Normal HTML elements
      const attributes: string[] = [];
      attributes.push(`data-kal-${componentId}`);
      if (keyExpr) {
        attributes.push(`data-kal-key="\${_escapeAttr(${keyExpr})}"`);
      }

      let className = "";
      let dynamicClass = "";

      if (n.attributes) {
        for (const [key, value] of Object.entries(n.attributes)) {
          if (key === "class") {
            className = value;
          } else if (key === ":class") {
            dynamicClass = value;
          } else if (key === "$model") {
            // Input-type-aware two-way binding: e.g. $model="email"
            const lowerTag = tagName.toLowerCase();
            const typeAttr = n.attributes["type"];
            attributes.push(`data-kal-bind="${value}"`);
            if (lowerTag === "input" && typeAttr === "checkbox") {
              const idx = buildEventHandler(
                `${value} = $event.target.checked`,
                activeLoopVars,
              );
              attributes.push(`\${_unwrapSignal(${value}) ? "checked" : ""}`);
              attributes.push(
                `data-kal-event-change="${componentId}::${idx}"`,
              );
            } else if (lowerTag === "input" && typeAttr === "radio") {
              const ownValue = n.attributes["value"] ?? "";
              const idx = buildEventHandler(
                `${value} = $event.target.value`,
                activeLoopVars,
              );
              attributes.push(
                `\${_unwrapSignal(${value}) === ${JSON.stringify(ownValue)} ? "checked" : ""}`,
              );
              attributes.push(
                `data-kal-event-change="${componentId}::${idx}"`,
              );
            } else {
              const eventName = lowerTag === "select" ? "change" : "input";
              const idx = buildEventHandler(
                `${value} = $event.target.value`,
                activeLoopVars,
              );
              attributes.push(`value="\${_escapeAttr(${value})}"`);
              attributes.push(
                `data-kal-event-${eventName}="${componentId}::${idx}"`,
              );
            }
          } else if (key === ":bind") {
            // Two-way binding: e.g. :bind="search"
            const bindIndex = buildEventHandler(
              `${value} = $event.target.value`,
              activeLoopVars,
            );
            attributes.push(`data-kal-bind="${value}"`);
            attributes.push(`value="\${_escapeAttr(${value})}"`);
            attributes.push(
              `data-kal-event-input="${componentId}::${bindIndex}"`,
            );
            if (eligible) {
              const idx = buildBinding(value);
              attributes.push(`data-kal-value="${componentId}::${idx}"`);
            }
          } else if (key.startsWith("@")) {
            const eventName = key.slice(1);
            const handlerIndex = buildEventHandler(value, activeLoopVars);
            attributes.push(
              `data-kal-event-${eventName}="${componentId}::${handlerIndex}"`,
            );

            // Serialize any active loop variables used in this event handler
            for (const loopVar of activeLoopVars) {
              const rx = new RegExp(`\\b${loopVar}\\b`);
              if (rx.test(value)) {
                attributes.push(
                  `data-kal-loop-item-${loopVar}="\${_escapeAttr(JSON.stringify(${loopVar}))}"`,
                );
              }
            }
          } else if (key.startsWith(":")) {
            const propName = key.slice(1);
            if (eligible) {
              const idx = buildBinding(value);
              if (BOOLEAN_ATTRS.has(propName)) {
                attributes.push(
                  `data-kal-battr-${propName}="${componentId}::${idx}"`,
                );
                attributes.push(
                  `\${_unwrapSignal(${value}) ? "${propName}" : ""}`,
                );
              } else {
                attributes.push(
                  `data-kal-attr-${propName}="${componentId}::${idx}"`,
                );
                attributes.push(`${propName}="\${_escapeAttr(${value})}"`);
              }
            } else {
              attributes.push(`data-kal-bind-${propName}="${value}"`);
              if (BOOLEAN_ATTRS.has(propName)) {
                attributes.push(
                  `\${_unwrapSignal(${value}) ? "${propName}" : ""}`,
                );
              } else {
                attributes.push(`${propName}="\${_escapeAttr(${value})}"`);
              }
            }
          } else {
            // Static attribute (with interpolation support)
            const interpolatedValue = value.replace(
              /\{\{([\s\S]*?)\}\}/g,
              (_, expr) => `\${_escapeAttr(${expr.trim()})}`,
            );
            attributes.push(`${key}="${interpolatedValue}"`);
          }
        }
      }

      // Merge class and :class
      if (className || dynamicClass) {
        if (className && dynamicClass) {
          attributes.push(`class="${className} \${_escapeAttr(_formatClass(${dynamicClass}))}"`);
        } else if (className) {
          attributes.push(`class="${className}"`);
        } else if (dynamicClass) {
          attributes.push(`class="\${_escapeAttr(_formatClass(${dynamicClass}))}"`);
        }
      }

      const attrsStr = attributes.length > 0 ? " " + attributes.join(" ") : "";
      const isVoid = VOID_TAGS.includes(tagName.toLowerCase());

      if (isVoid) {
        return {
          html: `<${tagName}${attrsStr} />`,
          nextWhen: "",
        };
      }

      const childHTML = compileChildren(n.children || [], activeLoopVars);
      return {
        html: `<${tagName}${attrsStr}>${childHTML}</${tagName}>`,
        nextWhen: "",
      };
    }

    return { html: "", nextWhen: lastWhen };
  }

  function findTemplateSlot(
    children: KalloASTNode[],
    attr: string,
  ): { matched?: KalloASTNode; rest: KalloASTNode[] } {
    let matched: KalloASTNode | undefined;
    const rest: KalloASTNode[] = [];
    for (const c of children) {
      if (
        c.type === NODE_ELEMENT &&
        c.tagName === "template" &&
        c.attributes &&
        attr in c.attributes
      ) {
        matched = c;
      } else {
        rest.push(c);
      }
    }
    return { matched, rest };
  }

  function compileChildren(
    children: KalloASTNode[],
    activeLoopVars: string[],
    keyExpr?: string,
  ): string {
    let html = "";
    let currentWhen = "";
    for (const child of children) {
      const res = compileNode(child, currentWhen, activeLoopVars, keyExpr);
      html += res.html;
      currentWhen = res.nextWhen;
    }
    return html;
  }

  const loopVars = new Set<string>();
  function findLoopVars(n: KalloASTNode) {
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
      ? `  const { ${Array.from(identifiers).join(", ")} } = state.__raw__ || state;\n`
      : "";

  const content = compileChildren(node.children || [], []);
  let headInject = "";
  if (headNode) {
    const headChildrenHTML = compileChildren(headNode.children || [], []);
    const htmlString = JSON.stringify(headChildrenHTML);
    headInject = `\${(typeof globalThis !== "undefined" && globalThis.__kallo_ssr_context__) ? (globalThis.__kallo_ssr_context__.headTags.push(${htmlString}), "") : _injectHead(${htmlString})}`;
  }

  return `export function render(state = {}, slots = {}) {
  function _unwrapSignal(v) {
    return (v !== null && v !== undefined && typeof v === "object" && typeof v.get === "function") ? v.get() : v;
  }
  function _escape(v) {
    v = _unwrapSignal(v);
    if (v === null || v === undefined) return "";
    return String(v).replace(/[&<>]/g, function(c) { return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"; });
  }
  function _escapeAttr(v) {
    v = _unwrapSignal(v);
    if (v === null || v === undefined) return "";
    return String(v).replace(/[&<>"']/g, function(c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; });
  }
  function _formatClass(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      return value.map(_formatClass).filter(Boolean).join(" ");
    }
    if (typeof value === "object") {
      return Object.keys(value).filter(function(k) { return _unwrapSignal(value[k]); }).join(" ");
    }
    return String(value);
  }
  function _renderComponent(C, props) {
    if (!C || !C.render) return "";
    if (typeof globalThis !== "undefined" && globalThis.__kallo_ssr_context__ && C.css && C.componentId) {
      if (!globalThis.__kallo_ssr_context__.css) {
        globalThis.__kallo_ssr_context__.css = new Set();
      }
      globalThis.__kallo_ssr_context__.css.add(JSON.stringify({ id: C.componentId, css: C.css }));
    }
    var unwrappedProps = {};
    for (var _k in props) { unwrappedProps[_k] = typeof props[_k] === "function" ? props[_k] : _unwrapSignal(props[_k]); }
    var _s = C.setup ? Object.assign({}, C.setup(props), props) : props;
    var _a = Object.entries(unwrappedProps).filter(function(e) { return typeof e[1] !== "function"; }).map(function(e) { try { return 'data-kal-loop-item-' + e[0] + '="' + _escapeAttr(JSON.stringify(e[1])) + '"'; } catch(ex) { return ""; } }).filter(Boolean).join(" ");
    return '<span data-kal-component style="display:contents"' + (_a ? ' ' + _a : '') + '>' + C.render(_s) + '</span>';
  }
  function _image(props) {
    props = props || {};
    var src = _unwrapSignal(props.src) || "";
    var widths = _unwrapSignal(props.widths);
    if (!Array.isArray(widths)) widths = [320, 640, 768, 1024, 1280, 1536];
    var sizes = _unwrapSignal(props.sizes) || "100vw";
    var alt = _unwrapSignal(props.alt) || "";
    var width = _unwrapSignal(props.width);
    var height = _unwrapSignal(props.height);
    var priority = !!_unwrapSignal(props.priority);
    var cls = _unwrapSignal(props.class);
    function _withWidth(u, w) {
      return u + (u.indexOf("?") === -1 ? "?" : "&") + "w=" + w;
    }
    var srcset = src
      ? widths.map(function(w) { return _escapeAttr(_withWidth(src, w)) + " " + w + "w"; }).join(", ")
      : "";
    var attrs = ['src="' + _escapeAttr(src) + '"', 'alt="' + _escapeAttr(alt) + '"'];
    if (srcset) {
      attrs.push('srcset="' + srcset + '"');
      attrs.push('sizes="' + _escapeAttr(sizes) + '"');
    }
    if (width !== undefined && width !== null) attrs.push('width="' + _escapeAttr(width) + '"');
    if (height !== undefined && height !== null) attrs.push('height="' + _escapeAttr(height) + '"');
    attrs.push('loading="' + (priority ? "eager" : "lazy") + '"');
    attrs.push('decoding="async"');
    if (priority) attrs.push('fetchpriority="high"');
    if (cls) attrs.push('class="' + _escapeAttr(cls) + '"');
    return "<img " + attrs.join(" ") + " />";
  }
  function _suspense(content, fallback) {
    try {
      return content();
    } catch (e) {
      return fallback ? fallback() : "";
    }
  }
  function _boundary(content, onError) {
    try {
      return content();
    } catch (e) {
      return onError ? onError(e) : "";
    }
  }
  function _injectHead(html) {
    if (typeof document === "undefined") return "";
    var temp = document.createElement("div");
    temp.innerHTML = html;
    Array.from(temp.childNodes).forEach(function(node) {
      if (node.nodeType === 1) {
        var el = node;
        var selector = "";
        if (el.tagName === "TITLE") selector = "title";
        else if (el.tagName === "META") {
          var name = el.getAttribute("name");
          var prop = el.getAttribute("property");
          if (name) selector = 'meta[name="' + name + '"]';
          else if (prop) selector = 'meta[property="' + prop + '"]';
        } else if (el.tagName === "LINK") {
          var rel = el.getAttribute("rel");
          var href = el.getAttribute("href");
          if (rel && href) selector = 'link[rel="' + rel + '"][href="' + href + '"]';
        } else if (el.tagName === "SCRIPT") {
          var src = el.getAttribute("src");
          if (src) selector = 'script[src="' + src + '"]';
        }
        if (selector) {
          var existing = document.head.querySelector(selector);
          if (existing) {
            if (el.tagName === "TITLE") existing.textContent = el.textContent;
            return;
          }
        }
        document.head.appendChild(el.cloneNode(true));
      }
    });
    return "";
  }
  if (typeof document !== "undefined" && typeof css !== "undefined" && css && !document.getElementById("kallo-style-${componentId}")) {
    const styleEl = document.createElement("style");
    styleEl.id = "kallo-style-${componentId}";
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
${deconstruct}  return \`${content}${headInject}\`;
}
export const handlers = [${eventHandlers.join(", ")}];
export const bindings = [${bindings.join(", ")}];
export const fineGrained = ${eligible && bindings.length > 0};
if (typeof globalThis !== "undefined") {
  (globalThis.__kal_handlers__ || (globalThis.__kal_handlers__ = {}))[${JSON.stringify(componentId)}] = handlers;
  (globalThis.__kal_bindings__ || (globalThis.__kal_bindings__ = {}))[${JSON.stringify(componentId)}] = bindings;
}
`;
}
