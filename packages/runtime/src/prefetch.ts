type PrefetchData = unknown;

interface FetchLike {
  (
    input: string,
    init?: { headers?: Record<string, string> },
  ): Promise<{ ok: boolean; json: () => Promise<unknown> }>;
}

const prefetchCache = new Map<string, Promise<PrefetchData>>();

export function isInternalHref(href: string | null): href is string {
  return !!href && href.startsWith("/") && !href.startsWith("//");
}

/**
 * shouldPrefetch — prefetching is on by default for internal links; an author
 * opts out per-link with prefetch="none" (or prefetch="false").
 */
export function shouldPrefetch(el: {
  getAttribute: (name: string) => string | null;
}): boolean {
  const mode = el.getAttribute("prefetch");
  if (mode === "none" || mode === "false") return false;
  return true;
}

/**
 * prefetch — warms the SPA navigation cache for an internal href by fetching
 * its route payload once. Repeated calls reuse the same in-flight promise.
 */
export function prefetch(href: string): Promise<PrefetchData> | undefined {
  if (!isInternalHref(href)) return undefined;
  const existing = prefetchCache.get(href);
  if (existing) return existing;

  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof f !== "function") return undefined;

  const p = f(href, { headers: { "X-Kallo-Navigation": "true" } })
    .then((res) => (res && res.ok ? res.json() : null))
    .catch(() => null);
  prefetchCache.set(href, p);
  return p;
}

export function getPrefetched(href: string): Promise<PrefetchData> | undefined {
  return prefetchCache.get(href);
}

export function consumePrefetched(
  href: string,
): Promise<PrefetchData> | undefined {
  const p = prefetchCache.get(href);
  if (p) prefetchCache.delete(href);
  return p;
}

export function clearPrefetchCache(): void {
  prefetchCache.clear();
}
