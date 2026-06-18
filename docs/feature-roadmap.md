# Kallo Feature Roadmap

**Date:** 2026-06-14
**Scope:** Net-new framework capabilities to add — *not* bug/security fixes (those live in [framework-audit.md](framework-audit.md)).
**Audience:** Framework maintainers and contributing agents.

This document proposes features that would take Kallo from "renders an app" to "ships a real product." Each item states **what**, **why it matters**, and the **proposed Kallo-native API** (`$keyword` convention, Express mental model on the server, HTML-first in the `<View>`). Items are grouped by importance, and an execution-order plan follows at the end.

## ✅ Implementation status (updated 2026-06-14)

| Feature | Priority | Status | Where |
|---------|----------|--------|-------|
| #1 Conditional rendering | P0 | **Shipped** | `<When>/<Else>` + new `<Show when>` alias (compiler) |
| #2 Component model + slots | P0 | **Shipped** (pre-existing) | `_renderComponent`, `<Slot>` |
| #3 Two-way binding | P0 | **Shipped** | `:bind` + new input-type-aware `$model` (text/checkbox/radio/select/textarea) |
| #4 Server actions | P0 | **Shipped (server core)** | `$action`, `dispatchAction`, `registerActionRoute` |
| #5 Input validation | P0 | **Shipped** | `$validate` + `$rule.*` + `ValidationError` |
| #6 CSRF + security headers | P0 | **Shipped** | `$csrf`, `$securityHeaders` |
| #7 Fine-grained reactivity | P0 | **Shipped** | compiler `fineGrained`/`bindings` + runtime `wireBindings` per-binding effects |
| #8 Lazy hydration (islands) | P1 | **Shipped (hydration half)** | `<Client hydrate="load\|idle\|visible\|never">` → compiler `hydrateStrategy` + runtime schedulers in the hydration script. Per-route *code-splitting* still pending bundler work. |
| #9 Prefetching | P1 | **Shipped** | `prefetch()` + hover/touch intent + `<a prefetch="none">` opt-out, consumed by `navigateTo` |
| #10 SSG/ISR | P1 | **Shipped (runtime ISR)** | `$static({ revalidate })` + `StaticRenderStore` (TTL, stale-while-revalidate, coalescing) + blocking-ISR cache in `handleSSR` (`X-Kallo-Cache`). Build-time prerender still pending. |
| #11 Data caching | P1 | **Shipped** | `$cache` (TTL + request coalescing) + `$revalidate` (key/tag) |
| #12 Suspense + boundaries | P1 | **Shipped (sync)** | `<Suspense>`/`<Boundary>` compile to render-time try/catch (`#fallback`/`#error` slots). *Real* streaming SSR still buffers (audit M-7). |
| #13 `<Image>` | P1 | **Shipped (markup)** | `<Image src :width :height sizes priority>` → responsive `srcset` (`?w=`), `loading`/`decoding`/`fetchpriority`. Build-time Sharp pipeline still pending. |
| #17 Testing utils | P2 | **Shipped** | `@kallojs/testing`: `renderToString`, `mount`, `makeEvent`, `mockAction`, `mockReactive`, `mockStore` |
| #18 Plugin system | P2 | **Shipped** | `defineConfig`/`definePlugin` + `config`/`transform`/`configureServer` hooks (wired into `createServer`) |
| #19 Realtime | P2 | **Shipped** | server `$channel(name).publish()` (SSE + last-value replay) + client `$subscribe(name)` reactive |
| #20 Config/env | P2 | **Shipped** | `$env(schema)` (typed coercion, aggregated errors) + `publicEnv` PUBLIC_ boundary |
| P3 Rate limiting | P3 | **Shipped** | `$rateLimit` + `RateLimitStore`/`MemoryRateLimitStore` |
| P3 File uploads | P3 | **Shipped** | `parseMultipart`, `$uploads`, `$file`/`$files` (typed, tied into `$action` via `ctx.files`) |
| P3 PWA / offline | P3 | **Shipped** | `$pwa`, `generateManifest`, `generateServiceWorker`, `pwaHeadTags`, `serviceWorkerRegistrationScript` |

**Verified:** `pnpm build`, `pnpm check-types` (9/9), `pnpm lint` (0 errors), `pnpm test` (220 tests, 0 fail).

**Still outstanding (large, dedicated efforts — intentionally not faked here):**
- #8 Per-route **code-splitting** — needs a per-route chunking pass (lazy *hydration* is done; bundling is not).
- #10 Build-time **static prerender** (`kallo build --static`) — the runtime ISR cache is done; an offline route renderer + output adapter is not.
- #12 *Real* streaming SSR — `renderToStream` still buffers (audit M-7); needs async-boundary support (synchronous Suspense/boundaries are done).
- #13 Build-time **image pipeline** (Sharp variant generation) — the responsive `<Image>` markup is done.
- #14 Deployment adapters — needs `kallo build --target` and per-target output.
- #15 LSP + VS Code extension, #16 browser devtools extension, #21 docs site + playground — separate surfaces, deferred.

