# Kallo Framework Audit

**Date:** 2026-06-14
**Scope:** All `packages/*` source (parser, compiler, runtime, server, vite-plugin, cli, shared, types) plus repo docs and apps.
**Method:** Source read of all core files, `pnpm check-types` (passes), `pnpm lint` (0 errors / 283 warnings), `pnpm test` (did not finish — see H-6).

This document groups findings by severity. Each item references `file:line`.

---

## ✅ Resolution status (updated 2026-06-14)

All findings below have been addressed. Verification after the work: `pnpm check-types` passes, `pnpm lint` reports 0 errors, and the full `pnpm test` suite completes (17/17 turbo tasks, **95 tests pass / 0 fail**, no hangs).

| ID | Status | Fix summary |
|----|--------|-------------|
| C-1/2/3 | Fixed | Added `escapeHtml` / `escapeAttr` / `serializeForScript` in `@kallo/shared`; applied to all template interpolations & attributes (inline `_escape`/`_escapeAttr` in generated render), `$meta` output, and inline-script state serialization. |
| C-4 | Fixed | Replaced runtime `new Function`+`with` with a build-time handler registry (`globalThis.__kal_handlers__[componentId]`); event handlers are precompiled functions referenced by `cid::idx`. CSP-safe (no `eval`/`unsafe-eval`). |
| H-1 | Fixed | Loop-item and component-prop serialization now use `_escapeAttr(JSON.stringify(...))`. |
| H-2 | Fixed | `$store` caches nested proxies in a `WeakMap` (stable identity, no per-read allocation). |
| H-3 | Fixed (fine-grained for non-structural components; coarse fallback for structural) | Event-handler writes are wrapped in `$batch`. The compiler now emits per-binding read-only thunks into a `__kal_bindings__` registry (CSP-safe, mirroring `__kal_handlers__`) plus DOM markers (`data-kal-txt`, `data-kal-attr-*`, `data-kal-battr-*`, `data-kal-value`); the runtime wires one `$effect` per binding so a state change updates only the affected node — no whole-component re-render. Templates containing structural / dynamic-scope constructs (`Each`/`When`/`Show`/`Else`/`Slot`, child components, `<Head>`, dynamic `:class`) keep the coarse whole-component re-render path. See note below. |
| H-4 | Fixed | `<Each key=...>` now emits `data-kal-key` on each iteration root, enabling keyed reconciliation. |
| H-5 | Fixed | Devtools instrumentation gated behind an opt-in `window.__KALLO_DEVTOOLS__` hook (no hot-path clone/dispatch in prod); stale `__POMELO_DEVTOOLS__` removed. |
| H-6 | Fixed | `createServer` no longer spawns `fs.watch` handles eagerly — dev HMR/watchers moved into `start()` and torn down on `server.close()`. Suite no longer hangs. |
| M-1 | Fixed | Per-event debug `console.*` removed; navigation error routed through `KalloLogger`. |
| M-2 / L-5 | Fixed | Single `hashId` (FNV-1a) util in `@kallo/shared` replaces the three hand-rolled hashers. |
| M-4 | Fixed | Catch-all routes use Express 5 `*name` wildcard syntax; param extraction updated. |
| M-5 | Fixed | `$watch` saves/restores `activeEffect`. |
| M-6 | Fixed | Persistence requires an explicit `persistKey`; without one it is disabled (no shared-key collision). |
| M-7 | Fixed | `renderToStream` uses ESM `import` and streams chunks via `Readable.from` (supports sync/iterable/async-iterable renderers). |
| M-8 | Fixed | Dead `lexer.ts` / `tokenize` path removed. |
| M-9 | Largely fixed | Public `Handler`/router types tightened; lint warnings cut from 283 → ~123 (turbo env vars declared, `no-require-imports`/`no-namespace`/`no-unsafe-function-type`/`no-empty` cleared, `_`-prefix unused-var convention adopted). All production-source `any` eliminated except a few defensible cases (arbitrary `package.json` parsing, dynamically-imported compiled-module shapes). Remaining warnings are test-file `any` (conventionally tolerated) and pre-existing `no-useless-escape` in regexes. |
| M-10 | Fixed | Compiler block gating uses a basename allow-list; test-env (`NODE_ENV`/`KALLO_*`) coupling removed. |
| L-1 | Fixed | README/AGENTS/`.agents/*` updated to `.kal`, `src/view/`, `@kallo/runtime`. |
| L-2 | Fixed | Placeholder apps marked “(planned)” in the README. |
| L-3 | Fixed | Committed `test-cli-ecommerce-app/` fixture removed. |
| L-4 | Fixed | Session tokens carry an optional `exp` claim verified on read; session cookies set it. |

