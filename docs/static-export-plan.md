# Static Export (`out/`) for GitHub Pages — Design & Plan

> Status: **IMPLEMENTED** (this was the original design doc; the feature now ships).
> Scope: add a static-export mode to Kallo so an app can be compiled to a folder of
> plain HTML/CSS/JS and hosted on GitHub Pages (or any static host / CDN).
>
> What shipped: `output: "server" | "static"` config + `kallo.config.ts` loading,
> the `kallo export` command (alias `build --static`), `$staticParams`/`$paths`
> for dynamic routes, a build-time renderer reusing the live SSR path, client-side
> SPA navigation in static mode, a dev-warn / export-error compatibility linter,
> `basePath`/`assetPrefix`/`trailingSlash`/`export.*`/`images.*` config, docs
> (`apps/docs/deployment.md`), and the `$staticParams` VS Code keyword. See the
> "Static Export & Deployment" doc for user-facing usage. The sections below are
> the original design rationale and remain accurate.

---

## 0. TL;DR recommendation

Add an **`output: 'static'`** mode plus a **`kallo export`** command that pre-renders every
route to disk into an `outDir` (default `out/`). Reuse the machinery Kallo already has —
`$serverStatic`/`StaticRenderStore` (ISR), `renderToString`, the `build` compile pipeline,
and the route scanner — but instead of caching HTML at request time, we **flush the whole
route graph to disk at build time** and never start the Express server.

The three genuinely new pieces are:

1. A **route enumerator** for dynamic routes (`$paths` / `$staticParams`, the Next.js
   `getStaticPaths` equivalent) so we know which concrete URLs to render.
2. A **static client navigation** path in the runtime (fetch `/route/index.html` and morph,
   instead of hitting the SSR endpoint with `X-Kallo-Navigation`).
3. A **compatibility linter** that flags server-only features (API routes, request-dependent
   `$page`/`$guard`/cookies/redirects) — as warnings in `dev` and hard errors in `export`.

Everything else (base path, `.nojekyll`, `404.html` SPA fallback, asset rewriting) is
plumbing on top of the existing SSR renderer.

---

## 1. Why this is not free (the GitHub Pages constraints)

GitHub Pages is **dumb static hosting**. That removes, at runtime:

| Kallo feature today | Works on GH Pages? | Consequence |
|---|---|---|
| Express server / `kallo start` | ❌ | No process to run. Everything must be pre-rendered. |
| SSR at request time (`server.ts` `handleSSR`) | ❌ | Rendering must move to build time. |
| API routes (`src/api`, `$router`) | ❌ | No server to answer `/api/*`. Must use external APIs. |
| `$guard` / auth / cookies / session | ❌ | No per-request context. Must be client-side only. |
| Per-request `$page` data | ❌ | `$page` becomes a **build-time snapshot**. |
| ISR `revalidate` | ❌ | No background regen; `revalidate` is a no-op. |
| Dynamic `$redirect` based on request | ❌ | Must be static/meta-refresh or client redirect. |
| Client hydration + signals reactivity | ✅ | Works fully — this is the whole point. |
| Client-side navigation (`navigateTo`) | ✅* | *Needs a static fetch path (see §4.2). |
| Deep links (`/blog/post-1` typed directly) | ⚠️ | Needs `404.html` SPA fallback + per-route `index.html`. |

So static export is fundamentally: **run SSR once per route at build, write the HTML, ship the
client bundle, and forbid the things that need a live server.**

Good news: Kallo already leans this way. `packages/compiler/src/transforms/server-transform.ts`
supports `$serverStatic`/`$static()` with ISR, and `packages/server/src/static-render.ts` has a
`StaticRenderStore`. Static export is "ISR, but the cache is the filesystem and TTL is infinite."

---

## 2. Q1 — How the framework supports exporting to `out/`

### 2.1 Surface: config + command

**Config** (`kallo.config.ts`, via `defineConfig`):

```ts
export default defineConfig({
  name: 'my-site',
  output: 'static',      // 'server' (default) | 'static'
  outDir: 'out',         // default 'out'
  basePath: '/my-repo',  // for user.github.io/my-repo project pages
  trailingSlash: true,   // about/ -> about/index.html
})
```