The `$action` client form-enhancement (`<form $action>` → fetch + targeted re-render with auto CSRF token) is the remaining slice of #4; the server dispatch/validation/CSRF pipeline it posts to is in place.

---

What Kallo already has (so it is not re-proposed): `.kal` SFCs (`<Server>/<Client>/<View>/<Style scoped>`), reactivity (`$local`, `$store`, `$watch`, `$effect`, `$computed`, `$use`, `$batch`), file-based routing + nested layouts, SSR + naive SSR streaming, `$meta()` SEO, sessions/auth (`$auth`, `$roles`, `$guard`, `$requireAuth`), `<Each>` loops with keyed reconciliation, SPA navigation, scoped CSS, Tailwind, and the `dev/build/start/create/generate` CLI.

---

## 🔴 P0 — Critical (table stakes; real apps are blocked without these)

These are capabilities almost every nontrivial app needs on day one. Their absence is the single biggest gap between Kallo and any production framework.

### 1. Conditional rendering — `<Show>` / `$if`
**Why:** The template has `<Each>` for lists but **no first-class conditional block**. Today an author must hack visibility with CSS or ternaries inside `{{ }}`, neither of which removes nodes from the DOM or skips work. Conditional rendering is more fundamental than looping.
**Proposed API:**
```html
<Show :when="user">
  <p>Welcome {{ user.name }}</p>
  <template #else><a href="/login">Sign in</a></template>
</Show>
```
Compiles to a guarded render branch; the `#else` slot renders when falsy. Must integrate with keyed diffing so toggling preserves sibling state.

### 2. Component model + slots
**Why:** A framework is a component framework. The README shows `<Component>`-style usage and prop passing, but there is no documented, first-class story for **importing one `.kal` into another**, typed props, and **slot composition** (default + named slots). Without composition, every page is a monolith.
**Proposed API:**
```html
<!-- Card.kal -->
<View>
  <div class="card">
    <header><slot name="title" /></header>
    <slot /> <!-- default -->
  </div>
</View>
```
```html
<Client>import Card from "@/components/Card.kal";</Client>
<View>
  <Card :title="product.name">
    <p>{{ product.description }}</p>
    <template #title><h2>{{ product.name }}</h2></template>
  </Card>
</View>
```
Props typed from the child's `<Server>`/`<Client>` declarations; slot content compiled into the parent's handler scope.

### 3. Two-way binding + forms — `$model`
**Why:** Every interactive app collects input. The current pattern (`:value` + manual `@change` writing back) is verbose and error-prone. A single binding directive is the most-requested DX win for an HTML-first framework.
**Proposed API:**
```html
<input $model="email" />
<select $model="quantity"></select>
<input type="checkbox" $model="agreed" />
```
Desugars to the correct value/checked/group binding + event listener per input type. Pairs naturally with #4.

### 4. Server actions / form mutations
**Why:** Kallo has `$page()` for **reads** but no ergonomic **write** path. Authors currently hand-roll `fetch` to a separate `*.api.ts` route. Co-located, progressively-enhanced mutations are the headline feature of every modern fullstack framework and fit Kallo's Express model cleanly.
**Proposed API:**
```html
<Server>
  const createTask = $action(async ({ body, user }) => {
    $guard(user);
    return TaskService.create({ ...body, owner: user.id });
  });
</Server>
<View>
  <form $action="createTask">     <!-- works without JS: POSTs + re-renders -->
    <input name="title" $model="title" />
    <button>Add</button>
  </form>
</View>
```
SSR renders a real `<form method="post">`; the client enhances it to a fetch + targeted re-render. Server runs inside the existing middleware/router pipeline.

### 5. Input validation — `$validate` / schema
**Why:** `.agents/api-design.md` mandates "Never trust client input," but there is no built-in validation primitive, so every `$page`/`$action` re-implements ad-hoc checks. Validation must be a framework concern shared by reads, writes, and route params.
**Proposed API:** a thin, dependency-light schema (or first-class adapter for an existing one — Zod/Valibot, with justification per AGENTS) surfaced as `$validate(schema, input)` that throws a `BadRequestError` with field errors automatically serialized to the client for form display.

### 6. CSRF + hardened security middleware
**Why:** Once #4 ships cookie-authenticated mutations, the app is **CSRF-vulnerable by default**. A framework that owns sessions must own CSRF tokens, secure-cookie defaults, and basic security headers. This is non-optional for the auth system Kallo already ships.
**Proposed API:** automatic per-session CSRF token injected into `$action` forms and verified in the pipeline; `createServer({ security: {...} })` for CSP/HSTS/secure-cookie defaults. Also unblocks the CSP-safe runtime goal from the audit (C-4).

