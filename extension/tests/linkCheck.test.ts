import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalize, linkIdHash, lookupPrefix } from "../lib/linkCanonical";
import { LINK_CACHE_MS, LINK_DEBOUNCE_MS, createLinkLookup, createUrlWatcher, httpFetchPrefix, linkStatusOf, linkTarget, type LookupEntry } from "../lib/linkCheck";
import { DEFAULT_SETTINGS } from "../lib/storage";
import { pickLinkBase } from "../lib/config";

const off = { checkAnyWebsite: false };
const on = { checkAnyWebsite: true };

describe("link blocklist (shared with the web app)", () => {
  it("is byte-for-byte the web app's module", () => {
    const here = readFileSync(fileURLToPath(new URL("../lib/linkBlocklist.ts", import.meta.url)), "utf8");
    const web = readFileSync(fileURLToPath(new URL("../../web/src/lib/links/blocklist.ts", import.meta.url)), "utf8");
    expect(here).toBe(web);
  });
});

describe("which pages are checked", () => {
  it("tweets, YouTube videos and GitHub repos by default", () => {
    expect(linkTarget("https://x.com/jack/status/20", off)?.canonicalId).toBe("x:status:20");
    expect(linkTarget("https://twitter.com/jack/status/20?s=20", off)?.canonicalId).toBe("x:status:20");
    expect(linkTarget("https://www.youtube.com/watch?v=jNQXAC9IVRw&t=4", off)?.canonicalId).toBe("yt:video:jNQXAC9IVRw");
    expect(linkTarget("https://youtu.be/jNQXAC9IVRw", off)?.canonicalId).toBe("yt:video:jNQXAC9IVRw");
    expect(linkTarget("https://github.com/MeteoraAg/dynamic-bonding-curve/tree/main", off)?.canonicalId).toBe("gh:repo:meteoraag/dynamic-bonding-curve");
  });

  it("not the platforms' other pages", () => {
    for (const u of ["https://x.com/home", "https://x.com/jack", "https://www.youtube.com/", "https://www.youtube.com/@jawed", "https://github.com/", "https://github.com/MeteoraAg"])
      expect(linkTarget(u, off), u).toBeNull();
  });

  it('"Check any website" is off by default, so ordinary pages are never looked up', () => {
    expect(DEFAULT_SETTINGS.checkAnyWebsite).toBe(false);
    expect(linkTarget("https://www.bbc.com/news/articles/abc123", { checkAnyWebsite: DEFAULT_SETTINGS.checkAnyWebsite })).toBeNull();
    expect(linkTarget("https://www.bbc.com/news/articles/abc123", on)?.canonicalId).toBe("web:bbc.com/news/articles/abc123");
  });

  it("never blocklisted links or titles, never non-web URLs", () => {
    expect(linkTarget("https://pornhub.com/view_video.php?viewkey=1", on)).toBeNull();
    expect(linkTarget("https://www.youtube.com/watch?v=jNQXAC9IVRw", { ...off, title: "Funeral livestream - YouTube" })).toBeNull();
    expect(linkTarget("chrome://extensions", on)).toBeNull();
    expect(linkTarget("file:///Users/me/a.html", on)).toBeNull();
  });
});

describe("URL change detection (single-page apps)", () => {
  afterEach(() => vi.useRealTimers());

  it(`fires once, ${LINK_DEBOUNCE_MS} ms after the URL settles; ignores hash-only and unchanged URLs`, () => {
    vi.useFakeTimers();
    let url = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
    const seen: string[] = [];
    const w = createUrlWatcher({ read: () => url, onChange: (u) => seen.push(u) });
    w.poll();
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual([]); // nothing changed

    url = "https://www.youtube.com/watch?v=aaaaaaaaaaa#comments";
    w.poll();
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual([]); // hash only

    url = "https://www.youtube.com/watch?v=bbbbbbbbbbb";
    w.poll();
    vi.advanceTimersByTime(300);
    url = "https://www.youtube.com/watch?v=ccccccccccc"; // clicked through quickly
    w.poll();
    vi.advanceTimersByTime(LINK_DEBOUNCE_MS - 1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["https://www.youtube.com/watch?v=ccccccccccc"]);
  });

  it("stop() cancels a pending change", () => {
    vi.useFakeTimers();
    let url = "https://x.com/a/status/1";
    const onChange = vi.fn();
    const w = createUrlWatcher({ read: () => url, onChange });
    url = "https://x.com/a/status/2";
    w.poll();
    w.stop();
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalled();
  });
});

