interface CacheEntry {
  value: unknown;
  expiresAt: number;
  tags: string[];
}

export interface CacheOptions {
  revalidate?: number;
  tags?: string[];
}

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function now(): number {
  return Date.now();
}

/**
 * $cache — memoizes an async data loader with TTL + tag-based invalidation.
 * Concurrent calls for the same key share a single in-flight promise
 * (request coalescing), so a $page does not over-fetch.
 *
 * Usage:
 *   const tasks = await $cache("tasks:all", () => db.tasks.all(), {
 *     revalidate: 60,
 *     tags: ["tasks"],
 *   });
 */
export async function $cache<T>(
  key: string,
  loader: () => Promise<T> | T,
  options: CacheOptions = {},
): Promise<T> {
  const entry = store.get(key);
  if (entry && entry.expiresAt > now()) {
    return entry.value as T;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      const value = await loader();
      const ttlMs =
        options.revalidate !== undefined ? options.revalidate * 1000 : 0;
      store.set(key, {
        value,
        expiresAt: ttlMs > 0 ? now() + ttlMs : Infinity,
        tags: options.tags ?? [],
      });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * $revalidate — evicts cached entries by exact key or by tag.
 * Call this from a $action after a mutation so subsequent reads refetch.
 *
 * Usage:
 *   $revalidate("tasks");          // by tag
 *   $revalidate({ key: "tasks:all" });
 */
export function $revalidate(target: string | { key: string }): number {
  if (typeof target === "object") {
    return store.delete(target.key) ? 1 : 0;
  }

  let removed = 0;
  for (const [key, entry] of store) {
    if (entry.tags.includes(target)) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}

export function clearCache(): void {
  store.clear();
  inflight.clear();
}

export function cacheSize(): number {
  return store.size;
}
