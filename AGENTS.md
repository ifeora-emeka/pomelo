## About

Pomelo is a TypeScript-first fullstack framework built on Express.

Pomelo is inspired by Vue, Laravel, Next.js, and Svelte, but it is not intended to clone any of them. When implementing features, prefer Pomelo-native APIs, naming, and developer experience.

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

Do not invent new architectural patterns when an existing Pomelo pattern already exists.
