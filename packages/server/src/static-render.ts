export interface StaticRenderConfig {
  revalidate?: number;
}

export type StaticCacheStatus = "MISS" | "HIT" | "STALE";

export interface StaticResult {
  html: string;
  status: StaticCacheStatus;
}

interface StaticEntry {
  html: string;
  expiresAt: number;
}

/**
 * StaticRenderStore — the ISR engine behind statically-rendered routes. Caches
 * full HTML per key with a TTL. Fresh entries are served as HIT; expired entries
 * are served immediately as STALE while a single background re-render refreshes
 * the cache (stale-while-revalidate). A missing entry blocks on the producer.
 *
 * `revalidate` undefined => render once and serve forever (pure static).
 */
export class StaticRenderStore {
  private cache = new Map<string, StaticEntry>();
  private inflight = new Map<string, Promise<string>>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private ttlMs(config: StaticRenderConfig): number {
    return config.revalidate !== undefined
      ? config.revalidate * 1000
      : Infinity;
  }

  async render(
    key: string,
    producer: () => Promise<string> | string,
    config: StaticRenderConfig = {},
  ): Promise<StaticResult> {
    const entry = this.cache.get(key);
    const ttl = this.ttlMs(config);

    if (entry) {
      if (entry.expiresAt > this.now()) {
        return { html: entry.html, status: "HIT" };
      }
      // Stale: serve immediately, refresh in the background (coalesced).
      if (ttl !== Infinity) {
        this.revalidate(key, producer, ttl);
      }
      return { html: entry.html, status: "STALE" };
    }

    const html = await this.produce(key, producer, ttl);
    return { html, status: "MISS" };
  }

  private produce(
    key: string,
    producer: () => Promise<string> | string,
    ttl: number,
  ): Promise<string> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const html = await producer();
        this.cache.set(key, {
          html,
          expiresAt: ttl === Infinity ? Infinity : this.now() + ttl,
        });
        return html;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  private revalidate(
    key: string,
    producer: () => Promise<string> | string,
    ttl: number,
  ): void {
    if (this.inflight.has(key)) return;
    void this.produce(key, producer, ttl).catch(() => {
      // A failed background revalidation keeps serving the stale entry.
    });
  }

  getFresh(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > this.now()) {
      return entry.html;
    }
    return undefined;
  }

  set(key: string, html: string, config: StaticRenderConfig = {}): void {
    const ttl = this.ttlMs(config);
    this.cache.set(key, {
      html,
      expiresAt: ttl === Infinity ? Infinity : this.now() + ttl,
    });
  }

  whenIdle(key: string): Promise<unknown> {
    return this.inflight.get(key) ?? Promise.resolve();
  }

  peek(key: string): string | undefined {
    return this.cache.get(key)?.html;
  }

  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const staticStore = new StaticRenderStore();

export function clearStaticCache(): void {
  staticStore.clear();
}

/**
 * $static — declares a route statically rendered (SSG) with optional ISR
 * revalidation. Place it in a page's <Server> block; the compiler exports it as
 * `$serverStatic` and the SSR pipeline serves cached HTML accordingly.
 *
 * Usage (in a <Server> block):
 *   $static({ revalidate: 3600 });   // regenerate at most hourly
 *   $static({});                      // fully static, render once
 */
export function $static(config: StaticRenderConfig): StaticRenderConfig {
  return config;
}
