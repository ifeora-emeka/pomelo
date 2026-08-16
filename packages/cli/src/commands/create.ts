import { KalloLogger } from "@kallojs/shared";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";

// npm requires `npm run <script>` for custom scripts; pnpm/yarn/bun alias `run`.
function runCmd(pm: string, script: string): string {
  return pm === "npm" ? `npm run ${script}` : `${pm} ${script}`;
}

// Locate the docs bundled into the published CLI (dist/kallo-docs), with a
// monorepo fallback for running against source.
function resolveBundledDocsDir(): string | null {
  const bundled = path.join(__dirname, "..", "kallo-docs");
  if (fs.existsSync(bundled)) return bundled;
  const repoDocs = path.resolve(process.cwd(), "apps/docs");
  if (fs.existsSync(repoDocs)) return repoDocs;
  return null;
}

// Files added to every scaffolded app regardless of template: brand icons, an
// AGENT.md guide, and the bundled docs (so developers and AI agents have local
// documentation alongside the live docs at kallo.idegin.com).
function addSharedScaffoldFiles(
  files: Record<string, string | Buffer>,
  opts: BuildOpts,
): void {
  const icon = Buffer.from(KALLO_ICON_B64, "base64");
  files["public/kallo-128.png"] = icon;
  files["public/favicon.ico"] = icon;
  files["AGENT.md"] = agentMd(opts);

  const docsDir = resolveBundledDocsDir();
  if (docsDir) {
    for (const entry of fs.readdirSync(docsDir)) {
      if (!entry.endsWith(".md")) continue;
      files[".agents/kallo-docs/" + entry] = fs.readFileSync(
        path.join(docsDir, entry),
        "utf-8",
      );
    }
  }
}

function agentMd(opts: BuildOpts): string {
  return `# ${opts.storeName}

This project was scaffolded with **Kallo** — a TypeScript-first, HTML-first
fullstack framework built on Express. This file orients human contributors and
AI coding agents.

## Where the docs live

- **Online:** https://kallo.idegin.com
- **Local copy:** [\`.agents/kallo-docs/\`](./.agents/kallo-docs) — the full Kallo
  documentation in Markdown, bundled with this project. Start with
  [\`introduction.md\`](./.agents/kallo-docs/introduction.md).

When you need to understand a Kallo concept (routing, \`<Server>\`/\`<Client>\`/\`<View>\`
blocks, \`$page\`, \`$meta\`, \`$store\`, \`$local\`, templating, styling), read the
relevant file in \`.agents/kallo-docs/\` before guessing.

## Project shape

- \`src/view/\` — file-based routes. \`page.kal\` = a route, \`layout.kal\` = a shell,
  \`[param]\` = dynamic, \`[...param]\` = catch-all.
- \`src/components/\` — reusable \`.kal\` components.
- \`src/stores/\` — shared reactive \`$store\` state.
- \`src/api/\` — \`$router\` HTTP endpoints.
- \`src/styles/global.css\` — Tailwind v4 entry + theme tokens.
- \`public/\` — static assets served at \`/\`.

## Commands

- \`${runCmd(opts.packageManager, "dev")}\` — dev server (HMR + Tailwind watch)
- \`${runCmd(opts.packageManager, "build")}\` — production build
- \`${runCmd(opts.packageManager, "start")}\` — run the production server

## Conventions

- Single-file components use the \`.kal\` extension.
- Escaped interpolation is \`{{ expr }}\`; raw HTML is \`{{{ expr }}}\` (use only with
  trusted HTML).
- Server-only code goes in \`<Server>\` blocks; it is stripped from the client bundle.
`;
}

// ---------------------------------------------------------------------------
// Prompt helper — falls back to the default in non-interactive environments.
// ---------------------------------------------------------------------------
async function askQuestion(query: string, defaultValue: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return defaultValue;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(query);
    return answer.trim() || defaultValue;
  } catch {
    return defaultValue;
  } finally {
    rl.close();
  }
}

// Yes/no prompt. Returns the default in non-interactive environments.
async function askYesNo(query: string, defaultYes: boolean): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;
  const answer = (
    await askQuestion(`${query} ${defaultYes ? "(Y/n)" : "(y/N)"}: `, "")
  )
    .trim()
    .toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

// Files we tolerate in an otherwise-"empty" target so `kallo create` works in a
// freshly-cloned repo (create-next-app does the same). Everything here is either
// VCS metadata or something the scaffold legitimately overwrites.
const SCAFFOLDABLE_EXISTING = new Set([
  ".git",
  ".gitignore",
  ".gitattributes",
  ".hg",
  ".svn",
  "readme",
  "readme.md",
  "license",
  "license.md",
  "license.txt",
  ".ds_store",
  "thumbs.db",
]);

// A target is scaffoldable if it doesn't exist, is empty, or contains only the
// ignorable files above. Non-empty targets require --force.
function dirIsScaffoldable(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  return fs
    .readdirSync(dir)
    .every((entry) => SCAFFOLDABLE_EXISTING.has(entry.toLowerCase()));
}

// Coerce an arbitrary string into a valid, unscoped npm package name.
function sanitizePackageName(input: string): string {
  const cleaned = (input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-._~]+/g, "-")
    .replace(/^[-._]+/, "")
    .replace(/[-._]+$/, "")
    .replace(/-+/g, "-");
  return cleaned || "kallo-app";
}

// Version to pin the scaffolded @kallojs/* dependencies to. In the monorepo
// (KALLO_LOCAL_DEPS) we link the workspace; otherwise we pin to *this* CLI's
// published version so installs are reproducible and fast instead of resolving
// "latest" for every package. Falls back to "latest" if the version is unknown.
function frameworkDepVersion(): string {
  if (process.env.KALLO_LOCAL_DEPS === "true") return "workspace:*";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8"),
    );
    if (pkg?.version) return `^${pkg.version}`;
  } catch {
    // fall through
  }
  return "latest";
}

// Detect the package manager the user invoked us with (npm/pnpm/yarn/bun),
// matching what create-next-app does — no prompt needed. `npm_config_user_agent`
// looks like "pnpm/9.0.0 npm/? node/v22 ...".
function detectPackageManager(args: string[]): string {
  const flag = (flagValue(args, "--pm") || "").toLowerCase();
  if (["pnpm", "npm", "yarn", "bun"].includes(flag)) return flag;
  const ua = process.env.npm_config_user_agent || "";
  const name = ua.split("/")[0];
  if (name && ["pnpm", "yarn", "bun"].includes(name)) return name;
  return "npm";
}

