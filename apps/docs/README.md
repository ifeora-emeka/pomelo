# Kallo Documentation

This directory holds the **source of truth** for the Kallo documentation. Each
Markdown file is a documentation page; the docs website at
**[kallo.idegin.com](https://kallo.idegin.com)** (the `apps/www` Kallo app) reads
these files and renders them.

Every page begins with frontmatter that drives the site navigation:

```yaml
---
title: Routing & Layouts
description: One-line summary used for SEO and previews.
category: Core Concepts
order: 1
---
```

## Table of contents

### Getting Started

- [Introduction](./introduction.md) — what Kallo is and why.
- [Installation](./installation.md) — scaffold, run, build.
- [Project Structure](./project-structure.md) — how an app is laid out.

### Core Concepts

- [Routing & Layouts](./routing.md) — file-based routes, layouts, dynamic & catch-all params.
- [Templating](./templating.md) — interpolation, raw HTML, bindings, events, template tags.
- [Components](./components.md) — reusable `.kal` components and props.
- [Reactivity & State](./reactivity.md) — `$local`, `$store`, and `$mount`.

### Server

- [Server, Data & SEO](./server-and-data.md) — `$page` data fetching and `$meta`.
- [API Routes](./api-routes.md) — `$router` HTTP endpoints.

### Styling & Assets

- [Styling with Tailwind](./styling.md) — Tailwind v4 theme tokens and `<Style>` blocks.

### Tooling

- [CLI](./cli.md) — `dev`, `build`, `start`, `create`, `generate`.
- [Editor Support](./editor.md) — the VS Code extension.

## Editing the docs

1. Edit or add a `.md` file in this directory (include the frontmatter above).
2. Run the docs site locally:

   ```bash
   pnpm --filter www dev
   ```

3. New pages appear in the sidebar automatically, grouped by `category` and ordered by `order`.
