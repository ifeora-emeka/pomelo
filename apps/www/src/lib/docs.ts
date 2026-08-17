import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { renderMarkdown, type Heading } from "./markdown.js";

// Source of truth is apps/docs. In the monorepo it sits next to apps/www; a
// deploy can override with KALLO_DOCS_DIR or bundle a ./content copy.
function resolveDocsDir(): string {
  if (process.env.KALLO_DOCS_DIR) return process.env.KALLO_DOCS_DIR;
  const sibling = path.resolve(process.cwd(), "../docs");
  if (fs.existsSync(sibling)) return sibling;
  return path.resolve(process.cwd(), "content");
}

const DOCS_DIR = resolveDocsDir();

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface NavGroup {
  category: string;
  order: number;
  items: DocMeta[];
}

export interface Doc extends DocMeta {
  html: string;
  headings: Heading[];
}

const CATEGORY_ORDER: Record<string, number> = {
  "Getting Started": 1,
  "Core Concepts": 2,
  "Server": 3,
  "Styling & Assets": 4,
  "Tooling": 5,
  Reference: 6,
};

function listDocFiles(): string[] {
  if (!fs.existsSync(DOCS_DIR)) return [];
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
}

function readMeta(file: string): DocMeta {
  const slug = file.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
  let data: Record<string, unknown> = {};
  try {
    data = matter(raw).data;
  } catch {
    // A malformed frontmatter block shouldn't take down the whole nav.
    data = {};
  }
  return {
    slug,
    title: (data.title as string) || slug,
    description: (data.description as string) || "",
    category: (data.category as string) || "Reference",
    order: typeof data.order === "number" ? data.order : 99,
  };
}

// All docs grouped by category, sorted for the sidebar.
export function getNav(): NavGroup[] {
  const metas = listDocFiles().map(readMeta);
  const groups = new Map<string, DocMeta[]>();
  for (const m of metas) {
    if (!groups.has(m.category)) groups.set(m.category, []);
    groups.get(m.category)!.push(m);
  }
  const result: NavGroup[] = [];
  for (const [category, items] of groups) {
    items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    result.push({ category, order: CATEGORY_ORDER[category] ?? 50, items });
  }
  result.sort((a, b) => a.order - b.order || a.category.localeCompare(b.category));
  return result;
}

// Flattened, ordered list — used for prev/next links.
export function getOrderedDocs(): DocMeta[] {
  return getNav().flatMap((g) => g.items);
}

export function getDoc(slug: string): Doc | null {
  const safe = slug.replace(/[^a-z0-9-]/gi, "");
  const file = path.join(DOCS_DIR, `${safe}.md`);
  if (!file.startsWith(DOCS_DIR) || !fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  let data: Record<string, unknown> = {};
  let content = raw;
  try {
    const parsed = matter(raw);
    data = parsed.data;
    content = parsed.content;
  } catch {
    content = raw;
  }
  const { html, headings } = renderMarkdown(content);
  return {
    slug: safe,
    title: (data.title as string) || safe,
    description: (data.description as string) || "",
    category: (data.category as string) || "Reference",
    order: typeof data.order === "number" ? data.order : 99,
    html,
    headings,
  };
}

export function getFirstDocSlug(): string {
  const docs = getOrderedDocs();
  return docs[0]?.slug || "introduction";
}