> ⚠️ **Prerequisite gap:** the CLI does **not** currently load `kallo.config.ts` — config is
> passed programmatically to `createServer()` in `dev.ts`/`start.ts`. Static export needs the
> config to actually be read. So step 0 is: **implement config loading** (resolve + import
> `kallo.config.{ts,js}` from cwd in `packages/cli`, validate against `FrameworkConfig`). This is
> a small, independently useful task and unblocks §3.

**Command:** add `kallo export` in `packages/cli/src/commands/export.ts` (dispatched from
`packages/cli/src/index.ts`). Equivalent to `kallo build --static`, but I recommend a distinct
verb because the output artifact and mental model differ from a server build.

### 2.2 The export pipeline

Reuse `build.ts` for the compile step, then add a render-to-disk step:

1. **Compile** — run the existing build (`.kal` → JS modules in `.kallo/`, Tailwind → CSS bundle).
   No change to `packages/cli/src/commands/build.ts` compile logic.
2. **Scan routes** — reuse `packages/server/src/route-scanner.ts` to get the page + layout graph.
3. **Enumerate concrete URLs**:
   - Static routes (`/about`, `/`) → render as-is.
   - Dynamic routes (`[slug]`, `[...path]`) → **require** a new server export `$paths()`
     (a.k.a. `$staticParams`) returning the list of param objects. Missing `$paths` on a dynamic
     route = export error (see §5).
4. **Render each URL to HTML** — reuse the SSR path (`handleSSRWithLayouts` / `renderToString`)
   in a build-time harness with a synthetic request context. `$page` runs **once**; its result is
   baked into the hydration state script exactly as SSR does today.
5. **Write files** to `outDir`:
   - `/` → `out/index.html`
   - `/about` → `out/about/index.html` (trailingSlash) or `out/about.html`
   - `/blog/hello` → `out/blog/hello/index.html`
   - Emit client JS bundle(s) + `bundle.css` under `out/_kallo/` (hashed for caching).
6. **Emit host-required files**:
   - `out/404.html` — rendered from `not-found.kal`, doubles as the **SPA deep-link fallback**
     (GH Pages serves `404.html` for unknown paths; our client boots and routes correctly).
   - `out/.nojekyll` — stops GH Pages/Jekyll from eating `_kallo/` underscore dirs.
   - Optional `out/CNAME`, `sitemap.xml`, `robots.txt`.
7. **Rewrite URLs for `basePath`/`assetPrefix`** — prefix all script/style/link/`<Image>` URLs
   and the client router's base so `user.github.io/repo` works.
8. **Copy `public/`** into `out/` verbatim.

### 2.3 Runtime change: static navigation

`packages/runtime/src/dom/index.ts` `navigateTo()` currently expects a live server
(`X-Kallo-Navigation` header → server returns a fragment). In static mode the client must instead
`fetch('/route/index.html')`, extract the body, and `morph()` — the DOM morph engine already
exists. Gate this on a build-time flag baked into the client bundle (`__KALLO_STATIC__ = true`).

### 2.4 Effort estimate

| Piece | Where | Size |
|---|---|---|
| Config loader | `packages/cli` | S |
| `kallo export` command + disk writer | `packages/cli/src/commands/export.ts` | M |
| `$paths`/`$staticParams` server export | `packages/compiler` (server-transform) + export harness | M |
| Build-time render harness (reuse SSR) | `packages/server` (extract render fn) | M |
| Static client navigation | `packages/runtime` | M |
| basePath / asset rewriting | export writer | S–M |
| Compatibility linter | `packages/compiler` + CLI | M |

---

## 3. Q3 — What else belongs in the config

Once we're reading `kallo.config.ts`, extend `FrameworkConfig` in
`packages/types/src/index.ts`. Recommended `output`-related surface (mirrors Next `output: 'export'`
but Kallo-flavored):

```ts
interface FrameworkConfig {
  // ...existing...
  output?: 'server' | 'static';   // default 'server'
  outDir?: string;                // default 'out'
  basePath?: string;              // '' | '/repo'  (GH project pages)
  assetPrefix?: string;           // CDN origin for _kallo/ assets
  trailingSlash?: boolean;        // 'about/index.html' vs 'about.html'
  cleanUrls?: boolean;            // strip .html in the client router

  export?: {
    include?: string[];           // glob allowlist of routes to export
    exclude?: string[];           // routes to skip (e.g. server-only admin)
    fallback?: '404' | 'spa';     // deep-link behavior; default 'spa' via 404.html
    concurrency?: number;         // parallel render workers
    failOnServerFeature?: boolean;// default true — abort on server-only APIs
  };

  images?: {
    unoptimized?: boolean;        // GH Pages can't optimize; default true in static mode
    loader?: 'default' | 'custom';
    domains?: string[];
  };

  sitemap?: boolean | { hostname: string };
  robots?: boolean;
}
```