### 7. Fine-grained reactivity (the deferred audit item, as a feature)
**Why:** Today any state change re-renders the whole component to an HTML string and morph-diffs it (audit H-3). This caps Kallo's "minimal runtime overhead" claim and makes large pages janky. Per-binding updates are the difference between a toy reactive layer and a real one.
**Proposed work:** compile bindings to direct DOM node references (build-a-DOM renderer) so a signal write updates only the affected text node / attribute / list slot — no full re-render, no re-parse. Large, high-value, and a prerequisite for smooth #1–#4.

---

## 🟠 P1 — High (expected of a modern framework; needed to be competitive)

### 8. Route-level code splitting + lazy hydration (islands)
**Why:** SSR currently ships and hydrates the whole page. Per-route chunks and **island/partial hydration** (only interactive components hydrate) are the core of good Lighthouse/TTI scores — already an explicit goal in `plan.md` Phase 11.
**Proposed API:** automatic per-route splitting from the router; `<Client hydrate="visible|idle|load|never">` to control when/whether a component's JS loads.

### 9. Prefetching + smart navigation
**Why:** SPA navigation exists; prefetching route code + `$page` data on link hover/viewport makes navigation feel instant. Cheap to add on top of the existing SPA router.
**Proposed API:** `<a href prefetch>` (default-on for in-viewport internal links), with `prefetch="hover|render|none"`.

### 10. Static generation (SSG) + incremental revalidation
**Why:** Marketing pages, docs, and product pages don't need per-request SSR. `kallo build --static` for fully static routes and ISR-style `revalidate` unlocks CDN-cacheable output and cheaper hosting.
**Proposed API:**
```js
$page(async () => ({...}), { render: "static", revalidate: 3600 });
```

### 11. Data layer: caching, revalidation, mutations-invalidate-reads
**Why:** `$page` refetches blindly. A small cache with tag-based invalidation (a `$action` can `$revalidate("tasks")`) closes the read/write loop from #4 and avoids over-fetching.
**Proposed API:** `$page(fn, { cache: ["tasks"] })` + `$revalidate("tasks")` inside actions.

### 12. Async UI: `<Suspense>` + error boundaries + streaming SSR
**Why:** `renderToStream` doesn't actually stream (audit M-7). Real streaming SSR with `<Suspense fallback>` lets slow data stream in progressively, and client-side **error boundaries** stop one component's throw from blanking the page.
**Proposed API:**
```html
<Suspense>
  <template #fallback><Spinner /></template>
  <Comments :for="post.id" />
</Suspense>
<Boundary><template #error="e"><ErrorCard :error="e" /></template>...</Boundary>
```

### 13. Image / asset optimization component
**Why:** Images dominate page weight. A built-in `<Image>` that emits responsive `srcset`, lazy-loading, and width/height to prevent layout shift is high-leverage for the Lighthouse goal.
**Proposed API:** `<Image src="/hero.png" :width sizes />` with build-time variant generation (via Sharp — justified dependency).

### 14. Deployment adapters
**Why:** Kallo is Express-bound today. Adapters (Node server, Docker, and at least one serverless/edge target) make it deployable beyond a long-lived Node box and signal production-readiness.
**Proposed API:** `kallo build --target node|docker|vercel|...`.

---

## 🟡 P2 — Medium (DX & ecosystem; drives adoption and retention)

### 15. Editor tooling: `.kal` Language Server + VS Code extension
**Why:** "TypeScript-first" is undercut if `.kal` files have no syntax highlighting, no type-checking across the four blocks, no go-to-definition, and no autocomplete on `$local`/props in `<View>`. This is the single biggest perceived-quality lever for a new framework.
**Scope:** TextMate grammar, an LSP that type-checks `<Server>/<Client>` and template expressions, and template autocomplete.

### 16. Browser devtools
**Why:** The runtime already has gated devtools hooks (`window.__KALLO_DEVTOOLS__`, audit H-5). A real extension to inspect the component tree, signal/store values, and re-render causes makes debugging reactivity tractable.

### 17. Testing utilities — `@kallojs/testing`
**Why:** No first-party way to render a `.kal`, fire events, and assert. Without it, app authors can't test components, and Kallo can't claim a real testing story.
**Proposed API:** `mount(Component, { props })`, `fireEvent`, store/action mocking, plus an SSR snapshot helper.

### 18. Plugin / extensibility system
**Why:** Vite has plugins; Kallo's compiler, router, and server should expose stable hooks so the ecosystem can add integrations (analytics, ORMs, auth providers) without forking. Prevents core bloat.
**Proposed API:** `kallo.config.ts` with `plugins: [...]` exposing compiler/transform/server-middleware hooks.

