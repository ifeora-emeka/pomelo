---
title: Introduction
description: Kallo is a TypeScript-first, HTML-first fullstack framework built on Express — server-side simplicity with a reactive client runtime.
category: Getting Started
order: 1
---

# Introduction

**Kallo** is a TypeScript-first, HTML-first fullstack framework built on top of **Express**. It pairs the familiar mental model of an Express server with a compiler, a small reactive client runtime, and modern file-based routing.

Kallo is inspired by Vue, Laravel, Next.js, and Svelte — but it is not a clone of any of them. It aims for a small, predictable surface with great developer experience.

## Why Kallo?

- **TypeScript-first** — explicit types and great editor support, including a dedicated VS Code extension for `.kal` files.
- **HTML-first templating** — write real HTML in a `<View>` block, sprinkle in interpolation and directives. No JSX.
- **Express on the server** — `<Server>` blocks and API routes feel like the Express you already know.
- **Reactive client runtime** — a tiny runtime hydrates the server-rendered HTML and keeps `$store` / `$local` state in sync.
- **Fast, file-based routing** — the file system *is* the router, with layouts, dynamic params, and catch-all routes.
- **Built on proven tools** — Vite, Rollup, SWC, TypeScript, Express. Kallo does not ship a custom bundler or runtime.

## Single-file components

A Kallo component lives in a `.kal` file and is composed of blocks:

```html
<Server>
  // Runs on the server only. Fetch data, set metadata.
  $page(async () => ({ message: "Hello from the server" }));
</Server>

<Client>
  // Runs in the browser after hydration.
  import { $local } from "@kallojs/runtime";
  const count = $local(0);
  const inc = () => count.set(count.get() + 1);
</Client>

<View>
  <main>
    <h1>{{ message }}</h1>
    <button @click="inc()">Clicked {{ count }} times</button>
  </main>
</View>

<Style>
  h1 { font-weight: 800; }
</Style>
```

Continue to [Installation](/docs/installation) to scaffold your first app.