const entry = (h: string, over: Partial<LookupEntry> = {}): LookupEntry => ({ h, status: "hatched", mint: "Mint1111111111111111111111111111111111111111", ticker: "MZ", name: "Me at the zoo", progress: 0.01, claimed: false, ...over });

describe("private lookup", () => {
  it("only the 8-hex prefix leaves: no URL, no canonical id, no full hash", async () => {
    const pageUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    const id = canonicalize(pageUrl).canonicalId;
    const hash = await linkIdHash(id);
    const calls: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([entry(hash)]), { status: 200 });
    }) as unknown as typeof fetch;
    const lookup = createLinkLookup({ fetchPrefix: httpFetchPrefix("http://localhost:3200", fakeFetch) });
    expect(await lookup(id)).toEqual({ state: "coin", mint: entry(hash).mint, ticker: "MZ", name: "Me at the zoo", claimed: false });

    expect(calls).toHaveLength(1);
    const sent = calls[0]!;
    expect(sent.url).toBe(`http://localhost:3200/api/links/lookup?p=${lookupPrefix(hash)}`);
    expect(sent.init?.body).toBeUndefined();
    expect(sent.init?.credentials).toBe("omit");
    const wire = `${sent.url} ${JSON.stringify(sent.init ?? {})}`;
    for (const secret of [pageUrl, "jNQXAC9IVRw", id, hash, hash.slice(0, 9)]) expect(wire).not.toContain(secret);
  });

  it("matches the full hash locally: a prefix sibling is not our coin", async () => {
    const id = "yt:video:jNQXAC9IVRw";
    const hash = await linkIdHash(id);
    const sibling = `${hash.slice(0, 8)}${"0".repeat(56)}`;
    const lookup = createLinkLookup({ fetchPrefix: async () => [entry(sibling)] });
    expect(await lookup(id)).toEqual({ state: "none" });
  });

  it(`caches answers per prefix for ${LINK_CACHE_MS / 1000} s`, async () => {
    let t = 1_000_000;
    const fetchPrefix = vi.fn(async () => [] as LookupEntry[]);
    const lookup = createLinkLookup({ fetchPrefix, now: () => t });
    await lookup("x:status:20");
    await lookup("x:status:20");
    t += LINK_CACHE_MS - 1;
    await lookup("x:status:20");
    expect(fetchPrefix).toHaveBeenCalledTimes(1);
    t += 1;
    await lookup("x:status:20");
    expect(fetchPrefix).toHaveBeenCalledTimes(2);
    await lookup("x:status:21"); // another prefix
    expect(fetchPrefix).toHaveBeenCalledTimes(3);
  });

  it("a failed lookup shows nothing (null), and is not retried within the cache window", async () => {
    const fails = [
      (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch, // links off (mainnet today)
      (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch, // rate limited
      (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch, // offline
      (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch, // not JSON
      (async () => new Response('{"error":"x"}', { status: 200 })) as unknown as typeof fetch, // not a list
    ];
    for (const f of fails) {
      const spy = vi.fn(f);
      const lookup = createLinkLookup({ fetchPrefix: httpFetchPrefix("https://hatchem.fun", spy as unknown as typeof fetch) });
      expect(await lookup("yt:video:jNQXAC9IVRw")).toBeNull();
      expect(await lookup("yt:video:jNQXAC9IVRw")).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it("states: no entry = no coin yet; hatched/claimed = coin; being hatched or disowned = nothing", () => {
    expect(linkStatusOf(null)).toEqual({ state: "none" });
    expect(linkStatusOf(entry("a", { claimed: true, status: "claimed" }))).toMatchObject({ state: "coin", claimed: true });
    expect(linkStatusOf(entry("a", { status: "reserved", mint: null }))).toBeNull();
    expect(linkStatusOf(entry("a", { status: "disowned" }))).toBeNull();
  });
});

describe("web app for link features", () => {
  const prod = "https://hatchem.fun";
  const dev = ["http://localhost:3200"];
  it("release builds (no dev URLs) always use the build's web app, whatever is stored", () => {
    for (const choice of [null, undefined, "http://localhost:3200", prod, "https://evil.example"]) expect(pickLinkBase(choice, prod, [])).toBe(prod);
  });
  it("dev builds default to the local server; the choice sticks; anything else falls back", () => {
    expect(pickLinkBase(null, prod, dev)).toBe("http://localhost:3200");
    expect(pickLinkBase(prod, prod, dev)).toBe(prod);
    expect(pickLinkBase("http://localhost:3200", prod, dev)).toBe("http://localhost:3200");
    expect(pickLinkBase("https://evil.example", prod, dev)).toBe("http://localhost:3200");
  });
});