### 19. Realtime — WebSocket / SSE primitive
**Why:** Chat, notifications, live dashboards. Kallo is on Express, so `$channel()` (WS/SSE) that streams into a reactive store is a natural, differentiated feature.
**Proposed API:** server `$channel("tasks")` + client `$subscribe("tasks")` returning a reactive value.

### 20. Config & environment management
**Why:** Typed, validated env vars with a clear server/client boundary (never leak secrets to the bundle) is a common footgun a framework should solve once.
**Proposed API:** `$env` with a schema; only `PUBLIC_*` keys exposed client-side.

### 21. First-party docs site + interactive playground
**Why:** `apps/docs`, `apps/www`, `apps/playground` are empty stubs (audit L-2) and `plan.md` Phase 12 wants "usable without docs." A docs site and an in-browser playground are how people evaluate and learn the framework.

---

## 🟢 P3 — Nice-to-have (polish & breadth; after the core is solid)

- **Transitions / animations** — `<Transition>` for enter/leave + list move animations.
- **Internationalization (i18n)** — `$t()` + locale routing; SSR-aware.
- **PWA / offline** — service-worker generation + manifest from config.
- **File uploads** — typed multipart handling tied into `$action`.
- **Rate limiting** — per-route limiter middleware on the Express layer.
- **Analytics / telemetry hooks** — lifecycle events for web-vitals reporting.
- **Server components / partial server rendering** — render components on demand without full-page SSR (depends on #7 + #12).
- **Scaffolding breadth** — extend `generate` (CRUD resource, store, middleware blueprints).

---

## 🗺️ Execution order plan

Sequenced by dependency and risk, not just priority. Each wave should ship with a working demo in `temp/` and pass lint/type-check/tests per AGENTS.

### Wave 0 — Unblock the foundation (do first; some are audit items that gate features)
1. **Fine-grained reactivity (#7)** — biggest architectural change; everything interactive sits on it. Doing it first avoids reworking #1–#4 twice. (Pairs with audit H-3.)
2. **CSP-safe handler model** — already addressed in the audit (C-4); confirm it holds, since #4/#6 build on it.

### Wave 1 — Core authoring model (the P0 block that makes apps real)
3. **Conditional rendering `<Show>`/`$if` (#1)** — smallest, highest-frequency primitive; validates the new renderer.
4. **Component model + slots (#2)** — composition; depends on the renderer being stable.
5. **`$model` two-way binding (#3)** — quick win once the renderer handles attribute/value updates.
6. **Server actions `$action` (#4)** → then **validation `$validate` (#5)** → then **CSRF/security (#6)**. Ship these as one cohesive "mutations" milestone; #6 must land *with* #4, not after, so mutations are never shipped insecure.

> Exit criteria for Wave 1: the ecommerce test app can render conditionally, compose components, and submit a validated, CSRF-protected form that mutates server state — all with progressive enhancement.

### Wave 2 — Performance & production shape (P1)
7. **Code splitting + lazy hydration / islands (#8)** — depends on the component model (#2).
8. **Prefetching (#9)** — small, builds on #8 + existing SPA router.
9. **Suspense + error boundaries + real streaming SSR (#12)** — depends on the renderer (#7).
10. **Data caching + revalidation (#11)** — closes the loop with #4.
11. **SSG + revalidate (#10)** and **Image component (#13)** — parallelizable; both target the Lighthouse goal.
12. **Deployment adapters (#14)** — last in this wave; needs the build output to be stable.

> Exit criteria for Wave 2: sample apps score >90 Lighthouse (the `plan.md` Phase 11 bar) and deploy to at least one non-bare-Node target.

### Wave 3 — DX & ecosystem (P2; can overlap Wave 2 since it's mostly separate surface)
13. **Testing utilities (#17)** — pull earlier if app-author confidence is blocking adoption.
14. **LSP + VS Code extension (#15)** — large, independent; staff in parallel with Wave 2.
15. **Devtools (#16)**, **plugin system (#18)**, **realtime (#19)**, **config/env (#20)**.
16. **Docs site + playground (#21)** — continuous, but make it real once Wave 1 APIs stabilize so docs don't churn.

### Wave 4 — Breadth & polish (P3)
17. Transitions, i18n, PWA, uploads, rate limiting, analytics, server components, expanded scaffolding — pick by user demand once the core is proven.

### Guiding constraints (from AGENTS / plan.md)
- Don't build a bundler/minifier/TS compiler/runtime — lean on Vite/SWC/TS/Express.
- `$keyword` naming; Express-familiar server APIs; client APIs that are **not** React clones.
- Each feature must improve DX or framework clarity (the "Golden Rule") — drop anything that doesn't.
- Never ship mutations (#4) without their security partner (#6).
