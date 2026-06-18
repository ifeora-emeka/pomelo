## About

Kallo is a TypeScript-first fullstack framework built on Express.

Kallo is inspired by Vue, Laravel, Next.js, and Svelte, but it is not intended to clone any of them. When implementing features, prefer Kallo-native APIs, naming, and developer experience.

This repository is a Turborepo monorepo.

---

## Before Making Changes

Read the following documents before making architectural or framework changes:

- `.agents/architecture.md`
- `.agents/patterns.md`
- `.agents/api-design.md`

These documents are the source of truth.

If AGENTS.md conflicts with a document above, the document above wins.

---

## Project Goals

Primary goals:

1. Excellent developer experience
2. Fast builds
3. Fast SSR
4. TypeScript-first APIs
5. Minimal runtime overhead
6. Express mental model on the server
7. HTML-first templating
8. Predictable framework conventions

---

## What We Are NOT Building

Do not implement:

- Custom bundler
- Custom minifier
- Custom TypeScript compiler
- Custom JavaScript runtime
- Custom package manager

Prefer existing solutions:

- Vite
- Rollup
- SWC
- TypeScript
- Express

---

## Repository Structure

Important packages:

- `packages/parser`
- `packages/compiler`
- `packages/runtime`
- `packages/server`
- `packages/vite-plugin`
- `packages/cli`

Dependency direction:

parser
→ compiler
→ vite-plugin

Do not introduce reverse dependencies.

---

## Coding Rules

### Do

- Use TypeScript
- Prefer explicit types
- Prefer composition over inheritance
- Keep functions small
- Keep files focused
- Reuse shared utilities
- Follow existing naming conventions
- Preserve backwards compatibility when possible
- Always create test kallo project in a temp dir which should be ignored by git. This way it is tested and ran in isolation.

### Don't

- Add code comments
- Add dependencies without justification
- Introduce circular dependencies
- Create framework aliases for existing utilities unless there is clear DX value
- Use `any` unless unavoidable
- Refactor unrelated code during feature work
- Rename public APIs without approval

---

## Framework Design Rules

When adding framework APIs:

- Prefer `$keyword()` naming conventions
- Server APIs must feel familiar to Express developers
- Client APIs must be framework-specific and not React clones
- Avoid React hook naming patterns
- Avoid unnecessary magic
- Prefer explicit behavior over implicit behavior

---

## Editor Tooling (VS Code extension)

The VS Code extension lives in `extensions/vscode` (a leaf artifact published to the
Marketplace — **not** a `@kallojs/*` package, and not part of the framework
dependency graph). It depends on the framework only one-way, for shared concepts.

**The language surface the extension knows about is mirrored, not imported.** The
editor must tolerate half-typed/invalid documents that the framework parser throws
on, so it does not import `@kallojs/parser` at runtime. Instead it keeps its own
copies of the language constants.

When you change the language surface, you MUST update the extension in the same
change:

- **Add/rename/remove a `$keyword` API** → update `KEYWORDS` in
  `extensions/vscode/src/shared/language.ts` (name, scope, detail, doc, snippet)
  and the keyword alternation in `extensions/vscode/syntaxes/kal.tmLanguage.json`
  (`#kallo-keywords`).
- **Add/rename a block** (`<Server>`/`<Client>`/`<View>`/`<Style>`/`<Head>`) →
  update `BLOCK_NAMES`/`BLOCK_LANGUAGE` in `language.ts`, the block rules in the
  grammar, `language-configuration.json` folding markers, and snippets.
- **Add/rename a `<View>` template tag** (`<Show>`, `<Each>`, …) → update
  `VIEW_TAGS` in `language.ts` and `#kallo-tag` in the grammar.
- **Add/rename a template directive** (`:`/`@`/`#`) → update the directive lists in
  `extensions/vscode/server/src/features/completion.ts` and the grammar.

These lists are the editor's mirror of `packages/shared/src/constants.ts`; keep them
in sync. After changing the extension, run `pnpm --filter kallo-vscode check-types`,
`pnpm --filter kallo-vscode test`, and `pnpm --filter kallo-vscode build`, and bump
`extensions/vscode/CHANGELOG.md` + `version`.

The framework's single-file component extension is `.kal` (`SFC_EXTENSION`); do not
introduce alternative SFC extensions. (`.kallo`/`.kallo-cache` are build-cache
directories, unrelated to file types.)

---

## Performance Rules

Always consider:

- SSR performance
- Hydration cost
- Bundle size
- Memory usage
- HMR performance

Avoid allocations in hot paths.

---

## Testing

Before completing work:

- Run linting
- Run type checking
- Run affected tests
- Verify build succeeds

Do not claim code works without verification.

---

## Agent Behavior

When uncertain:

1. Read the relevant documentation.
2. Search the existing codebase for precedent.
3. Follow existing patterns.
4. Choose consistency over novelty.

Do not invent new architectural patterns when an existing Kallo pattern already exists.