Notes / rationale:

- **`basePath`** is the single most important addition — without it project pages
  (`user.github.io/repo`) 404 on every asset.
- **`images.unoptimized`** — there's no image server on GH Pages, so `<Image>` must either pass
  through untouched or use a static loader. Default `true` when `output: 'static'`.
- **`trailingSlash`/`cleanUrls`** decide the on-disk layout and how the client router matches.
- **`export.exclude`** lets a mostly-static site keep a few server-only routes out of the export
  (they'd be built separately for a hybrid deploy).
- Fields that become **meaningless in static mode** should be *warned about*, not silently
  ignored: `auth`, `cors`, `port`, per-route `revalidate`, server `$guard`. The config validator
  should emit "ignored in output:'static'" warnings.

---

## 4. Q4 — Errors & warnings during development (the Next.js question)

**Recommendation: yes, emulate Next's `output: 'export'` ergonomics, but be *earlier* than Next.**
Next only surfaces most export incompatibilities at `next build` time. That's a poor loop — you
find out you can't use a feature after building. Kallo should do **both**:

1. **Dev-time warnings (fast feedback).** When `output: 'static'` and the dev server is running,
   the compatibility linter runs on each compiled `.kal` and streams warnings to the terminal +
   an in-browser overlay (Kallo already has an error/boundary path via `error.kal`). Warn when a
   route uses:
   - `src/api` route handlers / `$router`
   - `$guard`, `$requireAuth`, `$roles`, `$currentUser`, `$session`, `$cookies`
   - request-dependent `$page`/`$redirect`/`$headers`
   - a dynamic route (`[param]`) with **no** `$paths`
   - ISR `revalidate` (no-op in static)

2. **Export-time hard errors (the gate).** `kallo export` runs the *same* linter but at error
   severity (`export.failOnServerFeature`, default `true`). It aborts with a grouped report:
   offending route → feature → `file:line`, so the fix is obvious. This is the behavior that
   prevents shipping a broken static site.

Implementation: the linter is a static pass over the parsed blocks (the parser + compiler already
identify `<Server>`/`<Client>` blocks and the `$keyword` set lives in
`packages/shared/src/constants.ts`), so detection is mostly a keyword/AST scan — no runtime needed.

Severity model:

| Situation | dev (`output:'static'`) | `kallo export` |
|---|---|---|
| API route present | warn | error (unless excluded) |
| Dynamic route missing `$paths` | warn | error |
| `$guard`/auth/cookies used | warn | error |
| `revalidate`/ISR used | warn (no-op) | warn |
| `<Image>` without static loader | warn | warn (auto-unoptimize) |
| Render throws for a URL | overlay | error, lists the URL |

---

## 5. Q5 — Rules for developers using `out/`

A short "static mode contract" for the docs:

1. **No server at runtime.** `kallo start` is not used; you deploy files, not a process.
2. **`$page` is a build-time snapshot.** It runs once during export. No per-request data,
   no reading cookies/headers/session. Fetch external/public APIs at build, or fetch client-side.
3. **Dynamic routes must export `$paths`.** `[slug]` etc. must enumerate their params, or the
   route is not exported (hard error).
4. **API routes don't run.** Move them to an external service / serverless / a separate deploy,
   and call them from the client. Use `export.exclude` if some server routes must coexist in a
   hybrid setup.
5. **No auth/guards on the server.** Auth is client-side only (token in storage, protected UI),
   with the real enforcement living behind whatever external API you call.
6. **Set `basePath` for project pages.** `user.github.io/<repo>` needs `basePath: '/<repo>'`.
   Use framework link/router helpers so URLs get the prefix — don't hardcode `/`.
7. **Images are unoptimized** unless you wire a static/CDN loader.
8. **Env is build-time only.** Only explicitly-public, `PUBLIC_`-prefixed env vars get inlined
   into the client bundle; server secrets are never available (there's no server).
9. **Deep links rely on `404.html`.** GH Pages serves it for unknown paths and the client
   re-routes. Keep `not-found.kal` meaningful; don't disable the SPA fallback.
10. **Deploy the `out/` dir** to the `gh-pages` branch or via a Pages GitHub Action; `.nojekyll`
    is emitted for you.

---

## 6. Q2 — Docs & VS Code extension updates

### 6.1 Docs — **yes, required.** (`apps/docs`, surfaced by `apps/www`)

There is currently **no deployment/hosting page** (`installation.md` only mentions `.kallo/`).
Add / update:

- **New page: `deployment.md`** — "Static Export & GitHub Pages": the `output: 'static'` config,
  `kallo export`, the `out/` layout, `basePath`, `.nojekyll`, `404.html`, and a copy-paste
  GitHub Actions workflow that builds and deploys to Pages.
- **New page or section: "Static mode rules & limitations"** — §5 above.
- **Update `cli.md`** — document `kallo export` (and `build --static` if aliased).
- **Update the config reference** — new `output`/`outDir`/`basePath`/`images`/`export` fields (§3).
- **Update `routing.md`** — `$paths`/`$staticParams` for dynamic routes in static mode.
- **Update `installation.md`** — mention the static path alongside server deploy.

### 6.2 VS Code extension — **light updates, not required for core.**

The extension (`extensions/vscode`) is syntax + LSP; it has no build/config awareness and would
keep working untouched. Worth doing anyway:

- **Add `$paths`/`$staticParams`** to the `$keyword` grammar
  (`syntaxes/kal.tmLanguage.json`), completion (`server/src/features/completion.ts`), hover
  (`server/src/features/hover.ts`), and a snippet (`snippets/kal.json`). This is the only strictly
  language-level change new syntax introduces.
- **(Optional, phase 2) Config-aware diagnostics** — if the extension reads `kallo.config.ts`
  (`output: 'static'`), it can surface the §4 compatibility warnings inline (server-only feature
  used in a static project). This needs the LSP to become project-config-aware, which it isn't
  today — treat as a follow-up.
- **`kallo.config.ts` autocomplete comes for free** via the exported `FrameworkConfig` types
  (TS server handles `.ts` config) — just ship the extended types in `packages/types`.

---

## 7. Suggested phased plan

**Phase 0 — Config loading (unblocker).**
Load & validate `kallo.config.{ts,js}` in the CLI; thread config into `dev`/`build`/`start`.
Extend `FrameworkConfig` with the `output` surface (§3) but no behavior yet.

**Phase 1 — Static export MVP (static routes only).**
`kallo export` → compile → render every *static* route via the SSR path → write
`out/**/index.html`, `bundle.css`, client bundle, `404.html`, `.nojekyll`, copy `public/`.
No dynamic routes yet. Ship the GitHub Actions deploy recipe.

**Phase 2 — Dynamic routes + client nav + basePath.**
`$paths`/`$staticParams` enumeration; static `navigateTo` in the runtime; `basePath`/`assetPrefix`
rewriting; `trailingSlash`/`cleanUrls`.

**Phase 3 — Guardrails & DX.**
Compatibility linter (dev warnings + export errors, §4); config "ignored in static" warnings;
`images.unoptimized`; `export.include/exclude`; optional `sitemap`/`robots`.

**Phase 4 — Docs & extension.**
`deployment.md` + rules page + `cli.md`/config/routing updates; `$paths` in the VS Code grammar,
completion, hover, snippet. (Ship docs alongside each phase, not only at the end.)

---

## 8. Open questions / decisions to make

- **Command name:** `kallo export` (Next-ish, clear) vs `kallo build --static` (fewer verbs).
  Recommendation: `kallo export`, with `build --static` as an alias.
- **On-disk layout:** `about/index.html` (trailingSlash, safest on GH Pages) vs `about.html`
  (`cleanUrls`). Recommendation: default `trailingSlash: true` for GH Pages.
- **Hybrid deploy:** do we support "mostly static + a few server routes"? `export.exclude` leaves
  the door open, but the first release can be all-or-nothing (`output: 'static'` exports everything).
- **`$paths` naming:** `$paths` (short) vs `$staticParams` (explicit, matches `$static`).
  Recommendation: `$staticParams`, alias `$paths`.
- **Reuse depth:** how much of `handleSSRWithLayouts` can be extracted into a pure
  `renderRouteToHTML(route, ctx)` used by both the server and the exporter? Worth a small refactor
  so SSR and export never diverge.
