# Kallo VS Code Extension — Plan

**Date:** 2026-06-18
**Status:** Proposed (implements roadmap item #15 — "LSP + VS Code extension")
**Scope:** A VS Code extension for the Kallo framework and the `.kal` single-file component format. VS Code first; the design keeps the language server editor-agnostic so other editors can follow.

---

## 1. Why this exists

Kallo's primary goal is **excellent developer experience**. Today `.kal` files are plain text in every editor: no syntax highlighting, no IntelliSense, no diagnostics, no go-to-definition. Authors edit a multi-language file (`<Server>` TS, `<Client>` TS, `<View>` HTML-ish template, `<Style>` CSS) with zero tooling support.

A first-class editor experience is table stakes for adoption — it is what Svelte (`svelte-vscode`), Vue (Volar), and Astro all invested in early. This extension is that investment for Kallo.

**Non-goals for v1:** debugging adapters, refactoring/codemods, a `.kal` formatter that reflows the whole file (we lean on Prettier + existing per-language formatters), and other editors (Neovim, JetBrains) — deferred but kept possible by the architecture.

---

## 2. Where it lives in the repo

A **new top-level `extensions/` directory**, not `packages/`.

```
kallo/
├── apps/
├── packages/          # @kallojs/* libraries the framework build graph consumes
├── extensions/        # NEW — editor tooling shipped to developers
│   └── vscode/        # this extension
└── ...
```

**Rationale:**

- Everything under `packages/*` is a `@kallojs/*` library wired into the framework dependency graph (`parser → compiler → vite-plugin`) and into `turbo run build/check-types/test`. A VS Code extension is a leaf artifact published to the Marketplace, with its own packaging (`vsce`) and bundler (`esbuild`). It does not belong in that graph and must not create a reverse dependency.
- Keeping it in `extensions/` preserves the dependency direction AGENTS.md protects and keeps "framework code we ship" separate from "editor tooling we ship."
- The language server is editor-agnostic and could later be extracted to `packages/language-server` (a real `@kallojs/*` lib) once a second editor needs it. Until then it lives inside `extensions/vscode/server` so v1 stays simple.

**Workspace wiring:** add `"extensions/*"` to `pnpm-workspace.yaml`. Exclude the extension from the default `turbo` framework pipeline (it has its own `package`/`publish` scripts) so it never blocks `pnpm build` of the framework.

---

## 3. Architecture

Standard **LSP client/server split**, mirroring `svelte-vscode` and Volar:

```
extensions/vscode/
├── client/            # VS Code extension host (thin)
│   └── src/extension.ts   # activates, starts the language server, wires commands
├── server/            # Language server (editor-agnostic, Node process)
│   ├── src/server.ts      # LSP connection, document manager
│   ├── src/kal-document.ts# parses a .kal file into its 4 regions + offset maps
│   ├── src/plugins/       # one capability provider per concern (see §5)
│   └── src/embedded/      # virtual TS/CSS/HTML docs for embedded-language delegation
├── syntaxes/
│   └── kal.tmLanguage.json # TextMate grammar (highlighting, works with zero server)
├── snippets/
│   └── kal.json
├── language-configuration.json
├── package.json           # contributes: languages, grammars, snippets, commands, config
└── PLAN.md (this file)
```

**Key idea — region mapping.** A `.kal` file is one document containing four languages. The server parses it (reusing `@kallojs/parser`) into regions and builds **offset maps** between the `.kal` source and per-region *virtual documents*:

- `<Server lang="ts">` and `<Client lang="ts">` → virtual **TypeScript** documents
- `<View>` → virtual **HTML** document with Kallo template extensions
- `<Style scoped>` → virtual **CSS** document
- `<Head>` → metadata/TS

Embedded-language features (TS hover, CSS completion) are delegated to the appropriate language service against the virtual doc, then positions are mapped back to the `.kal` file. This is the same technique Volar formalizes and is the only sane way to get real TS IntelliSense inside an SFC.

**Reuse over reinvention** (per AGENTS.md): the server depends on `@kallojs/parser` (and read-only metadata from `@kallojs/compiler`) for an authoritative `.kal` AST, instead of writing a second parser that can drift. This is the one place the extension *does* depend on `packages/*` — a forward dependency, which is allowed.

---

## 4. The `.kal` language surface to support

Derived from the current framework, so highlighting/snippets match reality:

**Blocks:** `<Server lang="ts">`, `<Client lang="ts" hydrate="load|idle|visible|never">`, `<View>`, `<Style scoped>`, `<Head>`.

**Template tags:** `<Show :when>`, `<When>`, `<Else>`, `<Each>`, `<Slot>`, `<Suspense>` (`#fallback`/`#error` slots), `<Boundary>`, `<Image src :width :height sizes priority>`.

**Template directives & interpolation:** `{{ expr }}`, `:attr` bindings (`:src`, `:class`, `:value`), `:bind` / `$model` two-way binding, `@event` handlers (`@click`, `@change`) with `$event`, `#slot` markers, `prefetch`.

**`$keyword` APIs** (highlight as framework builtins; power completion + hover):
- Server: `$page`, `$layout`, `$static`, `$meta`, `$action`, `$validate`, `$rule.*`, `$cache`, `$revalidate`, `$csrf`, `$securityHeaders`, `$rateLimit`, `$uploads`/`$file`/`$files`, `$router`, `$guard`/`$requireAuth`/`$roles`/`$auth`/`$currentUser`, `$abort`, `$env`, `$channel`, `$pwa`.
- Client/runtime: `$local`, `$store`, `$use`, `$watch`, `$effect`, `$computed`, `$batch`, `$model`, `$subscribe`, `$mount`/`$destroy`/`$init`.

---

## 5. Features, phased

### Phase 1 — Highlighting & editing basics (no server needed)
- **TextMate grammar** (`kal.tmLanguage.json`): color the 4 blocks; inject `source.ts` into `<Server>`/`<Client>`, `source.css` into `<Style>`, and an HTML-derived grammar into `<View>`; special-case `{{ }}`, `:`/`@`/`#` directives, Kallo template tags, and `$keyword` builtins.
- **`language-configuration.json`:** comment toggling, bracket pairs, auto-closing, indentation rules per region.
- **Snippets:** new `.kal` page/layout/component scaffolds, each block, `$page`/`$action`/`$store`/`$local`/`<Show>`/`<Each>`/`<Suspense>` blocks.
- **File icon** for `.kal` (the 🍊).

*Delivers visible value on day one with the lowest risk.*

### Phase 2 — Language server: diagnostics & embedded IntelliSense
- Parse `.kal` via `@kallojs/parser`; surface **parse/compile diagnostics** inline (malformed blocks, unknown directives, duplicate `<Server>`, etc.).
- **Embedded TypeScript:** completion, hover, signature help, and diagnostics inside `<Server>`/`<Client>` via a TS language service over the virtual TS docs, with `$keyword` ambient typings injected so framework APIs resolve.
- **Embedded CSS:** completion + validation inside `<Style>` (delegated to VS Code's CSS service).
- **Template completion:** Kallo tags, directives, and event names inside `<View>`; suggest reactive variables declared in `<Client>` inside `{{ }}` and `:bind`.

### Phase 3 — Navigation & cross-cutting intelligence
- **Go-to-definition / hover** spanning regions: jump from a `{{ count }}` in `<View>` to its `$local` in `<Client>`; from `$use(cartStore)` to the store file.
- **File-based routing awareness:** treat `page.kal`/`layout.kal` specially; CodeLens or hover showing the resolved route path; completion for route params in `$page(({ params }) => …)`.
- **Document symbols / outline:** the four blocks plus declared reactive state and server handlers.
- **Rename** of reactive variables across `<Client>` ↔ `<View>`.

### Phase 4 — Polish
- Auto-import for `@kallojs/*` APIs and project stores.
- Quick-fixes for common diagnostics (e.g. add missing `<View>`, convert ternary-in-`{{}}` to `<Show>`).
- Emmet inside `<View>`.
- Optional: integrate the project's Prettier config for per-block formatting.

---

## 6. Tech stack

- `vscode-languageserver` / `vscode-languageclient` (LSP scaffolding).
- `vscode-languageserver-textdocument` + a small offset-map utility for region mapping (consider `@volar/*` only if it pays for itself; start hand-rolled and minimal).
- `typescript` language service for embedded TS (the project already pins `typescript@5.9.2`).
- `@kallojs/parser` (+ read-only `@kallojs/compiler` metadata) for the authoritative AST.
- `esbuild` to bundle client + server into the `.vsix`.
- `@vscode/vsce` for packaging/publishing.
- TextMate grammar authored in JSON; tested with `vscode-tmgrammar-test`.

`package.json` `contributes`: `languages` (id `kal`, extension `.kal`), `grammars`, `snippets`, `commands` (Restart Kallo Language Server), and `configuration` (e.g. `kallo.trace.server`, enable/disable embedded TS).

---

## 7. Testing & verification (per AGENTS.md)

- **Grammar tests** via `vscode-tmgrammar-test` snapshots over representative `.kal` files.
- **Server unit tests** for region parsing + offset mapping (round-trip: `.kal` offset ↔ virtual-doc offset).
- **Integration tests** with `@vscode/test-electron` exercising completion/hover/diagnostics on fixture `.kal` files.
- Manual smoke test against a scaffolded app in `temp/` (`node packages/cli/dist/bin.js create temp/test-app`), as the framework's isolation workflow prescribes.
- CI gate: lint, type-check, grammar tests, and `vsce package` must succeed.

---

## 8. Milestones / sequencing

1. **M1 — Skeleton + grammar (Phase 1).** Scaffold `extensions/vscode`, grammar, snippets, language config, icon. Ship an installable `.vsix` with highlighting only. *Highest value-to-effort; unblocks dogfooding.*
2. **M2 — Server + diagnostics + embedded TS/CSS (Phase 2).**
3. **M3 — Cross-region navigation + routing awareness (Phase 3).**
4. **M4 — Polish + Marketplace publish (Phase 4).**
5. **Later — extract `server/` to `packages/language-server`** when a second editor is targeted (roadmap #15's "LSP" half becomes reusable).

---

## 9. Open questions

- Publisher identity / Marketplace org for the `kallo` extension.
- Whether to vendor a forked HTML grammar for `<View>` or inject the built-in `text.html.basic` and layer Kallo tokens on top (lean toward injection first).
- Source of `$keyword` ambient typings: generate from `@kallojs/types` at build time vs. hand-maintain a `.d.ts` (prefer generated to avoid drift).
- How much of Volar to adopt vs. a minimal hand-rolled mapper — decide at M2 based on real friction.
