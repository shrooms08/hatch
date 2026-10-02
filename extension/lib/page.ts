/**
 * Reading the page. Text extraction and the focal-tweet picker are ported from GLANCE's
 * lib/adapters.ts (visibleText, readableText, statusIdOf, pickFocalTweet); the rest is Hatch's.
 */
import type { PageContext } from "./types";
import { detectFromDom } from "./detect";

export const PAGE_TEXT_MAX = 6000;
const MAX_IMAGES = 8;

export function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > -window.innerHeight && r.top < window.innerHeight * 2 && r.width > 0 && r.height > 0;
}

const BLOCKS = "h1,h2,h3,p,li,blockquote,figcaption,td,[data-testid='tweetText'],span[dir]";
const SKIP = "nav,footer,aside,[role='navigation'],[aria-hidden='true'],hatch-egg";

/** Text of block elements near the viewport, nearest first, capped (GLANCE). */
export function visibleText(root: ParentNode = document.body, cap = 4000): string {
  const mid = window.innerHeight / 2;
  const scored = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS))
    .filter((el) => isVisible(el) && !el.closest(SKIP))
    .map((el) => ({ el, d: Math.abs(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 - mid) }))
    .sort((a, b) => a.d - b.d);
  const seen = new Set<string>();
  let out = "";
  for (const { el } of scored) {
    const t = clean(el.innerText);
    if (t.length < 3 || seen.has(t)) continue;
    seen.add(t);
    if (out.length + t.length + 1 > cap) break;
    out += (out ? "\n" : "") + t;
  }
  return out || clean(document.body?.innerText).slice(0, cap);
}

/** Whole readable text in document order after `seed`, capped (GLANCE). */
export function readableText(cap: number, root: ParentNode = document.querySelector("article, main, [role='main']") ?? document.body, seed = ""): string {
  const seen = new Set<string>(seed ? seed.split("\n") : []);
  let out = seed;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(BLOCKS))) {
    if (el.closest(SKIP)) continue;
    const t = clean(el.innerText);
    if (t.length < 3 || seen.has(t)) continue;
    seen.add(t);
    if (out.length + t.length + 1 > cap) break;
    out += (out ? "\n" : "") + t;
  }
  return out || clean(document.body?.innerText).slice(0, cap);
}

export function meta(name: string): string | undefined {
  const el = document.querySelector<HTMLMetaElement>(`meta[property='${name}'], meta[name='${name}'], meta[itemprop='${name}']`);
  return el?.content || undefined;
}

/** Status id in an X href or pathname (`/user/status/123` -> "123"), or null (GLANCE). */
export function statusIdOf(href: string | null | undefined): string | null {
  const m = href?.match(/\/status\/(\d+)/);
  return m ? m[1]! : null;
}

/** The tweet a page is about: the URL's status, else the one nearest the viewport centre (GLANCE). */
export function pickFocalTweet<T extends { statusId: string | null; top: number; height: number; visible: boolean }>(
  tweets: T[],
  mid: number,
  pageStatusId: string | null,
): T | undefined {
  if (pageStatusId) {
    const focal = tweets.find((t) => t.statusId === pageStatusId);
    if (focal) return focal;
  }
  return tweets
    .filter((t) => t.visible)
    .sort((a, b) => Math.abs(a.top + a.height / 2 - mid) - Math.abs(b.top + b.height / 2 - mid))[0];
}

export type TweetInfo = { text: string; author: string | null; url: string; images: string[] };

export function readTweet(): TweetInfo | null {
  const tweets = Array.from(document.querySelectorAll<HTMLElement>("article[data-testid='tweet']")).map((el) => {
    const r = el.getBoundingClientRect();
    return { el, statusId: statusIdOf(el.querySelector<HTMLAnchorElement>("a[href*='/status/']")?.getAttribute("href")), top: r.top, height: r.height, visible: isVisible(el) };
  });
  const t = pickFocalTweet(tweets, window.innerHeight / 2, statusIdOf(location.pathname))?.el;
  if (!t) return null;
  const text = clean(t.querySelector<HTMLElement>("[data-testid='tweetText']")?.innerText);
  const handle = clean(t.querySelector<HTMLElement>("[data-testid='User-Name'] a[href^='/'] span")?.textContent) || null;
  const author = handle ?? (location.pathname.split("/")[1] ? `@${location.pathname.split("/")[1]}` : null);
  const images = Array.from(t.querySelectorAll<HTMLImageElement>("[data-testid='tweetPhoto'] img, img[src*='pbs.twimg.com/media']"))
    .map((i) => i.src)
    .filter((u) => /^https:\/\//.test(u));
  return { text, author, url: location.href, images: [...new Set(images)] };
}

function absoluteHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u, location.href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Candidate images: tweet media, og/twitter images, then large images in the article. */
export function pageImages(extra: string[] = []): string[] {
  const out: string[] = [];
  const add = (u: string | null | undefined) => {
    const abs = absoluteHttpUrl(u);
    if (abs && !out.includes(abs) && out.length < MAX_IMAGES) out.push(abs);
  };
  extra.forEach(add);
  add(meta("og:image"));
  add(meta("twitter:image"));
  const root = document.querySelector("article, main, [role='main']") ?? document.body;
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
    if (img.naturalWidth >= 200 && img.naturalHeight >= 120 && !img.closest(SKIP)) add(img.currentSrc || img.src);
  }
  return out;
}

/** Everything the side panel sends to /api/buddy/draft. */
export function collectPageContext(): PageContext {
  const detected = detectFromDom();
  const tweet = detected.kind === "tweet" ? readTweet() : null;
  const title = (tweet ? `${tweet.author ?? "Post"}: ${tweet.text.slice(0, 120)}` : meta("og:title")) ?? document.title;
  const description = meta("og:description");
  const root = document.querySelector("article, main, [role='main']") ?? document.body;
  const body = tweet
    ? [tweet.author ? `Author: ${tweet.author}` : "", tweet.text].filter(Boolean).join("\n")
    : readableText(PAGE_TEXT_MAX, root, visibleText(root));
  const text = [description && !body.includes(description) ? description : "", body].filter(Boolean).join("\n").slice(0, PAGE_TEXT_MAX);
  return {
    url: location.href,
    title: clean(title).slice(0, 300),
    text,
    images: pageImages(tweet?.images ?? []),
    detected: { kind: detected.kind, tickers: detected.tickers },
  };
}
