/**
 * Link coins in the extension: is there a coin for the page the user is on?
 *   - linkTarget: which pages are checked at all (tweets, YouTube videos and GitHub repos; any other web page only
 *     with the "Check any website" setting, off by default; never blocklisted links).
 *   - createUrlWatcher: notices URL changes on single-page apps (x.com, youtube.com), debounced.
 *   - createLinkLookup: private lookup. The canonical id is hashed here and ONLY the first 8 hex characters of the
 *     hash are sent (GET /api/links/lookup?p=); the full hash is matched locally. Never the URL, never the full hash.
 *     Answers are cached per prefix for 60 s; any failure (network, 404 where links are off, 429) is null:
 *     the buddy then shows nothing.
 */
import { canonicalize, linkIdHash, lookupPrefix, matchLookup, type CanonicalLink } from "./linkCanonical";
import { checkBlocked } from "./linkBlocklist";

export const LINK_DEBOUNCE_MS = 500;
export const LINK_CACHE_MS = 60_000;

/** The page's link if this page should be checked, else null. */
export function linkTarget(url: string, opts: { checkAnyWebsite: boolean; title?: string | null }): CanonicalLink | null {
  let link: CanonicalLink;
  try {
    link = canonicalize(url);
  } catch {
    return null; // not http(s), a profile/home page, too long, ...
  }
  if (link.kind === "web_page" && !opts.checkAnyWebsite) return null;
  if (checkBlocked({ host: link.host, texts: [opts.title] })) return null;
  return link;
}

/**
 * Calls onChange(url) once the URL has stayed the same for `debounceMs` after a change. `poll()` is called on an
 * interval (and on popstate); content scripts cannot hook the page's own history.pushState.
 */
export function createUrlWatcher(opts: {
  read: () => string;
  onChange: (url: string) => void;
  debounceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}) {
  const debounceMs = opts.debounceMs ?? LINK_DEBOUNCE_MS;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const norm = (u: string) => u.split("#")[0]!;
  let seen = norm(opts.read()); // the latest URL observed
  let timer: unknown = null;
  return {
    poll() {
      const now = norm(opts.read());
      if (now === seen) return;
      seen = now;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        opts.onChange(seen);
      }, debounceMs);
    },
    stop() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

export type LookupEntry = { h: string; status: string; mint: string | null; ticker: string | null; name: string | null; progress: number | null; claimed: boolean };
/** none: no coin for this link yet. coin: hatched (or claimed by the owner). */
export type LinkStatus = { state: "none" } | { state: "coin"; mint: string; ticker: string | null; name: string | null; claimed: boolean };

/** What one entry (or its absence) means for the buddy. Reserved (being hatched right now) or disowned: nothing (null). */
export function linkStatusOf(entry: LookupEntry | null): LinkStatus | null {
  if (!entry) return { state: "none" };
  if ((entry.status === "hatched" || entry.status === "claimed") && entry.mint) return { state: "coin", mint: entry.mint, ticker: entry.ticker, name: entry.name, claimed: entry.claimed };
  return null;
}

/**
 * fetchPrefix(prefix) GETs /api/links/lookup?p=<prefix> and returns the entries, or throws. It is the ONLY thing
 * that leaves the browser, and it only ever receives the 8-hex prefix.
 */
export function createLinkLookup(opts: { fetchPrefix: (prefix: string) => Promise<LookupEntry[]>; now?: () => number; ttlMs?: number }) {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? LINK_CACHE_MS;
  // Failures are cached too (as null), so an API that is off or rate limiting is not asked again for a minute.
  const cache = new Map<string, { at: number; entries: Promise<LookupEntry[] | null> }>();
  return async function lookup(canonicalId: string): Promise<LinkStatus | null> {
    const hash = await linkIdHash(canonicalId);
    const prefix = lookupPrefix(hash);
    let hit = cache.get(prefix);
    if (!hit || now() - hit.at >= ttl) {
      hit = { at: now(), entries: opts.fetchPrefix(prefix).then((e) => (Array.isArray(e) ? e : null)).catch(() => null) };
      cache.set(prefix, hit);
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
    }
    const entries = await hit.entries;
    if (!entries) return null;
    return linkStatusOf(matchLookup(entries, hash));
  };
}

/** GET <base>/api/links/lookup?p=<prefix>: no body, no cookies. Throws on any non-200 (links off: 404; 429). */
export function httpFetchPrefix(base: string, fetchImpl: typeof fetch = fetch) {
  return async (prefix: string): Promise<LookupEntry[]> => {
    if (!/^[0-9a-f]{8}$/.test(prefix)) throw new Error("bad prefix");
    const res = await fetchImpl(`${base}/api/links/lookup?p=${prefix}`, { credentials: "omit", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LookupEntry[];
  };
}