// Run `<pm> install` in the new project directory, streaming output.
function installDependencies(pm: string, cwd: string): boolean {
  const result = spawnSync(pm, ["install"], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function titleCase(input: string): string {
  return input
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ") || "Kallo Store";
}

// ---------------------------------------------------------------------------
// Accent palettes — swap the primary color ramp used across the UI.
// ---------------------------------------------------------------------------
const ACCENTS: Record<string, string[]> = {
  violet: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"],
  blue: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a", "#172554"],
  emerald: ["#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#022c22"],
  rose: ["#fff1f2", "#ffe4e6", "#fecdd3", "#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337", "#4c0519"],
};

export async function executeCreateCommand(args: string[]): Promise<boolean> {
  const skipPrompts = args.includes("--yes") || args.includes("-y") || !process.stdin.isTTY;

  // 1. Project name — the one thing we confirm with the user (create-next-app
  //    style). Everything else has a sensible default or is derived/flagged.
  let appName = args.find((a) => !a.startsWith("-"));
  if (!appName && !skipPrompts) {
    appName = await askQuestion("◆  Project name: (my-kallo-app) ", "my-kallo-app");
  }
  appName = (appName || "my-kallo-app").trim();

  // `.` (or `./`) scaffolds into the current directory — the common flow when
  // you've already created and cloned a repo, then want a Kallo app inside it.
  const targetIsCwd = appName === "." || appName === "./";
  const targetDir = targetIsCwd
    ? process.cwd()
    : path.resolve(process.cwd(), appName);

  const force = args.includes("--force") || args.includes("-f");
  if (!force && !dirIsScaffoldable(targetDir)) {
    KalloLogger.warn(
      `Directory ${appName} already exists and is not empty. ` +
        `Re-run with --force to scaffold into it anyway (existing files may be overwritten).`,
    );
    return false;
  }

  // Package name: --pkg-name wins, else derive from the target folder. Always
  // sanitized to a valid npm name (the folder could be "My App", "." → cwd, …).
  const pkgName = sanitizePackageName(
    flagValue(args, "--pkg-name") || path.basename(targetDir),
  );

  // Derived / flag-only options — no prompts, to keep create simple & fast.
  const packageManager = detectPackageManager(args);
  const storeName = flagValue(args, "--name") || titleCase(pkgName);
  let accent = (flagValue(args, "--accent") || "violet").toLowerCase();
  if (!ACCENTS[accent]) accent = "violet";
  const template = (flagValue(args, "--template") || "ecommerce").toLowerCase();

  // 2. Install dependencies? The only other thing we ask.
  let install: boolean;
  if (args.includes("--install")) install = true;
  else if (args.includes("--no-install")) install = false;
  else if (skipPrompts) install = false;
  else install = await askYesNo(`◆  Install dependencies with ${packageManager}?`, true);

  KalloLogger.info(`Scaffolding Kallo app '${storeName}' in ${targetDir}...`);

  try {
    const opts: BuildOpts = { pkgName, storeName, accent, packageManager };
    const files = template === "empty" ? buildEmptyFiles(opts) : buildStoreFiles(opts);
    addSharedScaffoldFiles(files, opts);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(targetDir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }

    KalloLogger.info(`Successfully created project ${appName}!`);

    let installed = false;
    if (install) {
      console.log(`\nInstalling dependencies with ${packageManager}...\n`);
      installed = installDependencies(packageManager, targetDir);
      if (!installed) {
        KalloLogger.warn(
          `Dependency installation failed — run \`${packageManager} install\` manually.`,
        );
      }
    }

    console.log(`\n🎉 Created your Kallo app: ${storeName}\n`);
    console.log("Next steps:");
    if (!targetIsCwd) console.log(`  cd ${appName}`);
    if (!installed) console.log(`  ${packageManager} install`);
    console.log(`  ${runCmd(packageManager, "dev")}`);
    console.log("\nThen open http://localhost:3000 — happy building! 🍊\n");
    return true;
  } catch (err) {
    KalloLogger.error("Failed to scaffold project: " + String(err));
    return false;
  }
}

// ---------------------------------------------------------------------------
// kallo.config.ts — shared by every template. Defaults to SSR ("server"); the
// commented block shows how to switch to a static export for GitHub Pages.
// ---------------------------------------------------------------------------
function kalloConfigTs(storeName: string): string {
  return `import { defineConfig } from "@kallojs/server";

export default defineConfig({
  name: ${JSON.stringify(storeName)},
  version: "0.1.0",
  port: 3000,

  // Rendering target:
  //   "server" (default) — SSR at request time (kallo build + kallo start).
  //   "static"           — pre-render every route to out/ (kallo export) for
  //                        GitHub Pages or any static host / CDN.
  output: "server",

  // --- Static export options (used when output: "static") ------------------
  // outDir: "out",
  // For GitHub *project* pages served at user.github.io/<repo>:
  // basePath: "/<repo>",
  // trailingSlash: false, // "/about" -> out/about.html (GH Pages resolves it)
});
`;
}

// ---------------------------------------------------------------------------
// File map for the ecommerce starter.
// ---------------------------------------------------------------------------
interface BuildOpts {
  pkgName: string;
  storeName: string;
  accent: string;
  packageManager: string;
}

function buildStoreFiles(opts: BuildOpts): Record<string, string | Buffer> {
  const { pkgName, storeName, accent, packageManager } = opts;
  const kalloDep = frameworkDepVersion();
  const today = new Date().toISOString().split("T")[0];

  const files: Record<string, string | Buffer> = {};

  // ---- package.json -------------------------------------------------------
  files["package.json"] = JSON.stringify(
    {
      name: pkgName,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "kallo dev",
        build: "kallo build",
        start: "kallo start",
        export: "kallo export",
      },
      dependencies: {
        "@kallojs/runtime": kalloDep,
        "@kallojs/server": kalloDep,
      },
      devDependencies: {
        "@kallojs/cli": kalloDep,
        tailwindcss: "^4.0.0",
        "@tailwindcss/cli": "^4.0.0",
      },
    },
    null,
    2,
  );

  // ---- global.css (Tailwind v4 + class-based dark mode) -------------------
  files["src/styles/global.css"] = buildGlobalCss(accent);

  // ---- kallo.config.ts ----------------------------------------------------
  files["kallo.config.ts"] = kalloConfigTs(storeName);

  // ---- data ---------------------------------------------------------------
  files["src/data/products.ts"] = PRODUCTS_TS;

  // ---- stores -------------------------------------------------------------
  files["src/stores/cart.ts"] = CART_TS;
  files["src/stores/catalog.ts"] = CATALOG_TS;
  files["src/stores/theme.ts"] = THEME_TS;

  // ---- components ---------------------------------------------------------
  files["src/components/Navbar.kal"] = navbarKal(storeName);
  files["src/components/CartDrawer.kal"] = CART_DRAWER_KAL;
  files["src/components/ProductCard.kal"] = PRODUCT_CARD_KAL;
  files["src/components/StarRating.kal"] = STAR_RATING_KAL;
  files["src/components/Badge.kal"] = BADGE_KAL;
  files["src/components/Footer.kal"] = footerKal(storeName);

  // ---- views --------------------------------------------------------------
  files["src/view/layout.kal"] = layoutKal(storeName);
  files["src/view/page.kal"] = homeKal(storeName);
  files["src/view/products/[id]/page.kal"] = detailsKal(storeName);
  files["src/view/not-found.kal"] = NOT_FOUND_KAL;
  files["src/view/error.kal"] = ERROR_KAL;

  // ---- env ----------------------------------------------------------------
  files[".env"] = `# Public env vars are exposed to the client (KALLO_PUBLIC_*)\nKALLO_PUBLIC_STORE_NAME=${storeName}\n`;
  files[".env.local"] = `# Local overrides — DO NOT commit\nKALLO_PUBLIC_STORE_NAME=${storeName} (Local)\n`;

  // ---- public -------------------------------------------------------------
  files["public/robots.txt"] = `User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n`;
  files["public/sitemap.xml"] =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>\n</urlset>\n`;
  files["public/favicon.ico"] = Buffer.from(KALLO_ICON_B64, "base64");

  // ---- meta ---------------------------------------------------------------
  files[".gitignore"] = `node_modules\n.kallo\n.kallo-cache\ndist\nout\n.env.local\n.DS_Store\n`;
  files["README.md"] = readmeMd(pkgName, storeName, packageManager);

  return files;
}

// ---------------------------------------------------------------------------
// File map for the minimal "empty" starter — a small reactive tasks app that
// still demonstrates the core of Kallo (a store, an API route, a component
// rendered in a loop, and a server-rendered page) without the ecommerce demo.
// ---------------------------------------------------------------------------
function buildEmptyFiles(opts: BuildOpts): Record<string, string | Buffer> {
  const { pkgName, storeName, accent, packageManager } = opts;
  const kalloDep = frameworkDepVersion();

  const files: Record<string, string | Buffer> = {};

  // ---- package.json -------------------------------------------------------
  files["package.json"] = JSON.stringify(
    {
      name: pkgName,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "kallo dev",
        build: "kallo build",
        start: "kallo start",
        export: "kallo export",
      },
      dependencies: {
        "@kallojs/runtime": kalloDep,
        "@kallojs/server": kalloDep,
      },
      devDependencies: {
        "@kallojs/cli": kalloDep,
        tailwindcss: "^4.0.0",
        "@tailwindcss/cli": "^4.0.0",
      },
    },
    null,
    2,
  );

  // ---- global.css (shared with the ecommerce template) --------------------
  files["src/styles/global.css"] = buildGlobalCss(accent);

  // ---- kallo.config.ts ----------------------------------------------------
  files["kallo.config.ts"] = kalloConfigTs(storeName);

  // ---- stores -------------------------------------------------------------
  files["src/stores/tasks.ts"] = TASKS_TS;

  // ---- api ----------------------------------------------------------------
  files["src/api/index.ts"] = API_INDEX_TS;

  // ---- components ---------------------------------------------------------
  files["src/components/EachTask.kal"] = EACH_TASK_KAL;

  // ---- views --------------------------------------------------------------
  files["src/view/layout.kal"] = emptyLayoutKal(storeName);
  files["src/view/page.kal"] = emptyPageKal(storeName);
  files["src/view/not-found.kal"] = NOT_FOUND_KAL;
  files["src/view/error.kal"] = ERROR_KAL;

  // ---- env ----------------------------------------------------------------
  files[".env"] = `# Public env vars are exposed to the client (KALLO_PUBLIC_*)\nKALLO_PUBLIC_APP_NAME=${storeName}\n`;
  files[".env.local"] = `# Local overrides — DO NOT commit\nKALLO_PUBLIC_APP_NAME=${storeName} (Local)\n`;

  // ---- meta ---------------------------------------------------------------
  files[".gitignore"] = `node_modules\n.kallo\n.kallo-cache\ndist\nout\n.env.local\n.DS_Store\n`;
  files["README.md"] = emptyReadmeMd(pkgName, storeName, packageManager);

  return files;
}

// ===========================================================================
// Empty template — store
// ===========================================================================
const TASKS_TS = `import { $store } from "@kallojs/runtime";

export interface Task {
  id: string;
  title: string;
  done: boolean;
}

let nextId = 100;

// Global, reactive task list shared across the app.
export const useTasks = $store({
  items: [] as Task[],
  draft: "",
  remaining: 0,

  _recalc() {
    this.remaining = this.items.filter((t: Task) => !t.done).length;
  },

  // Seed from server-fetched data. Runs during SSR *and* on the client, so the
  // list is correct on first paint.
  setTasks(list: Task[]) {
    this.items = [...list];
    this._recalc();
  },

  setDraft(value: string) {
    this.draft = value;
  },

  add() {
    const title = this.draft.trim();
    if (!title) return;
    this.items = [...this.items, { id: String(nextId++), title, done: false }];
    this.draft = "";
    this._recalc();
  },

  toggle(id: string) {
    this.items = this.items.map((t: Task) => (t.id === id ? { ...t, done: !t.done } : t));
    this._recalc();
  },

  remove(id: string) {
    this.items = this.items.filter((t: Task) => t.id !== id);
    this._recalc();
  },
});
`;

// ===========================================================================
// Empty template — API
// ===========================================================================
const API_INDEX_TS = `import { $router } from "@kallojs/server";

const router = $router();

// Add your API routes here. Run \`kallo generate api <name>\` to scaffold a
// full route + controller + service package and wire it up below.
router.get("/health", (_req: any, res: any) => {
  res.ok({ status: "ok" });
});

export default router;
`;

// ===========================================================================
// Empty template — component
// ===========================================================================
const EACH_TASK_KAL = `<View>
  <li class="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-bg-secondary">
    <button @click="onToggle(task.id)" title="Toggle done"
      class="w-6 h-6 rounded-md border flex items-center justify-center text-xs cursor-pointer transition-colors"
      :class="task.done ? 'bg-primary-600 border-primary-600 text-white' : 'bg-bg-primary border-border hover:border-primary-400'">
      <When condition="task.done"><span>✓</span></When>
    </button>
    <span class="flex-1" :class="task.done ? 'line-through text-muted' : 'text-foreground'">{{ task.title }}</span>
    <button @click="onRemove(task.id)" class="text-xs text-danger-600 hover:underline cursor-pointer">Remove</button>
  </li>
</View>
`;

// ===========================================================================
// Empty template — views
// ===========================================================================
function emptyLayoutKal(storeName: string): string {
  return `<Server>
  // Layout-level metadata becomes the site-wide SEO default. Pages can override
  // any field via their own $meta().
  $meta(() => ({
    title: "${storeName}",
    description: "A minimal app built with the Kallo framework.",
    openGraph: { siteName: "${storeName}", type: "website" },
  }));
</Server>

<View>
  <html lang="en">
    <head>
      <link rel="icon" type="image/png" href="/kallo-128.png">
      <link rel="stylesheet" href="/tailwind.css">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300..800&display=swap" rel="stylesheet">
    </head>
    <body class="min-h-screen bg-bg-primary text-foreground">
      <main class="max-w-6xl mx-auto px-5 py-12">
        <Slot />
      </main>
    </body>
  </html>
</View>
`;
}

function emptyPageKal(storeName: string): string {
  return `<Server>
  // Server-side data fetching: the initial tasks are rendered on the server.
  $page(async () => {
    return {
      tasks: [
        { id: "1", title: "Read the Kallo docs", done: true },
        { id: "2", title: "Build something delightful", done: false },
      ],
    };
  });

  $meta(() => ({
    title: "${storeName} — Tasks",
    description: "A minimal Kallo starter with a reactive store, a component, and a server-rendered page.",
  }));
</Server>

<Client>
  import { useTasks } from "../stores/tasks.js";
  import EachTask from "../components/EachTask.kal";

  const tasks = useTasks;

  // Seed the store from server data so the list is correct on first paint.
  tasks.setTasks(props.tasks);

  const onInput = (event) => tasks.setDraft(event.target.value);
  const addTask = () => tasks.add();
  const toggleTask = (id) => tasks.toggle(id);
  const removeTask = (id) => tasks.remove(id);
</Client>

<View>
  <section class="max-w-xl mx-auto flex flex-col gap-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-3xl font-extrabold tracking-tight">Tasks</h1>
      <p class="text-muted">{{ tasks.remaining }} remaining</p>
    </header>

    <div class="flex gap-2">
      <input type="text" placeholder="Add a task..." :value="tasks.draft" @input="onInput(event)"
        class="flex-1 px-4 py-2.5 rounded-xl border border-border bg-bg-secondary text-foreground placeholder-muted focus:outline-none focus:border-primary-500 text-sm" />
      <button @click="addTask()"
        class="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm cursor-pointer transition-colors">
        Add
      </button>
    </div>

    <When condition="tasks.items.length > 0">
      <ul class="flex flex-col gap-2">
        <Each of="tasks.items" as="task">
          <EachTask :task="task" :onToggle="toggleTask" :onRemove="removeTask" />
        </Each>
      </ul>
    </When>
    <Else>
      <div class="text-center py-16 border-2 border-dashed border-border rounded-2xl text-muted">
        <p class="font-semibold">No tasks yet.</p>
        <p class="text-sm mt-1">Add your first task above.</p>
      </div>
    </Else>
  </section>
</View>
`;
}

function emptyReadmeMd(pkgName: string, storeName: string, pm: string): string {
  return `# ${storeName}

A minimal starter built with the [Kallo](https://www.npmjs.com/package/@kallojs/cli) framework.

## What's inside

- **Reactive store** — \`src/stores/tasks.ts\` holds the task list and mutators, shared across the app.
- **Server-side data fetching** — \`src/view/page.kal\` seeds the initial tasks in its \`<Server>\` block.
- **Components in a loop** — \`src/components/EachTask.kal\` renders one task; \`<Each>\` drives the list.
- **API routes** — \`src/api/index.ts\` exposes a starter route; run \`kallo generate api <name>\` to add more.

## Getting started

\`\`\`bash
${pm} install
${runCmd(pm, "dev")}
\`\`\`

Open [http://localhost:3000](http://localhost:3000).

## Build for production

\`\`\`bash
${runCmd(pm, "build")}
${runCmd(pm, "start")}
\`\`\`
`;
}

// ===========================================================================
// CSS
// ===========================================================================
function buildGlobalCss(accent: string): string {
  const ramp = ACCENTS[accent] || ACCENTS.violet!;
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const primaryVars = steps.map((s, i) => `  --color-primary-${s}: ${ramp[i]};`).join("\n");

  return `@import "tailwindcss";

@source "../**/*.kal";

/* Enable class-based dark mode so the theme toggle works at runtime. */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
${primaryVars}

  --color-neutral-50: #fafafa;
  --color-neutral-100: #f4f4f5;
  --color-neutral-200: #e4e4e7;
  --color-neutral-300: #d4d4d8;
  --color-neutral-400: #a1a1aa;
  --color-neutral-500: #71717a;
  --color-neutral-600: #52525b;
  --color-neutral-700: #3f3f46;
  --color-neutral-800: #27272a;
  --color-neutral-900: #18181b;
  --color-neutral-950: #09090b;

  --color-success-100: #dcfce7;
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;
  --color-success-700: #15803d;

  --color-danger-100: #fee2e2;
  --color-danger-500: #ef4444;
  --color-danger-600: #dc2626;
  --color-danger-700: #b91c1c;

  --color-warning-100: #fef3c7;
  --color-warning-500: #f59e0b;
  --color-warning-700: #b45309;

  --color-bg-primary: var(--bg-primary);
  --color-bg-secondary: var(--bg-secondary);
  --color-bg-tertiary: var(--bg-tertiary);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-border: var(--border);
}

:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f8fb;
  --bg-tertiary: #f1f1f6;
  --foreground: #18181b;
  --muted: #71717a;
  --border: #e7e7ec;
}

.dark {
  --bg-primary: #0a0a0c;
  --bg-secondary: #131316;
  --bg-tertiary: #1c1c21;
  --foreground: #f4f4f5;
  --muted: #a1a1aa;
  --border: #27272a;
}

html { color-scheme: light dark; }

body {
  margin: 0;
  background-color: var(--bg-primary);
  color: var(--foreground);
  font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
  transition: background-color 0.2s ease, color 0.2s ease;
}

* { box-sizing: border-box; }
a { text-decoration: none; color: inherit; }
`;
}

// ===========================================================================
// Data
// ===========================================================================
const PRODUCTS_TS = `// Hard-coded catalog. In a real app this would come from a database or API —
// here we expose async functions to demonstrate Kallo's server-side data
// fetching: pages 'await' these in their <Server> block.

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  compareAt: number; // 0 = no discount
  currency: string;
  category: string;
  rating: number;
  reviews: number;
  badge: string; // "" = none
  inStock: boolean;
  colors: string[];
  features: string[];
  image: string;
}

export const categories = ["All", "Audio", "Wearables", "Workspace"];

export const products: Product[] = [
  {
    id: "1",
    slug: "aura-wireless-headphones",
    name: "Aura Wireless Headphones",
    tagline: "Studio sound, all-day comfort",
    description:
      "Immersive 40mm drivers with adaptive noise cancellation and a featherlight frame designed for marathon listening sessions.",
    price: 249,
    compareAt: 299,
    currency: "USD",
    category: "Audio",
    rating: 4.8,
    reviews: 1240,
    badge: "Best seller",
    inStock: true,
    colors: ["#18181b", "#6d28d9", "#f4f4f5"],
    features: ["Adaptive noise cancellation", "40-hour battery life", "Multipoint Bluetooth 5.3", "USB-C fast charge"],
    image: "https://picsum.photos/seed/aura-headphones/800/800",
  },
  {
    id: "2",
    slug: "pulse-earbuds-pro",
    name: "Pulse Earbuds Pro",
    tagline: "Tiny buds, massive bass",
    description:
      "Pocketable earbuds with spatial audio, a secure sport fit, and a wireless charging case that tops up in minutes.",
    price: 129,
    compareAt: 0,
    currency: "USD",
    category: "Audio",
    rating: 4.6,
    reviews: 860,
    badge: "New",
    inStock: true,
    colors: ["#ffffff", "#18181b"],
    features: ["Spatial audio", "IPX5 sweat resistant", "Wireless charging case", "Touch controls"],
    image: "https://picsum.photos/seed/pulse-earbuds/800/800",
  },
  {
    id: "3",
    slug: "vela-smartwatch",
    name: "Vela Smartwatch",
    tagline: "Your day, on your wrist",
    description:
      "A crisp always-on AMOLED display, 5-day battery, and health tracking that keeps up with every workout and meeting.",
    price: 199,
    compareAt: 229,
    currency: "USD",
    category: "Wearables",
    rating: 4.7,
    reviews: 540,
    badge: "",
    inStock: true,
    colors: ["#18181b", "#3b82f6", "#f43f5e"],
    features: ["Always-on AMOLED", "5-day battery", "GPS + heart rate", "50m water resistant"],
    image: "https://picsum.photos/seed/vela-watch/800/800",
  },
  {
    id: "4",
    slug: "trek-fitness-band",
    name: "Trek Fitness Band",
    tagline: "Move more, track everything",
    description:
      "A lightweight band with 14-day battery, sleep insights, and 20+ sport modes to keep your goals on track.",
    price: 59,
    compareAt: 79,
    currency: "USD",
    category: "Wearables",
    rating: 4.4,
    reviews: 2110,
    badge: "Deal",
    inStock: false,
    colors: ["#18181b", "#22c55e"],
    features: ["14-day battery", "Sleep + stress tracking", "20+ sport modes", "Slim 11g design"],
    image: "https://picsum.photos/seed/trek-band/800/800",
  },
  {
    id: "5",
    slug: "lumen-desk-lamp",
    name: "Lumen Desk Lamp",
    tagline: "Light that adapts to you",
    description:
      "A minimalist aluminum lamp with tunable color temperature and a smart auto-dim sensor for eye-friendly focus.",
    price: 89,
    compareAt: 0,
    currency: "USD",
    category: "Workspace",
    rating: 4.5,
    reviews: 320,
    badge: "",
    inStock: true,
    colors: ["#f4f4f5", "#18181b"],
    features: ["Tunable white 2700-6500K", "Auto-dim sensor", "USB-C charging port", "Anodized aluminum"],
    image: "https://picsum.photos/seed/lumen-lamp/800/800",
  },
  {
    id: "6",
    slug: "glide-mechanical-keyboard",
    name: "Glide Mechanical Keyboard",
    tagline: "Type like it's butter",
    description:
      "A hot-swappable 75% mechanical keyboard with gasket mounting, PBT keycaps, and a satisfying, quiet thock.",
    price: 149,
    compareAt: 169,
    currency: "USD",
    category: "Workspace",
    rating: 4.9,
    reviews: 980,
    badge: "Best seller",
    inStock: true,
    colors: ["#18181b", "#6d28d9", "#f4f4f5"],
    features: ["Hot-swappable switches", "Gasket-mounted plate", "PBT double-shot keycaps", "Wireless + USB-C"],
    image: "https://picsum.photos/seed/glide-keyboard/800/800",
  },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getProducts(): Promise<Product[]> {
  await wait(120); // simulate a network/database round-trip
  return products;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  await wait(120);
  return products.find((p) => p.id === id || p.slug === id);
}

export async function getRelatedProducts(id: string, category: string): Promise<Product[]> {
  await wait(60);
  return products.filter((p) => p.category === category && p.id !== id).slice(0, 3);
}
`;

// ===========================================================================
// Stores
// ===========================================================================
const CART_TS = `import { $store } from "@kallojs/runtime";
import type { Product } from "../data/products.js";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  qty: number;
}

// Global, reactive shopping cart shared across every page and component.
export const useCart = $store({
  items: [] as CartItem[],
  count: 0,
  subtotal: 0,
  isOpen: false,

  _recalc() {
    this.count = this.items.reduce((n: number, i: CartItem) => n + i.qty, 0);
    this.subtotal = this.items.reduce((s: number, i: CartItem) => s + i.price * i.qty, 0);
  },

  open() { this.isOpen = true; },
  close() { this.isOpen = false; },
  toggle() { this.isOpen = !this.isOpen; },

  add(product: Product, qty: number) {
    const amount = qty && qty > 0 ? qty : 1;
    const idx = this.items.findIndex((i: CartItem) => i.id === product.id);
    if (idx >= 0) {
      const next = [...this.items];
      next[idx] = { ...next[idx], qty: next[idx].qty + amount };
      this.items = next;
    } else {
      this.items = [
        ...this.items,
        { id: product.id, name: product.name, price: product.price, image: product.image, qty: amount },
      ];
    }
    this._recalc();
    this.isOpen = true;
  },

  setQty(id: string, qty: number) {
    if (qty <= 0) { this.remove(id); return; }
    this.items = this.items.map((i: CartItem) => (i.id === id ? { ...i, qty } : i));
    this._recalc();
  },

  inc(id: string) {
    const it = this.items.find((i: CartItem) => i.id === id);
    if (it) this.setQty(id, it.qty + 1);
  },

  dec(id: string) {
    const it = this.items.find((i: CartItem) => i.id === id);
    if (it) this.setQty(id, it.qty - 1);
  },

  remove(id: string) {
    this.items = this.items.filter((i: CartItem) => i.id !== id);
    this._recalc();
  },

  clear() {
    this.items = [];
    this._recalc();
    this.isOpen = false;
  },
});
`;

const CATALOG_TS = `import { $store } from "@kallojs/runtime";
import type { Product } from "../data/products.js";

// Drives the home page filtering. Seeded from server-fetched products so the
// grid is fully server-rendered, then filtered reactively on the client.
export const useCatalog = $store({
  all: [] as Product[],
  visible: [] as Product[],
  activeCategory: "All",
  query: "",

  setProducts(list: Product[]) {
    this.all = [...list];
    this.applyFilters();
  },

  setCategory(category: string) {
    this.activeCategory = category;
    this.applyFilters();
  },

  setQuery(query: string) {
    this.query = query;
    this.applyFilters();
  },

  applyFilters() {
    let list = [...this.all];
    if (this.activeCategory !== "All") {
      list = list.filter((p: Product) => p.category === this.activeCategory);
    }
    const q = this.query.trim().toLowerCase();
    if (q) {
      list = list.filter((p: Product) => (p.name + " " + p.tagline).toLowerCase().includes(q));
    }
    this.visible = list;
  },
});
`;

const THEME_TS = `import { $store } from "@kallojs/runtime";

// Global dark-mode store. Persists the choice and toggles the 'dark' class on
// <html>, which flips the CSS variables defined in global.css.
export const useTheme = $store({
  isDark: false,

  init() {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("theme");
    this.isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    this.apply();
  },

  toggle() {
    this.isDark = !this.isDark;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", this.isDark ? "dark" : "light");
    }
    this.apply();
  },

  apply() {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", this.isDark);
  },
});
`;

// ===========================================================================
// Components (View + Style only)
// ===========================================================================
function navbarKal(storeName: string): string {
  return `<View>
  <header class="sticky top-0 z-30 backdrop-blur bg-bg-primary/80 border-b border-border">
    <div class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
      <a href="/" class="flex items-center gap-2 font-extrabold text-lg tracking-tight">
        <span class="inline-flex w-8 h-8 rounded-xl bg-primary-600 text-white items-center justify-center">🛍️</span>
        <span>${storeName}</span>
      </a>
      <div class="flex items-center gap-2">
        <button @click="onToggleTheme()" title="Toggle theme"
          class="w-10 h-10 rounded-xl border border-border bg-bg-secondary hover:bg-bg-tertiary flex items-center justify-center text-base cursor-pointer transition-colors">
          <When condition="isDark"><span>🌙</span></When>
          <Else><span>☀️</span></Else>
        </button>
        <button @click="onToggleCart()" title="Cart"
          class="relative h-10 pl-3 pr-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm flex items-center gap-2 cursor-pointer transition-colors">
          <span>Cart</span>
          <When condition="cartCount > 0">
            <span class="min-w-5 h-5 px-1 rounded-full bg-white text-primary-700 text-xs font-bold flex items-center justify-center">{{ cartCount }}</span>
          </When>
        </button>
      </div>
    </div>
  </header>
</View>
`;
}

const PRODUCT_CARD_KAL = `<View>
  <div class="group flex flex-col rounded-2xl border border-border bg-bg-secondary overflow-hidden hover:border-primary-400 transition-all duration-200">
    <a :href="'/products/' + product.slug" class="relative block aspect-square overflow-hidden bg-bg-tertiary">
      <img :src="product.image" :alt="product.name" loading="lazy"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      <When condition="product.badge">
        <span class="absolute top-3 left-3 text-xs font-bold px-2.5 py-1 rounded-full bg-primary-600 text-white shadow">{{ product.badge }}</span>
      </When>
      <When condition="!product.inStock">
        <span class="absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full bg-neutral-900/80 text-white">Sold out</span>
      </When>
    </a>
    <div class="flex flex-col gap-2 p-4">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted">{{ product.category }}</span>
        <StarRating :rating="product.rating" :reviews="product.reviews" />
      </div>
      <a :href="'/products/' + product.slug" class="font-bold text-foreground leading-snug hover:text-primary-600 transition-colors">{{ product.name }}</a>
      <p class="text-sm text-muted line-clamp-1">{{ product.tagline }}</p>
      <div class="flex items-center justify-between pt-2 mt-auto">
        <div class="flex items-baseline gap-2">
          <span class="text-lg font-extrabold text-foreground">\${{ product.price }}</span>
          <When condition="product.compareAt > 0">
            <span class="text-sm text-muted line-through">\${{ product.compareAt }}</span>
          </When>
        </div>
        <button @click="onAdd(product)" :disabled="!product.inStock"
          class="px-3.5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm cursor-pointer transition-colors">
          Add
        </button>
      </div>
    </div>
  </div>
</View>
`;

const STAR_RATING_KAL = `<View>
  <span class="inline-flex items-center gap-1" :title="rating + ' out of 5'">
    <span class="text-sm tracking-tight">
      <span :class="rating >= 1 ? 'text-warning-500' : 'text-neutral-300'">★</span>
      <span :class="rating >= 2 ? 'text-warning-500' : 'text-neutral-300'">★</span>
      <span :class="rating >= 3 ? 'text-warning-500' : 'text-neutral-300'">★</span>
      <span :class="rating >= 4 ? 'text-warning-500' : 'text-neutral-300'">★</span>
      <span :class="rating >= 4.7 ? 'text-warning-500' : 'text-neutral-300'">★</span>
    </span>
    <When condition="reviews">
      <span class="text-xs text-muted">({{ reviews }})</span>
    </When>
  </span>
</View>
`;

const BADGE_KAL = `<View>
  <When condition="label">
    <span class="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full"
      :class="{
        'bg-success-100 text-success-700': tone === 'success',
        'bg-warning-100 text-warning-700': tone === 'warning',
        'bg-danger-100 text-danger-700': tone === 'danger',
        'bg-primary-100 text-primary-700': tone === 'primary'
      }">
      {{ label }}
    </span>
  </When>
</View>
`;

const CART_DRAWER_KAL = `<View>
  <When condition="open">
    <div class="fixed inset-0 z-40">
      <div class="absolute inset-0 bg-neutral-950/50" @click="onClose()"></div>
      <aside class="absolute top-0 right-0 h-full w-full max-w-md bg-bg-primary border-l border-border shadow-2xl flex flex-col">
        <div class="flex items-center justify-between px-5 h-16 border-b border-border">
          <h2 class="font-extrabold text-lg">Your cart ({{ count }})</h2>
          <button @click="onClose()" class="w-9 h-9 rounded-lg hover:bg-bg-tertiary cursor-pointer text-xl">✕</button>
        </div>

        <When condition="count > 0">
          <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            <Each of="items" as="item">
              <div class="flex gap-3 items-center">
                <img :src="item.image" :alt="item.name" class="w-16 h-16 rounded-xl object-cover bg-bg-tertiary" />
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-sm truncate">{{ item.name }}</p>
                  <p class="text-sm text-muted">\${{ item.price }}</p>
                  <div class="flex items-center gap-2 mt-1">
                    <button @click="onDec(item.id)" class="w-7 h-7 rounded-lg border border-border hover:bg-bg-tertiary cursor-pointer">−</button>
                    <span class="w-6 text-center text-sm font-semibold">{{ item.qty }}</span>
                    <button @click="onInc(item.id)" class="w-7 h-7 rounded-lg border border-border hover:bg-bg-tertiary cursor-pointer">+</button>
                    <button @click="onRemove(item.id)" class="ml-auto text-xs text-danger-600 hover:underline cursor-pointer">Remove</button>
                  </div>
                </div>
              </div>
            </Each>
          </div>
          <div class="border-t border-border p-5 flex flex-col gap-3">
            <div class="flex items-center justify-between font-bold text-lg">
              <span>Subtotal</span>
              <span>\${{ subtotal }}</span>
            </div>
            <button @click="onCheckout()" class="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold cursor-pointer transition-colors">
              Checkout
            </button>
          </div>
        </When>
        <Else>
          <div class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <span class="text-5xl">🛒</span>
            <p class="font-semibold">Your cart is empty</p>
            <button @click="onClose()" class="text-sm text-primary-600 font-semibold hover:underline cursor-pointer">Continue shopping</button>
          </div>
        </Else>
      </aside>
    </div>
  </When>
</View>
`;

function footerKal(storeName: string): string {
  const year = new Date().getFullYear();
  return `<View>
  <footer class="border-t border-border mt-16">
    <div class="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted">
      <span>© ${year} ${storeName}. Built with Kallo.</span>
      <span class="flex items-center gap-1">Made with <span class="text-primary-600">♥</span> and TypeScript</span>
    </div>
  </footer>
</View>
`;
}

// ===========================================================================
// Views
// ===========================================================================
function layoutKal(storeName: string): string {
  return `<Server>
  // Layout-level metadata becomes the site-wide SEO default. Pages can override
  // any field via their own $meta().
  $meta(() => ({
    title: "${storeName} — Premium tech, beautifully simple",
    description: "${storeName} is a demo storefront built with the Kallo framework: server-side rendering, file-based routing, and reactive stores.",
    openGraph: { siteName: "${storeName}", type: "website" },
    twitter: { card: "summary_large_image" },
  }));
</Server>

<Client>
  import { $local, $mount } from "@kallojs/runtime";
  import { useCart } from "../stores/cart.js";
  import { useTheme } from "../stores/theme.js";
  import Navbar from "../components/Navbar.kal";
  import CartDrawer from "../components/CartDrawer.kal";
  import Footer from "../components/Footer.kal";

  const cart = useCart;
  const theme = useTheme;

  $mount(() => {
    theme.init();
  });

  const toggleTheme = () => theme.toggle();
  const toggleCart = () => cart.toggle();
  const closeCart = () => cart.close();
  const incItem = (id) => cart.inc(id);
  const decItem = (id) => cart.dec(id);
  const removeItem = (id) => cart.remove(id);
  const checkout = () => {
    if (typeof window !== "undefined") window.alert("This is a demo checkout — order placed! 🎉");
    cart.clear();
  };
</Client>

<View>
  <html lang="en">
    <head>
      <link rel="icon" type="image/png" href="/kallo-128.png">
      <link rel="stylesheet" href="/tailwind.css">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300..800&family=Inter:wght@300..700&display=swap" rel="stylesheet">
    </head>
    <body class="min-h-screen bg-bg-primary text-foreground">
      <Navbar :cartCount="cart.count" :isDark="theme.isDark" :onToggleCart="toggleCart" :onToggleTheme="toggleTheme" />
      <main class="max-w-6xl mx-auto px-5 py-8">
        <Slot />
      </main>
      <Footer />
      <CartDrawer
        :open="cart.isOpen"
        :items="cart.items"
        :count="cart.count"
        :subtotal="cart.subtotal"
        :onClose="closeCart"
        :onInc="incItem"
        :onDec="decItem"
        :onRemove="removeItem"
        :onCheckout="checkout"
      />
    </body>
  </html>
</View>
`;
}

function homeKal(storeName: string): string {
  return `<Server>
  import { getProducts, categories } from "../data/products.js";

  // Server-side data fetching: the catalog is fetched and rendered on the
  // server, so the product grid is fully SSR'd (great for SEO).
  $page(async () => {
    const products = await getProducts();
    return { products, categories, featured: products[0] };
  });

  $meta(() => ({
    title: "${storeName} — Shop premium audio, wearables & desk gear",
    description: "Browse a curated collection of headphones, smartwatches and workspace gear. Fast, server-rendered, and built with Kallo.",
  }));
</Server>

<Client>
  import { useCart } from "../stores/cart.js";
  import { useCatalog } from "../stores/catalog.js";
  import ProductCard from "../components/ProductCard.kal";

  const cart = useCart;
  const catalog = useCatalog;

  // Seed the catalog from server data. This runs during SSR *and* on the
  // client, so the filtered grid is correct on first paint.
  catalog.setProducts(props.products);

  const addToCart = (product) => cart.add(product, 1);
  const selectCategory = (category) => catalog.setCategory(category);
  const onSearch = (event) => catalog.setQuery(event.target.value);
</Client>

<View>
  <section class="relative overflow-hidden rounded-3xl bg-bg-secondary border border-border p-8 sm:p-12 mb-10">
    <div class="max-w-xl flex flex-col gap-4">
      <span class="inline-flex w-fit items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary-600 bg-primary-100 px-3 py-1 rounded-full">Free shipping over $100</span>
      <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">Gear that works as good as it looks.</h1>
      <p class="text-muted text-lg">Thoughtfully designed audio, wearables and desk essentials — server-rendered with Kallo for a fast, snappy experience.</p>
      <When condition="featured">
        <a :href="'/products/' + featured.slug" class="w-fit mt-2 px-5 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold transition-colors">
          Shop {{ featured.name }} →
        </a>
      </When>
    </div>
  </section>

  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
    <div class="flex flex-wrap items-center gap-2">
      <Each of="categories" as="cat">
        <button @click="selectCategory(cat)"
          class="px-4 py-2 rounded-full text-sm font-semibold border transition-colors cursor-pointer"
          :class="catalog.activeCategory === cat ? 'bg-primary-600 text-white border-primary-600' : 'bg-bg-secondary text-foreground border-border hover:border-primary-400'">
          {{ cat }}
        </button>
      </Each>
    </div>
    <input type="search" placeholder="Search products..." :value="catalog.query" @input="onSearch(event)"
      class="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-border bg-bg-secondary text-foreground placeholder-muted focus:outline-none focus:border-primary-500 text-sm" />
  </div>

  <When condition="catalog.visible.length > 0">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <Each of="catalog.visible" as="product">
        <ProductCard :product="product" :onAdd="addToCart" />
      </Each>
    </div>
  </When>
  <Else>
    <div class="text-center py-20 border-2 border-dashed border-border rounded-2xl text-muted">
      <p class="text-lg font-semibold">No products match your search.</p>
      <p class="text-sm mt-1">Try a different category or keyword.</p>
    </div>
  </Else>
</View>
`;
}

function detailsKal(storeName: string): string {
  return `<Server>
  import { getProductById, getRelatedProducts } from "../../../data/products.js";

  // Dynamic route param 'id' resolves the product server-side. A missing
  // product triggers a 404 via $abort.
  $page(async ({ params }) => {
    const product = await getProductById(params.id);
    if (!product) {
      $abort(404);
      return {};
    }
    const related = await getRelatedProducts(product.id, product.category);
    return { product, related };
  });

  // Per-page SEO: rich Open Graph + Twitter tags rendered into <head> at
  // request time. View source on this page to see them.
  $meta(({ product }) => {
    if (!product) return { title: "Product not found — ${storeName}" };
    return {
      title: product.name + " — ${storeName}",
      description: product.description,
      canonical: "/products/" + product.slug,
      openGraph: {
        title: product.name,
        description: product.tagline,
        type: "product",
        url: "/products/" + product.slug,
        image: product.image,
      },
      twitter: {
        card: "summary_large_image",
        title: product.name,
        description: product.tagline,
        image: product.image,
      },
      meta: [
        { property: "product:price:amount", content: String(product.price) },
        { property: "product:price:currency", content: product.currency },
      ],
    };
  });
</Server>

<Client>
  import { $local } from "@kallojs/runtime";
  import { useCart } from "../../../stores/cart.js";
  import ProductCard from "../../../components/ProductCard.kal";
  import StarRating from "../../../components/StarRating.kal";

  const cart = useCart;
  const quantity = $local(1);

  const decQty = () => quantity.set(Math.max(1, quantity.get() - 1));
  const incQty = () => quantity.set(quantity.get() + 1);
  const addToCart = () => cart.add(props.product, quantity.get());
  const addRelated = (p) => cart.add(p, 1);
</Client>

<View>
  <nav class="text-sm text-muted mb-6 flex items-center gap-2">
    <a href="/" class="hover:text-foreground">Home</a>
    <span>/</span>
    <span class="text-foreground">{{ product.category }}</span>
  </nav>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
    <div class="rounded-3xl overflow-hidden border border-border bg-bg-tertiary aspect-square">
      <img :src="product.image" :alt="product.name" class="w-full h-full object-cover" />
    </div>

    <div class="flex flex-col gap-5">
      <div class="flex items-center gap-3">
        <When condition="product.badge">
          <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-primary-100 text-primary-700">{{ product.badge }}</span>
        </When>
        <StarRating :rating="product.rating" :reviews="product.reviews" />
      </div>

      <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">{{ product.name }}</h1>
      <p class="text-lg text-muted">{{ product.tagline }}</p>

      <div class="flex items-baseline gap-3">
        <span class="text-3xl font-extrabold">\${{ product.price }}</span>
        <When condition="product.compareAt > 0">
          <span class="text-lg text-muted line-through">\${{ product.compareAt }}</span>
          <span class="text-sm font-bold text-success-600">Save \${{ product.compareAt - product.price }}</span>
        </When>
      </div>

      <p class="text-foreground/90 leading-relaxed">{{ product.description }}</p>

      <div class="flex flex-col gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-muted">Colors</span>
        <div class="flex items-center gap-2">
          <Each of="product.colors" as="color">
            <span class="w-7 h-7 rounded-full border border-border shadow-inner" :style="'background-color: ' + color"></span>
          </Each>
        </div>
      </div>

      <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Each of="product.features" as="feature">
          <li class="flex items-center gap-2 text-sm">
            <span class="text-success-600 font-bold">✓</span>
            <span>{{ feature }}</span>
          </li>
        </Each>
      </ul>

      <When condition="product.inStock">
        <div class="flex items-center gap-4 pt-2">
          <div class="flex items-center border border-border rounded-xl overflow-hidden">
            <button @click="decQty()" class="w-11 h-12 hover:bg-bg-tertiary cursor-pointer text-lg">−</button>
            <span class="w-12 text-center font-bold">{{ quantity }}</span>
            <button @click="incQty()" class="w-11 h-12 hover:bg-bg-tertiary cursor-pointer text-lg">+</button>
          </div>
          <button @click="addToCart()" class="flex-1 h-12 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold cursor-pointer transition-colors">
            Add to cart
          </button>
        </div>
      </When>
      <Else>
        <button disabled class="h-12 rounded-xl bg-bg-tertiary text-muted font-bold cursor-not-allowed">Sold out</button>
      </Else>
    </div>
  </div>

  <When condition="related.length > 0">
    <section class="mt-16">
      <h2 class="text-2xl font-extrabold tracking-tight mb-6">You might also like</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Each of="related" as="item">
          <ProductCard :product="item" :onAdd="addRelated" />
        </Each>
      </div>
    </section>
  </When>
</View>
`;
}

const NOT_FOUND_KAL = `<View>
  <div class="flex flex-col items-center justify-center text-center py-24 gap-4">
    <div class="text-7xl font-black text-primary-600">404</div>
    <h1 class="text-3xl font-extrabold">Page not found</h1>
    <p class="text-muted max-w-md">The page you're looking for doesn't exist or has moved.</p>
    <a href="/" class="px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold transition-colors">Back to shop</a>
  </div>
</View>
`;

const ERROR_KAL = `<View>
  <div class="flex flex-col items-center justify-center text-center py-24 gap-4">
    <div class="text-6xl">⚠️</div>
    <h1 class="text-3xl font-extrabold">Something went wrong</h1>
    <p class="text-muted max-w-md">An unexpected error occurred. Please try again.</p>
    <a href="/" class="px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold transition-colors">Back to shop</a>
  </div>
</View>
`;

// The Kallo logo, embedded so scaffolded apps ship a real favicon + icon.
const KALLO_ICON_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEEUlEQVR4nO3d+U4UQRTF4XkXd1FZBH0qRFxQEVRURGWRt52NSZOuTvWsRKa7qm6de89J7v/Q3y8hYTrQ6XAcx3Ecx3Ecx5na1elmIf01cBE2Ot8q3J1Vd3W2Ob7TBff3+fT9mT/p74m7YaOLrcLd+cwFxL/6vTF/JxuMQmqjixdFDS+E7294sl4Mf60zhtgb/SvR/eWFP3vSz0rVHDwQ/vB4fNLPDno1PCj+8Hitup9rDGGZTcErwJ886Web9ebgleEPf/hbZQiTG10ugFeMX993hmAa35+0gdiIbzQCB0/88R2tFoOjZ+6kbaKP+Dfju/umOALi/x/fn7RV8CHhrx7e/mLgq4pgdPmyQMFfBn5hCAHxB1+f1idt2HhW8OsIIuDDRmANfxxBePzBl+qkTZeaRfw6ggj4UAFYxl8YQQB8d4dP8o+A+DMRBMT3J21841DwkwUQAT/bCIi/+GLgDw6qkzafGgp++Ru+5AFEwM8qACT88te5SQOIhN8/WCn6n1fkI0DDFw8gIL4/4i/5wY5YABHwRSNAxBcLICJ+f18gAFR8kQAi4/uTDQAEv/wcP2kAifD7+4/TBYCMLx5AJHx3nxJFgIwvGkBk/CQBoOOXr3CJBJAAP0kE6Pj+HT6t+P2PEQPQgp80gMT41T2KE4EW/BQRSOJHCUAbvn+BUyO+uw+BI9CI79/f04gfKQB9+P4FTm34QQPQjh/jBU5p/KAREB8Tv78XOgDiQ+H39h62D4D4uPj+2gdAfFj83vu2ARAfGj9sAMSHww8XAPEh8VsFQHx8fHfvHjSLgPg68JsHQHwV+K0CID4+fuMAiK8Dv30AxIfG771tEwDx4fGbB0B8FfjhAiA+JH6YAIgPi997c3/5AIivB99fswiIbxPfBUB8FfhhAiA+LH77AIgPjd/bbRMA8eHxmwdAfBX44QIgPiR+mACID4vf3b3XMgDiQ+N3X7cJgPjw+I0DcBEQ3y7+XADEh8MPFwDxIfHDBEB8WPzuTtsAiA+N3zoAHwHxjeKXIz4mfrgAiA+J3925G+4PRRHfMP5UAMSHwI8TAPFh8LuvAgfgIiC+XfxxAMTPHT9aAFUExDeL7wIgftb40QOYioD49vDrAIifHX6yAFwExLeLXwVA/JzwkwdQR0B8m/guAOJngd/dFgpgLgLi28KfioD4NvH9iG8YvzMZAPGT4GcXQDniG8b3I75hfD/iG8b3I75h/M5sAMRvjd/dvoMVQMdHQHyb+H7EN4w/OeIr/5l/mxHfML4f8Q3j+xHfMP7kiJ/pBzspR3zD+H7E59ws4Us/66ynGV/62UJNE770s4QeMr70s1M1JHzpZ6V+OeJLPxOzg/87fFz4xcCX/p64COs1/ZdqHMdxHMdxHIe6a9H0KNf75ZrOAAAAAElFTkSuQmCC";

// ===========================================================================
// README
// ===========================================================================
function readmeMd(pkgName: string, storeName: string, pm: string): string {
  return `# ${storeName}

A modern, server-rendered ecommerce storefront built with the [Kallo](https://www.npmjs.com/package/@kallojs/cli) framework.

This starter is intentionally complete — it shows off the core of Kallo in one cohesive app.

## What's inside

- **Server-side data fetching** — \`src/view/page.kal\` and \`src/view/products/[id]/page.kal\` \`await\` async data in their \`<Server>\` block (\`src/data/products.ts\`).
- **SEO / metadata** — the product detail page returns rich Open Graph + Twitter tags via \`$meta()\`. View source to see them.
- **File-based routing** — \`src/view/products/[id]/page.kal\` is a dynamic route; \`params.id\` resolves the product.
- **Global reactive state** — the cart (\`src/stores/cart.ts\`) and theme (\`src/stores/theme.ts\`) stores are shared across pages and components.
- **Local state** — the quantity selector on the detail page uses \`$local\`.
- **Components with dynamic props** — \`ProductCard\`, \`StarRating\`, \`CartDrawer\` receive data and callbacks via \`:props\`.
- **Loops & conditionals** — \`<Each>\` and \`<When>/<Else>\` drive the grid, cart, features and related products.
- **Dark mode** — a class-based toggle wired to CSS variables in \`src/styles/global.css\`.
- **Tailwind CSS v4** — clean, flat design with a customizable accent color.

## Getting started

\`\`\`bash
${pm} install
${runCmd(pm, "dev")}
\`\`\`

Open [http://localhost:3000](http://localhost:3000).

## Project structure

\`\`\`text
src/
  data/products.ts          # catalog + async data functions
  stores/                   # cart, catalog (filtering), theme
  components/               # ProductCard, CartDrawer, Navbar, ...
  view/
    layout.kal              # shell: navbar, cart drawer, footer, site SEO
    page.kal                # home: product grid + filtering
    products/[id]/page.kal  # product detail + SEO
    not-found.kal / error.kal
  styles/global.css         # Tailwind + theme tokens + dark mode
\`\`\`

## Build for production

\`\`\`bash
${runCmd(pm, "build")}
${runCmd(pm, "start")}
\`\`\`
`;
}