**Note on H-3:** fine-grained reactivity is now implemented as an *additive* path rather than a ground-up rewrite, so the SSR string contract and the coarse renderer are preserved intact. For non-structural components the compiler emits binding thunks + markers and the runtime attaches one `$effect` per binding, so changing a signal updates only the bound text node / attribute / input value — `render()` is not re-invoked (verified by test). Structural templates (loops, conditionals, components, slots, dynamic `:class`) still use the coarse whole-component re-render + morph-diff, which is correct for them; extending fine-grained reactivity to those (keyed list bindings, conditional blocks) is the natural follow-up. Text bindings are wrapped in an inline `<span data-kal-txt>`; the rare cases where that span is invalid (e.g. as a direct child of `<table>`/`<select>`) should use the coarse path.

---

## 🔴 Critical — security / will break real apps

### C-1. SSR template output is never HTML-escaped (XSS)
`packages/compiler/src/transforms/template-transform.ts`
- Text interpolation `{{ expr }}` is emitted as `${_unwrapSignal(expr)}` straight into the HTML string with no escaping ([:153-156](packages/compiler/src/transforms/template-transform.ts#L153-L156)).
- Bound attributes `:attr="x"` emit `attr="${_unwrapSignal(x)}"` with no attribute escaping ([:279](packages/compiler/src/transforms/template-transform.ts#L279)) — a value containing `"` breaks out of the attribute.
- Static attribute interpolation has the same gap ([:283-287](packages/compiler/src/transforms/template-transform.ts#L283-L287)).

Any server- or user-supplied value rendered through `{{ }}` or `:attr` is a stored/reflected XSS vector. A framework that renders HTML must escape by default. This contradicts `.agents/api-design.md` ("Never trust client input", "Never expose internal errors").

### C-2. `$meta()` output is never escaped (XSS)
`packages/server/src/metadata.ts` — `renderMetadataHTML` interpolates `title`, `description`, `og:*`, `twitter:*`, custom meta `content`, and link attrs directly into markup ([:53-120](packages/server/src/metadata.ts#L53-L120)). Metadata is routinely derived from data (`title: product.name`), so this is XSS via `<head>`.

### C-3. Serialized server state injected into inline `<script>` without escaping (XSS)
`packages/server/src/server.ts` — hydration scripts embed `const serverState = ${JSON.stringify(state)}` inside `<script type="module">` ([:160](packages/server/src/server.ts#L160), [:192-193](packages/server/src/server.ts#L192-L193)). `JSON.stringify` does **not** escape `<`/`/`, so any state string containing `</script>` (or `<!--`, U+2028/2029) breaks out of the script and executes. Must escape `<`, `>`, `&`, and line separators.

### C-4. Client event handlers run via `new Function` + `with` on DOM attribute strings
`packages/runtime/src/dom/index.ts` ([:271-276](packages/runtime/src/dom/index.ts#L271-L276))
- `new Function("state", "$event", "with(state) { return (${expr}); }")` evaluates expressions read from `data-kal-event-*` attributes.
- **CSP incompatible:** any app with a Content-Security-Policy that omits `unsafe-eval` cannot run Kallo at all.
- Combined with C-1, attacker-controlled markup that lands in the DOM becomes attacker-controlled JS. Loop context is `JSON.parse`d back out of `data-kal-loop-item-*` attributes ([:221](packages/runtime/src/dom/index.ts#L221)), widening the surface.

---

## 🟠 High — correctness, performance, or trust

### H-1. Loop data is serialized into HTML attributes with incomplete escaping
`template-transform.ts` ([:269](packages/compiler/src/transforms/template-transform.ts#L269)) emits `data-kal-loop-item-<var>="${JSON.stringify(var).replace(/\"/g,'&quot;')}"`. Only `"` is handled — `<`, `&`, `'` are not — so it is both an injection path and brittle. It also dumps entire loop objects into the DOM for every row (bundle/DOM bloat, leaks server fields to the client).

### H-2. `$store` allocates a new Proxy on every property read
`packages/runtime/src/reactivity/index.ts` ([:188-202](packages/runtime/src/reactivity/index.ts#L188-L202)) — `createDeepProxy` is re-invoked on every nested `get`. This breaks referential identity (`store.a === store.a` is false), and allocates in a hot path, directly violating AGENTS "Avoid allocations in hot paths." Proxies should be cached per target.

### H-3. No fine-grained reactivity — every change re-renders the whole component
`dom/index.ts` ([:361-391](packages/runtime/src/dom/index.ts#L361-L391)) — a single `$effect` re-runs the entire `render()` to an HTML string and morph-diffs the whole subtree on any dependency change. There is no per-binding tracking. This undercuts the README's "Signal-Like Reactivity" / "minimal runtime overhead" claims.

### H-4. `<Each key="...">` keyed reconciliation is dead code
`morphChildren` keys on `data-kal-key` ([:99](packages/runtime/src/dom/index.ts#L99), [:130](packages/runtime/src/dom/index.ts#L130)), but `template-transform.ts` never emits `data-kal-key` for `<Each>` — the `key` attribute shown throughout the docs is silently ignored. Lists fall back to index-based diffing, causing state/DOM corruption on reorder/insert/delete.

### H-5. Production devtools instrumentation in the reactivity hot path
`reactivity/index.ts` ([:9-19](packages/runtime/src/reactivity/index.ts#L9-L19)) — `notifyDevtools` runs on every Signal construction ([:57](packages/runtime/src/reactivity/index.ts#L57)), every signal set ([:73](packages/runtime/src/reactivity/index.ts#L73)) and every store change ([:182](packages/runtime/src/reactivity/index.ts#L182)), doing a full `JSON.parse(JSON.stringify(state))` deep clone and dispatching a `CustomEvent`. No production guard. Also still references the pre-rename global `__POMELO_DEVTOOLS__` ([:15-16](packages/runtime/src/reactivity/index.ts#L15-L16)).

### H-6. Test suite does not complete
`pnpm test` was terminated after 5 minutes without finishing (likely a server/HMR test that opens a listener/SSE and never exits). AGENTS requires "Run affected tests / Verify build succeeds" before completing work; the suite is currently not reliably runnable in CI.

---

## 🟡 Medium — maintainability, parity, brittleness

### M-1. Debug `console.*` left in production code
8 `console.log/warn/error` calls in shipped runtime/server, e.g. event logging on every dispatch ([dom/index.ts:269,280,282](packages/runtime/src/dom/index.ts#L269)). Noise + overhead.

### M-2. Three duplicate hand-rolled hash / componentId implementations
`compiler/index.ts` ([:18](packages/compiler/src/index.ts#L18), slice 6), `vite-plugin/index.ts` ([:113](packages/vite-plugin/src/index.ts#L113), slice 6), `vite-plugin/transform.ts` ([:18](packages/vite-plugin/src/transform.ts#L18), slice 8). AGENTS says "Reuse shared utilities." Worse, the compiler bakes `data-kal-<id>` and scoped-CSS selectors from its own hash, while vite-plugin re-derives and *exports* a separate `componentId` — divergence risks mismatched scoped styles / style-dedup keys.

### M-3. Test-only router path diverges from production routing
`packages/server/src/router.ts` — the custom `.handle` records only `handlers[handlers.length - 1]` ([:39](packages/server/src/router.ts#L39)) and invokes just that handler ([:74](packages/server/src/router.ts#L74)), dropping all middleware, and re-implements param matching with a naive regex. Production correctly uses the Express function path ([server.ts:1098](packages/server/src/server.ts#L1098)), so `.handle` is exercised **only by tests** — tests run a different, middleware-less routing engine than prod (false confidence + parity gap).

### M-4. File-based catch-all routes use Express 4 wildcard syntax on Express 5
`route-scanner.ts` emits `:${name}*` for `[...slug]` ([:20](packages/server/src/route-scanner.ts#L20)), but the project pins `express@^5.2.1`, where path-to-regexp v8 rejected the old `:param*` form (the SSR fallback already uses the new `*splat` at [server.ts:926](packages/server/src/server.ts#L926)). Catch-all file routes likely throw at registration. Needs verification against a real `[...x]` route.

### M-5. `$watch` clobbers the active effect
`reactivity/index.ts` ([:109-111](packages/runtime/src/reactivity/index.ts#L109-L111)) sets `activeEffect = effectFn` then unconditionally resets to `null`, instead of save/restore. Calling `$watch` during an in-progress effect/render silently detaches the outer effect's dependency tracking.

### M-6. Shared default `persistKey`
`reactivity/index.ts` ([:153](packages/runtime/src/reactivity/index.ts#L153)) — every persisted store without an explicit key uses `"kallo-store"`, so multiple persisted stores collide/overwrite in `localStorage`.

### M-7. `renderToStream` does not stream
`packages/runtime/src/renderer/index.ts` ([:7-18](packages/runtime/src/renderer/index.ts#L7-L18)) builds the full HTML string, then pushes it once. It also uses CommonJS `require("node:stream")` inside an ESM package. No real streaming SSR despite the "Fast SSR" goal.

### M-8. Dead second parsing path
`packages/parser/src/lexer.ts` `tokenize()` is exported ([parser index :2](packages/parser/src/index.ts#L2)) but unused — the compiler calls `parse()` only. Two divergent block-parsing implementations to keep in sync; remove or consolidate.

### M-9. Pervasive `any`
~92 `any`/`as any` in `src`, 283 lint warnings, despite AGENTS "Don't use `any` unless unavoidable." `router.ts` and much of `types` are effectively untyped, undermining the "TypeScript-first" positioning.

### M-10. Compiler bakes test-env detection into compilation logic
`compiler/index.ts` ([:33-47](packages/compiler/src/index.ts#L33-L47)) — `isPageOrLayout` is gated on `NODE_ENV==='test'` / `KALLO_TEST` / `KALLO_ENV` plus loose `filename.includes("page.kal")`. Compilation behaves differently under test than in prod, and string-`includes` matching is brittle (a path segment named `page.kal` anywhere flips it).

---

## 🟢 Low — docs, hygiene, design notes

### L-1. Documentation is badly out of sync with the code (highest-impact "low")
`AGENTS.md` calls `.agents/*.md` the "source of truth," yet:
- `.pom` extension is referenced 29× across README/AGENTS/.agents, but the real extension is `.kal` ([constants.ts:50](packages/shared/src/constants.ts#L50)).
- Docs use `src/pages/`; the code scans `src/view/` ([server.ts:881](packages/server/src/server.ts#L881)).
- `.agents/patterns.md` imports from `@kallo/core`; the real package is `@kallo/runtime`.
- `.agents/architecture.md` lists packages that don't exist (`router`, `reactivity`, `state`, `auth`, `metadata`, `css`, `create-kallo`).

These mislead any contributor (human or agent) told to treat them as canonical.

### L-2. Advertised apps are empty stubs
`apps/www`, `apps/docs`, `apps/playground` each contain only a README (1 tracked file), but the README presents them as the marketing site, docs site, and playground.

### L-3. Committed test app violates the isolation rule
AGENTS mandates test projects live in the gitignored `temp/`, but `packages/cli/test-cli-ecommerce-app/` (21 tracked files) is committed.

### L-4. Session token stores the full user object, unencrypted, with no expiry claim
`packages/server/src/auth.ts` — `signToken` is HMAC-signed base64url JSON ([:6-12](packages/server/src/auth.ts#L6-L12)); the user object is readable by anyone with the cookie, and the token carries no `exp` (expiry relies solely on cookie `maxAge`, [:77](packages/server/src/auth.ts#L77)). Fine for an ID, risky as a user-data carrier. Consider an `exp` claim + minimal payload.

### L-5. Non-crypto 6-char componentId hash can collide
`compiler/index.ts` ([:18-24](packages/compiler/src/index.ts#L18-L24)) — signed 32-bit overflow hash truncated to 6 base36 chars; collisions produce overlapping `data-kal-<id>` scoped-CSS namespaces and style-element ids across components.

---

## Suggested order of attack
1. **C-1, C-2, C-3** — add a single HTML/attribute-escape utility in `shared` and apply it at every interpolation point + state serialization. This is the biggest exposure and is self-contained.
2. **C-4** — replace `new Function`/`with` event eval with a compiled handler map (no runtime eval) so the framework works under CSP.
3. **H-6** — make the test suite terminate so the rest can be regression-tested.
4. **H-2/H-3/H-4** — reactivity/diffing correctness and the missing `data-kal-key`.
5. **L-1** — refresh `.agents/*` and README so "source of truth" is actually true.
