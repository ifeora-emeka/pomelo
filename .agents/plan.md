# PLAN.md — Pomelo Framework Build Plan

## Overview

Pomelo is a fullstack TypeScript-first framework powered by Express, a custom compiler, and a Vite plugin system.

This plan defines phased execution for building a production-grade framework using LLM agents.

---

# Phase 0 — Foundations (Repo + Tooling)

## Goals

Set up monorepo and enforce strict boundaries.

## Tasks

- Initialize Turborepo workspace
- Configure pnpm workspaces
- Setup TypeScript base config
- Setup ESLint + Prettier
- Setup path aliases (`@pomelo/*`)
- Create package skeletons:
  - parser
  - compiler
  - runtime
  - server
  - vite-plugin
  - cli
  - shared
  - types

## Exit Criteria

- All packages build successfully
- TypeScript imports resolve across workspace
- Turbo pipeline runs (`build`, `dev`, `lint`)

---

# Phase 1 — Parser + AST Design

## Goals

Define `.pom` syntax parsing rules and AST structure.

## Tasks

- Design `.pom` grammar
  - `<Server>`
  - `<Client>`
  - `<View>`
  - `<Style>`

- Build lexer
- Build HTML-like parser
- Define AST types in `@pomelo/types`
- Parse:
  - attributes
  - directives (`@click`, `:class`)
  - loops (`<Each>`)

- Validate syntax errors with meaningful messages

## Exit Criteria

- `.pom` file can be parsed into AST
- AST is deterministic and serializable

---

# Phase 2 — Compiler Core

## Goals

Transform AST → executable JS module.

## Tasks

- Server block compiler (`$page`)
- Client block compiler (`$local`, `$store`, `$watch`)
- Template compiler → render function
- Style compiler → scoped CSS hash system
- Directive compiler:
  - `@click`
  - `:bind`
  - `:class`

- Slot resolution system

## Exit Criteria

- `.pom` file compiles to JS module
- No framework runtime required to interpret template

---

# Phase 3 — Runtime System

## Goals

Build client-side execution system.

## Tasks

- Reactive system (`state`, `effect`, `computed`)
- DOM renderer
- Hydration engine
- Event delegation system
- Lifecycle hooks (`$mount`, `$destroy`)
- Scoped CSS injection system

## Exit Criteria

- Hydration works on SSR pages
- Client interactivity fully functional

---

# Phase 4 — Server Integration (Express Core)

## Goals

Turn Pomelo into a real SSR framework.

## Tasks

- Express server wrapper
- Route generation from file system
- SSR renderer:
  - renderToString
  - stream support (optional)

- Context system (`req`, `res`)
- Middleware system:
  - `$auth`
  - `$guard`

- Error handling pipeline

## Exit Criteria

- `.pom` page renders via Express SSR
- Dynamic routes work (`[id]` support)

---

# Phase 5 — Vite Plugin + Dev Server

## Goals

Enable hot module development.

## Tasks

- Vite plugin:
  - `.pom` file loader
  - transform pipeline

- HMR integration
- Dev server overlay errors
- Fast refresh for:
  - template changes
  - state changes

- File-based routing sync

## Exit Criteria

- Editing `.pom` updates UI instantly
- No full reload required

---

# Phase 6 — Routing System

## Goals

File-based routing like Next.js but simpler.

## Tasks

- Route scanner
- Dynamic route parsing:
  - `[id]`
  - `[...catchall]`

- Route → server mapping
- Layout system (`layout.pom`)
- Nested routes

## Exit Criteria

- Full routing works from filesystem only

---

# Phase 7 — State Management

## Goals

Global + local reactive state system.

## Tasks

- `$store` global state system
- `$local` component state
- Cross-component reactivity
- Persistence plugin (optional)
- Devtools hook

## Exit Criteria

- Shared state updates UI everywhere correctly

---

# Phase 8 — Metadata + SEO Engine

## Goals

Advanced SSR metadata control.

## Tasks

- `$meta` system
- Dynamic head injection
- OpenGraph support
- Canonical URLs
- Per-route SEO overrides
- SSR-safe meta merging

## Exit Criteria

- Each route can control full HTML head dynamically

---

# Phase 9 — Auth System

## Goals

Built-in authentication abstraction.

## Tasks

- Session handling
- Cookie utilities
- `$auth()` middleware
- Role-based guards
- Server/client auth sync

## Exit Criteria

- Protected routes work server + client side

---

# Phase 10 — CLI Tooling

## Goals

Developer experience layer.

## Tasks

- `create-pomelo` scaffolder
- `pomelo dev`
- `pomelo build`
- `pomelo start`
- Code generator:
  - page
  - api route
  - store

- Project templates:
  - ecommerce
  - SaaS
  - blog

## Exit Criteria

- A full app can be created in < 2 minutes

---

# Phase 11 — Optimization Layer

## Goals

Make framework production-ready.

## Tasks

- JS minification (via SWC/esbuild)
- CSS compression
- Tree-shaking support
- Route-level code splitting
- Lazy hydration
- Prefetching system

## Exit Criteria

- Lighthouse score > 90 on sample apps

---

# Phase 12 — Developer Experience Polish

## Goals

Make Pomelo feel "delightful".

## Tasks

- Error overlays
- Better stack traces
- Dev warnings system
- CLI diagnostics
- Docs generator integration
- Playground app

## Exit Criteria

- Framework is usable without docs for basic apps

---

# Execution Rules

1. Never skip phases
2. Never implement Phase N+1 before Phase N is stable
3. Each phase must have a working demo
4. Prefer simplicity over abstraction
5. Do not introduce React/Vue naming conventions

---

# Definition of Done (Global)

Pomelo is complete when:

- SSR works
- Hydration works
- Routing works
- State system works
- CLI works
- Dev server works
- Compiler is stable
- Example ecommerce app runs end-to-end

---

# Golden Rule

If a feature does not improve developer experience or framework clarity, do not build it.
