---
title: Static Export & Deployment
description: Export a Kallo app to static HTML/JS for GitHub Pages or any static host with kallo export.
category: Tooling
order: 2
---

# Static Export & Deployment

Kallo apps can run in two modes. You pick one in `kallo.config.ts` with the `output` field.

- **`output: "server"`** (default) — server-side rendering at request time, plus per-route `$static` ISR. Deploy with `kallo build` and run a Node process with `kallo start`.
- **`output: "static"`** — `kallo export` pre-renders **every** route to plain HTML, CSS, and JS. There is no Node server at runtime; you host the files on GitHub Pages, a CDN, S3, Netlify, or any static host.

## Choosing the static mode

```ts
// kallo.config.ts
import { defineConfig } from "@kallojs/server";

export default defineConfig({
  output: "static",
});
```

Then export your site:

```bash
kallo export          # alias: kallo build --static
```

`kallo export` runs the [compatibility linter](#compatibility-linter), compiles your app, renders every route, and writes the result to `outDir` (default `out/`):

- Flat `.html` files: `/about` → `out/about.html`, `/` → `out/index.html`.
  With `trailingSlash: true` you get `out/about/index.html` instead.
- Client JS under `out/@kallojs/…` so pages still hydrate.
- `404.html`, generated from your `not-found.kal`.
- `.nojekyll`, so GitHub Pages serves the `@kallojs` directory untouched.
- A copy of everything in `public/`.

## Configuration

All fields below are optional and go on the object passed to `defineConfig`.

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `output` | `"server" \| "static"` | `"server"` | Render at request time, or pre-render to files. |
| `outDir` | `string` | `"out"` | Output directory for the exported site. |
| `basePath` | `string` | `""` | URL prefix, e.g. `"/my-repo"` for a GitHub project page. Must start with `/`, no trailing slash. Leave empty for user/org pages or custom domains. |
| `assetPrefix` | `string` | `basePath` | Where assets are loaded from. Can be an absolute CDN origin. |
| `trailingSlash` | `boolean` | `false` | `false` emits flat `about.html` (Next.js default; GitHub Pages resolves `/about` → `/about.html`). `true` emits `about/index.html`. |
| `export` | `object` | — | Route selection and strictness (see below). |
| `images` | `object` | — | `unoptimized?: boolean` (defaults to `true` when static) and `domains?: string[]`. |

The `export` object accepts:

- `include?: string[]` / `exclude?: string[]` — route paths to force in or leave out. Both support a trailing `*` wildcard.
- `fallback?: "404" | "spa"` (default `"spa"`) — how unknown deep links are handled.
- `failOnServerFeature?: boolean` (default `true`) — whether server-only features abort the export.

```ts
import { defineConfig } from "@kallojs/server";

export default defineConfig({
  output: "static",
  basePath: "/my-repo",     // GitHub project page
  trailingSlash: false,
  export: {
    exclude: ["/admin/*"],  // served separately, e.g. by a real server
  },
});
```

## Dynamic routes

A dynamic route (`src/view/products/[id]/page.kal`) has no single URL — Kallo needs the list of params to render at build time. Export `$staticParams` (alias `$paths`) from the `<Server>` block, the equivalent of Next.js `generateStaticParams`:

```html
<Server>
  import { products } from "../../../data/products.js";

  $staticParams(() => products.map((p) => ({ id: p.slug })));
  $page(async ({ params }) => ({ product: await getProduct(params.id) }));
</Server>
```

Each returned object becomes one pre-rendered page. Enumerate by the **same** param value your app's links use (e.g. slug vs numeric id), or the generated pages won't match your `href`s.

If `$staticParams` is missing on a dynamic route, that route is **not** exported and `kallo export` reports an error. It must return an array — an empty array simply renders nothing for that route.

## Compatibility linter

Static output can't run server code, so Kallo flags server-only features. In `kallo dev` (with `output: "static"`) they are **warnings**; in `kallo export` they are **errors** that abort the build — unless you set `export.failOnServerFeature: false` or list the route in `export.exclude`.

**Error-level** (won't work statically):
`$guard`, `$requireAuth`, `$roles`, `$currentUser`, `$session`, `$cookies`, `$csrf`, `$rateLimit`, `$uploads`, `$channel`, and any `src/api` routes.

**Warn-level** (no-op or degraded, but the page still renders):
`$headers`, `$redirect`, `$revalidate` (ISR).

## Nested layouts

Nested layouts work exactly as in server mode. A `layout.kal` wraps every route in its
folder and below, and layouts nest — the root `src/view/layout.kal` wraps a section's
`src/view/products/layout.kal`, which wraps the page. The export pre-renders the full
layout chain into every page's HTML, and client navigation adds or removes section
layouts as you move in and out of their segment (just like the Next.js App Router).

```
src/view/
  layout.kal              # wraps everything
  page.kal                # /
  products/
    layout.kal            # wraps /products/*
    [id]/page.kal         # /products/:id  → root + products layout + page
```

> Layout **markup** persists across navigation (morphed, not re-mounted, so there's no
> flash). Layout **state** re-initializes on each navigation, the same as Kallo's
> server-mode client navigation — Kallo re-hydrates the page + layout tree as a unit
> rather than doing per-segment partial rendering.

## What still works in the browser

Exported pages are not just static HTML — they still hydrate and stay fully interactive:

- Signal reactivity works exactly as in server mode.
- Client-side SPA navigation: clicking an internal link fetches the pre-rendered HTML and morphs content (preserving shared layout DOM) without a full reload. Back/forward works.
- A missing page falls back to a full browser navigation (which `404.html` handles).
- Auth session probing is skipped in static mode.

## Rules & limitations

1. **No server at runtime.** You deploy files, not a process; `kallo start` is not used.
2. **`$page` runs once, at build time.** It's a snapshot — no per-request data, no reading cookies, headers, or session. Fetch external/public APIs at build time or on the client.
3. **Dynamic routes require `$staticParams`.**
4. **`src/api` routes don't run.** Move them to an external service or serverless function and call them from the client — or use `export.exclude` for a hybrid deploy where some routes are served separately.
5. **No server auth or guards.** Enforce auth on the client against an external API.
6. **Set `basePath` for GitHub project pages.** Use root-relative links that include the base, or the framework link helpers.
7. **Images are unoptimized** unless you configure a CDN or static loader.
8. **Only build-time public env vars are inlined** into the client — this project uses a `KALLO_PUBLIC_*` prefix convention. Server secrets are unavailable.
9. **Deep links rely on `404.html`** (auto-emitted) for the SPA fallback, so keep `not-found.kal` meaningful.

## Deploying to GitHub Pages

Add an export script to `package.json`:

```json
{
  "scripts": {
    "export": "kallo export"
  }
}
```

For a **project page** served at `user.github.io/<repo>`, set `basePath` to match:

```ts
export default defineConfig({
  output: "static",
  basePath: "/<repo>",
});
```

For a **user/org page** (`user.github.io`) or a custom domain, leave `basePath` empty. The `.nojekyll` file is emitted automatically, so you don't need to add one.

Then commit this workflow. It builds on every push to `main` and deploys `./out` using the modern GitHub Pages Actions flow:

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm export        # or: npx kallo export

      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

In your repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. On the next push to `main`, your exported site goes live.
