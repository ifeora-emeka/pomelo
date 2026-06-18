---
title: Installation
description: Scaffold a new Kallo app in seconds with create-kallo-app, then run dev, build, and start.
category: Getting Started
order: 2
---

# Installation

## Requirements

- **Node.js 18+**
- A package manager: **pnpm** (recommended), **npm**, **yarn**, or **bun**

## Scaffold a new app

The fastest way to start is the official scaffolding command. It generates a complete, server-rendered **ecommerce starter** showcasing SSR data fetching, SEO metadata, file-based routing, reactive stores, dark mode, and Tailwind CSS.

```bash
npm create kallo-app@latest my-app
```

Prefer another package manager?

```bash
pnpm create kallo-app my-app
yarn create kallo-app my-app
```

Want a minimal starter instead of the full storefront?

```bash
npm create kallo-app@latest my-app -- --template empty
```

## Run it

```bash
cd my-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server compiles your `.kal` files, watches for changes with HMR, and runs Tailwind in watch mode.

## Build & start

```bash
npm run build   # compile routes + Tailwind into .kallo and public/
npm run start   # run the production server
```

Next: learn how an app is laid out in [Project Structure](/docs/project-structure).
