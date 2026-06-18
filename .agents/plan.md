# PLAN.md — Kallo Framework Build Plan

## Overview

Kallo is a fullstack TypeScript-first framework powered by Express, a custom compiler, and a Vite plugin system.

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
- [x] Setup path aliases (`@kallojs/*`)
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

Define `.kal` syntax parsing rules and AST structure.

## Tasks

- [x] Design `.kal` grammar
  - [x] `<Server>`
  - [x] `<Client>`
  - [x] `<View>`
  - [x] `<Style>`

- [x] Build lexer
- [x] Build HTML-like parser
- [x] Define AST types in `@kallojs/types`
- [x] Parse:
  - [x] attributes
  - [x] directives (`@click`, `:class`)
  - [x] loops (`<Each>`)

- [x] Validate syntax errors with meaningful messages

## Exit Criteria

- [x] `.kal` file can be parsed into AST
- [x] AST is deterministic and serializable

---

# Phase 2 — Compiler Core

## Goals

Transform AST → executable JS module.

## Tasks

- [x] Server block compiler (`$page`)
- [x] Client block compiler (`$local`, `$store`, `$watch`)
- [x] Template compiler → render function
- [x] Style compiler → scoped CSS hash system
- [x] Directive compiler:
  - [x] `@click`
  - [x] `:bind`
  - [x] `:class`

- [x] Slot resolution system

## Exit Criteria

- [x] `.kal` file compiles to JS module
- [x] No framework runtime required to interpret template

---

# Phase 3 — Runtime System

## Goals

Build client-side execution system.

## Tasks

- [x] Reactive system (`state`, `effect`, `computed`)
- [x] DOM renderer
- [x] Hydration engine
- [x] Event delegation system
- [x] Lifecycle hooks (`$mount`, `$destroy`)
- [x] Scoped CSS injection system

## Exit Criteria

- [x] Hydration works on SSR pages
- [x] Client interactivity fully functional

---

# Phase 4 — Server Integration (Express Core)

## Goals

Turn Kallo into a real SSR framework.

## Tasks

- [x] Express server wrapper
- [x] Route generation from file system
- [x] SSR renderer:
  - [x] renderToString
  - [x] stream support (optional)

- [x] Context system (`req`, `res`)
- [x] Middleware system:
  - [x] `$auth`
  - [x] `$guard`

- [x] Error handling pipeline

## Exit Criteria

- [x] `.kal` page renders via Express SSR
- [x] Dynamic routes work (`[id]` support)

---

# Phase 5 — Vite Plugin + Dev Server

## Goals

Enable hot module development.

## Tasks

- [x] Vite plugin:
  - [x] `.kal` file loader
  - [x] transform pipeline

- [x] HMR integration
- [x] Dev server overlay errors
- [x] Fast refresh for:
  - [x] template changes
  - [x] state changes

- [x] File-based routing sync

## Exit Criteria

- [x] Editing `.kal` updates UI instantly
- [x] No full reload required

---

# Phase 6 — Routing System

## Goals

File-based routing like Next.js but simpler.

## Tasks

- [x] Route scanner
- [x] Dynamic route parsing:
  - [x] `[id]`
  - [x] `[...catchall]`
- [x] Route → server mapping
- [x] Layout system (`layout.kal`)
- [x] Nested routes

## Exit Criteria

- [x] Full routing works from filesystem only

---

# Phase 7 — State Management

## Goals

Global + local reactive state system.

## Tasks

- [x] `$store` global state system
- [x] `$local` component state
- [x] Cross-component reactivity
- [x] Persistence plugin (optional)
- [x] Devtools hook

## Exit Criteria

- [x] Shared state updates UI everywhere correctly

---

# Phase 8 — Metadata + SEO Engine

## Goals

Advanced SSR metadata control.

## Tasks

- [x] `$meta` system
- [x] Dynamic head injection
- [x] OpenGraph support
- [x] Canonical URLs
- [x] Per-route SEO overrides
- [x] SSR-safe meta merging

## Exit Criteria

- [x] Each route can control full HTML head dynamically

---

# Phase 9 — Auth System

## Goals

Built-in authentication abstraction.

## Tasks

- [x] Session handling
- [x] Cookie utilities
- [x] `$auth()` middleware
- [x] Role-based guards
- [x] Server/client auth sync

## Exit Criteria

- [x] Protected routes work server + client side

---

# Phase 10 — CLI Tooling

## Goals

Developer experience layer.

## Tasks

- [x] `create-kallo` scaffolder
- [x] `kallo dev`
- [x] `kallo build`
- [x] `kallo start`
- [x] Code generator:
  - [x] page
  - [x] api route
  - [x] store
- [x] Project templates:
  - [x] ecommerce
  - [x] SaaS
  - [x] blog

## Exit Criteria

- [x] A full app can be created in < 2 minutes

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

Make Kallo feel "delightful".

## Tasks

- [x] Error overlays
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

Kallo is complete when:

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
