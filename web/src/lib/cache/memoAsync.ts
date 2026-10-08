/**
 * Caches a promise per key, but only successes: a rejected promise is dropped from the cache and the
 * error is rethrown, so a transient RPC failure is retried on the next call instead of being cached.
 */
export function memoAsync<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit;
  const p = load().catch((e) => {
    if (cache.get(key) === p) cache.delete(key);
    throw e;
  });
  cache.set(key, p);
  return p;
}
