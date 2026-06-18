/**
 * Canonical Kallo language metadata for the editor tooling.
 *
 * This MUST stay in sync with `packages/shared/src/constants.ts`. The editor
 * deliberately does not import the framework parser at runtime (it must tolerate
 * incomplete/invalid documents the parser would throw on), so these lists are
 * mirrored here. See AGENTS.md ("Editor tooling") for the sync rule.
 */

export const SFC_EXTENSION = ".kal";

export type BlockName = "Server" | "Client" | "View" | "Style" | "Head";

export const BLOCK_NAMES: readonly BlockName[] = [
  "Server",
  "Client",
  "View",
  "Style",
  "Head",
];

/** Blocks that may appear at most once in a single-file component. */
export const SINGLETON_BLOCKS: readonly BlockName[] = [
  "Server",
  "Client",
  "View",
  "Style",
  "Head",
];

/** Embedded language each block maps to. */
export const BLOCK_LANGUAGE: Record<BlockName, "ts" | "css" | "html"> = {
  Server: "ts",
  Client: "ts",
  View: "html",
  Style: "css",
  Head: "ts",
};

/** Kallo-specific template tags usable inside <View>. */
export const VIEW_TAGS: readonly string[] = [
  "Each",
  "When",
  "Show",
  "Else",
  "Slot",
  "Portal",
  "Image",
  "Suspense",
  "Boundary",
];

/** Attribute-directive prefixes recognised in <View>. */
export const DIRECTIVE_PREFIXES = [":", "@", "#"] as const;

export interface KeywordDoc {
  name: string;
  scope: "server" | "client";
  detail: string;
  doc: string;
  /** A completion insert template (LSP snippet syntax). */
  snippet?: string;
}

/**
 * Public `$keyword` APIs surfaced in completion + hover. Internal/compiler-only
 * symbols (e.g. `$serverPage`, `$scope`) are intentionally omitted.
 */
