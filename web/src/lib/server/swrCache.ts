// Server-only: a tiny stale-while-revalidate cache for chain reads behind API routes.
//  - fresh for `ttlMs`; one upstream load at a time per key (concurrent callers share it)
//  - if a load fails, the last good value is served (stale) instead of an error
//  - an error is thrown only when there has never been a good value for the key
// Per server instance (memory); the CDN in front (s-maxage + stale-while-revalidate) absorbs most traffic.

type Entry<T> = { value: T; at: number; retryAt?: number };

/** After a failed refresh, keep serving the stale value this long before trying upstream again. */
const RETRY_AFTER_MS = 10_000;

const entries = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_KEYS = 5000;

export type Cached<T> = { value: T; at: number; stale: boolean };

export async function swr<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  opts: { /** Keep a value out of the cache (it is still returned). */ store?: (v: T) => boolean } = {}
): Promise<Cached<T>> {
  const hit = entries.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return { value: hit.value, at: hit.at, stale: false };
  if (hit?.retryAt && Date.now() < hit.retryAt) return { value: hit.value, at: hit.at, stale: true };

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const value = await p;
    const at = Date.now();
    if (opts.store?.(value) !== false) {
      entries.set(key, { value, at });
      if (entries.size > MAX_KEYS) entries.delete(entries.keys().next().value!);
    }
    return { value, at, stale: false };
  } catch (e) {
    if (hit) {
      console.warn(`swr ${key.split(':')[0]}: serving stale value after upstream error:`, e instanceof Error ? e.message : e);
      hit.retryAt = Date.now() + RETRY_AFTER_MS;
      return { value: hit.value, at: hit.at, stale: true };
    }
    throw e;
  }
}

/** For tests. */
export function _resetSwr() {
  entries.clear();
  inflight.clear();
}
