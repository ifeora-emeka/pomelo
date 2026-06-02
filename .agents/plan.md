# PLAN.md — Pomelo Framework Build Plan

## Overview

Pomelo is a fullstack TypeScript-first framework powered by Express, a custom compiler, and a Vite plugin system.

This plan defines phased execution for building a production-grade framework using LLM agents.

---

# Phase 0 — Foundations (Repo + Tooling)

## Goals

Set up monorepo and enforce strict boundaries.

## Tasks

- [x] Initialize Turborepo workspace
- [x] Configure pnpm workspaces
- [x] Setup TypeScript base config
- [x] Setup ESLint + Prettier
- [x] Setup path aliases (`@pomelo/*`)
- [x] Create package skeletons:
  - [x] parser
  - [x] compiler
  - [x] runtime
  - [x] server
  - [x] vite-plugin
  - [x] cli
  - [x] shared
  - [x] types

## Exit Criteria

- [x] All packages build successfully
- [x] TypeScript imports resolve across workspace
- [x] Turbo pipeline runs (`build`, `dev`, `lint`)

---

# Phase 1 — Parser + AST Design

## Goals

Define `.pom` syntax parsing rules and AST structure.

## Tasks

- [x] Design `.pom` grammar
  - [x] `<Server>`
  - [x] `<Client>`
  - [x] `<View>`
  - [x] `<Style>`

- [x] Build lexer
- [x] Build HTML-like parser
- [x] Define AST types in `@pomelo/types`
- [x] Parse:
  - [x] attributes
  - [x] directives (`@click`, `:class`)
  - [x] loops (`<Each>`)

- [x] Validate syntax errors with meaningful messages

## Exit Criteria

- [x] `.pom` file can be parsed into AST
- [x] AST is deterministic and serializable

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
