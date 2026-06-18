import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import hljs from "highlight.js";

// Stable slug used for both heading ids and the on-page table-of-contents links.
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    const escaped = md.utils.escapeHtml(str);
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(str, { language: lang, ignoreIllegal: true }).value;
        return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`;
      } catch {
        /* fall through */
      }
    }
    return `<pre class="hljs"><code>${escaped}</code></pre>`;
  },
}).use(anchor, {
  slugify,
  level: [2, 3],
  permalink: anchor.permalink.linkInsideHeader({
    symbol: "#",
    placement: "before",
    class: "heading-anchor",
  }),
});

export interface Heading {
  level: number;
  text: string;
  id: string;
}

// Render markdown to HTML and extract h2/h3 headings for the on-page TOC.
export function renderMarkdown(content: string): { html: string; headings: Heading[] } {
  const env = {};
  const tokens = md.parse(content, env);
  const headings: Heading[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t && t.type === "heading_open" && (t.tag === "h2" || t.tag === "h3")) {
      const inline = tokens[i + 1];
      const text = inline ? inline.content : "";
      headings.push({ level: t.tag === "h2" ? 2 : 3, text, id: slugify(text) });
    }
  }

  return { html: md.renderer.render(tokens, md.options, env), headings };
}