export const KEYWORDS: readonly KeywordDoc[] = [
  {
    name: "$page",
    scope: "server",
    detail: "$page(handler)",
    doc: "Defines the server data loader for this route. Returns props passed to `<View>`/`<Client>`.",
    snippet: "$page(async ({ params }) => {\n\t$1\n\treturn { $2 };\n});",
  },
  {
    name: "$layout",
    scope: "server",
    detail: "$layout(handler)",
    doc: "Defines a layout's server loader. Props are shared with nested routes.",
  },
  {
    name: "$meta",
    scope: "server",
    detail: "$meta(props => MetaObject)",
    doc: "SSR-safe `<head>` metadata (title, description, canonical, og tags).",
    snippet: "$meta(({ $1 }) => ({\n\ttitle: $2,\n}));",
  },
  {
    name: "$static",
    scope: "server",
    detail: "$static({ revalidate })",
    doc: "Marks a route as static/ISR with optional `revalidate` TTL (seconds).",
  },
  {
    name: "$action",
    scope: "server",
    detail: "$action(handler)",
    doc: "Defines a server action (form/RPC endpoint) with CSRF + validation support.",
    snippet: "$action(async ({ input }) => {\n\t$1\n});",
  },
  {
    name: "$validate",
    scope: "server",
    detail: "$validate(schema)",
    doc: "Validates action/request input using `$rule.*` rules. Throws `ValidationError`.",
  },
  {
    name: "$rule",
    scope: "server",
    detail: "$rule.string() | $rule.number() | …",
    doc: "Validation rule builders consumed by `$validate`.",
  },
  {
    name: "$cache",
    scope: "server",
    detail: "$cache(key, loader, { ttl })",
    doc: "Server-side data cache with TTL and request coalescing.",
  },
  {
    name: "$revalidate",
    scope: "server",
    detail: "$revalidate(keyOrTag)",
    doc: "Invalidates cached data by key or tag.",
  },
  {
    name: "$csrf",
    scope: "server",
    detail: "$csrf()",
    doc: "Issues/validates CSRF tokens for actions and forms.",
  },
  {
    name: "$securityHeaders",
    scope: "server",
    detail: "$securityHeaders(options)",
    doc: "Applies security response headers (CSP, HSTS, etc.).",
  },
  {
    name: "$rateLimit",
    scope: "server",
    detail: "$rateLimit({ limit, window })",
    doc: "Rate-limits a route/action using the configured store.",
  },
  {
    name: "$uploads",
    scope: "server",
    detail: "$uploads(options)",
    doc: "Configures multipart upload handling for an action.",
  },
  {
    name: "$file",
    scope: "server",
    detail: "$file(name)",
    doc: "Reads a single uploaded file from the current action context.",
  },
  {
    name: "$files",
    scope: "server",
    detail: "$files(name)",
    doc: "Reads multiple uploaded files from the current action context.",
  },
  {
    name: "$router",
    scope: "server",
    detail: "$router()",
    doc: "Creates an Express-compatible router for `*.api.ts` endpoints.",
  },
  {
    name: "$guard",
    scope: "server",
    detail: "$guard(handler)",
    doc: "Route guard that runs before the loader; redirect or abort to deny access.",
  },
  {
    name: "$requireAuth",
    scope: "server",
    detail: "$requireAuth()",
    doc: "Guard that requires an authenticated session.",
  },
  {
    name: "$roles",
    scope: "server",
    detail: "$roles(...roles)",
    doc: "Guard that requires the session to hold one of the given roles.",
  },
  {
    name: "$auth",
    scope: "server",
    detail: "$auth()",
    doc: "Returns the current auth/session context on the server.",
  },
  {
    name: "$currentUser",
    scope: "server",
    detail: "$currentUser()",
    doc: "Returns the authenticated user for the current request, if any.",
  },
  {
    name: "$abort",
    scope: "server",
    detail: "$abort(status, message?)",
    doc: "Aborts rendering with an HTTP status (e.g. `$abort(404)`).",
  },
  {
    name: "$redirect",
    scope: "server",
    detail: "$redirect(location, status?)",
    doc: "Performs a server-side redirect.",
  },
  {
    name: "$env",
    scope: "server",
    detail: "$env(schema)",
    doc: "Typed, validated environment variables. `PUBLIC_`-prefixed values are client-exposed.",
  },
  {
    name: "$channel",
    scope: "server",
    detail: "$channel(name)",
    doc: "Server realtime channel; `.publish(value)` streams to subscribers (SSE).",
  },
  {
    name: "$pwa",
    scope: "server",
    detail: "$pwa(options)",
    doc: "Configures PWA manifest and service worker generation.",
  },
  {
    name: "$local",
    scope: "client",
    detail: "$local(initial)",
    doc: "Component-local reactive state. Access via `.value`.",
    snippet: "$local($1)",
  },
  {
    name: "$store",
    scope: "client",
    detail: "$store(definition)",
    doc: "Defines a global reactive store with state and methods.",
  },
  {
    name: "$use",
    scope: "client",
    detail: "$use(store)",
    doc: "Subscribes the component to a `$store` and returns its reactive instance.",
  },
  {
    name: "$watch",
    scope: "client",
    detail: "$watch(source, callback)",
    doc: "Runs a callback when reactive dependencies change.",
    snippet: "$watch(() => $1, ($2) => {\n\t$3\n});",
  },
  {
    name: "$effect",
    scope: "client",
    detail: "$effect(callback)",
    doc: "Runs a side effect that re-executes when its reactive dependencies change.",
    snippet: "$effect(() => {\n\t$1\n});",
  },
  {
    name: "$computed",
    scope: "client",
    detail: "$computed(getter)",
    doc: "Derived reactive value recomputed from its dependencies.",
    snippet: "$computed(() => $1)",
  },
  {
    name: "$batch",
    scope: "client",
    detail: "$batch(callback)",
    doc: "Batches multiple reactive updates into a single flush.",
  },
  {
    name: "$model",
    scope: "client",
    detail: "$model(state)",
    doc: "Two-way binding helper for form inputs (text/checkbox/radio/select/textarea).",
  },
  {
    name: "$subscribe",
    scope: "client",
    detail: "$subscribe(channel)",
    doc: "Client subscription to a server `$channel` as reactive state.",
  },
  {
    name: "$mount",
    scope: "client",
    detail: "$mount(callback)",
    doc: "Lifecycle hook that runs after the component mounts on the client.",
    snippet: "$mount(() => {\n\t$1\n});",
  },
  {
    name: "$destroy",
    scope: "client",
    detail: "$destroy(callback)",
    doc: "Lifecycle hook that runs when the component is destroyed.",
  },
];

export const KEYWORD_NAMES: readonly string[] = KEYWORDS.map((k) => k.name);

export function keywordByName(name: string): KeywordDoc | undefined {
  return KEYWORDS.find((k) => k.name === name);
}
