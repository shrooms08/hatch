/**
 * Cheap local page detection: no network calls. Decides whether a page is worth asking the AI
 * about (flagged) and extracts stock tickers. Pure URL/text helpers are unit-tested.
 */
import type { PageKind } from "./types";

export type Detection = { kind: PageKind; tickers: string[]; flagged: boolean; reason: string };

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;
/** Cashtags that are currencies/crypto/noise rather than stocks. */
const NOT_STOCKS = new Set(["USD", "USDC", "USDT", "EUR", "GBP", "JPY", "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AI", "CEO", "IPO"]);

function normTicker(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = decodeURIComponent(raw).toUpperCase().replace(/^\$/, "").trim();
  return TICKER_RE.test(t) ? t : null;
}

/** Tickers from known stock-page URLs (Yahoo Finance, Google Finance, TradingView). */
export function tickersFromUrl(href: string): string[] {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return [];
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  let m: RegExpMatchArray | null;
  // finance.yahoo.com/quote/NVDA/ and /quote/NVDA/news
  if (host === "finance.yahoo.com" && (m = path.match(/^\/quote\/([^/?#]+)/))) return [normTicker(m[1])].filter(Boolean) as string[];
  // google.com/finance/quote/NVDA:NASDAQ
  if (/^google\.[a-z.]+$/.test(host) && (m = path.match(/^\/finance\/quote\/([^/:?#]+)/))) return [normTicker(m[1])].filter(Boolean) as string[];
  if (host === "tradingview.com") {
    // tradingview.com/symbols/NASDAQ-NVDA/
    if ((m = path.match(/^\/symbols\/([^/?#]+)/))) return [normTicker(m[1]!.split("-").pop())].filter(Boolean) as string[];
    // tradingview.com/chart/?symbol=NASDAQ:NVDA
    if (path.startsWith("/chart")) {
      const sym = u.searchParams.get("symbol");
      return sym ? ([normTicker(sym.split(":").pop())].filter(Boolean) as string[]) : [];
    }
  }
  return [];
}

export function isStockPageUrl(href: string): boolean {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    return (
      (host === "finance.yahoo.com" && u.pathname.startsWith("/quote/")) ||
      (/^google\.[a-z.]+$/.test(host) && u.pathname.startsWith("/finance")) ||
      (host === "tradingview.com" && (u.pathname.startsWith("/symbols/") || u.pathname.startsWith("/chart")))
    );
  } catch {
    return false;
  }
}

export function isTweetUrl(href: string): boolean {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^(www\.|mobile\.)/, "");
    return (host === "x.com" || host === "twitter.com") && /^\/[^/]+\/status\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

/** $TICKER cashtags in text (uppercase, 1-5 letters), most frequent first. */
export function cashtags(text: string, max = 5): string[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/(?:^|[\s(])\$([A-Z]{1,5})(?![A-Za-z0-9])/g)) {
    const t = m[1]!;
    if (NOT_STOCKS.has(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, max);
}

/** TradingView chart pages often only expose the ticker in the title ("NVDA 123.45 ▲ +1% ..."). */
function tickerFromTitle(title: string): string | null {
  return normTicker(title.trim().split(/\s+/)[0]);
}

function hasMeta(prop: string, value?: string): boolean {
  const el = document.querySelector<HTMLMetaElement>(`meta[property='${prop}'], meta[name='${prop}']`);
  return !!el && (value === undefined || el.content === value);
}

/** Stock pages and tweets: the only kinds the buddy ever notices automatically (URL check only). */
export function canAutoNotice(href: string): boolean {
  return isStockPageUrl(href) || isTweetUrl(href);
}

/**
 * Full DOM detection for the current page. URL patterns are checked first; the whole page text is
 * only read for other pages, which are never sent automatically (the side panel asks for them).
 */
export function detectFromDom(href = location.href): Detection {
  if (isStockPageUrl(href)) {
    let tickers = tickersFromUrl(href);
    if (!tickers.length) {
      const t = tickerFromTitle(document.title);
      if (t) tickers = [t];
    }
    return { kind: "stock", tickers, flagged: tickers.length > 0, reason: "stock page" };
  }
  if (isTweetUrl(href)) {
    const tweetText = document.querySelector<HTMLElement>("article[data-testid='tweet'] [data-testid='tweetText']")?.innerText ?? "";
    return { kind: "tweet", tickers: cashtags(tweetText), flagged: true, reason: "tweet" };
  }
  const pageText = (document.body?.innerText ?? "").slice(0, 50_000);
  const tickers = cashtags(pageText);
  const isArticle = hasMeta("og:type", "article") || !!document.querySelector("article");
  if (tickers.length) return { kind: isArticle ? "article" : "generic", tickers, flagged: true, reason: "cashtags" };
  if (isArticle && hasMeta("og:title")) return { kind: "article", tickers: [], flagged: true, reason: "article" };
  return { kind: "generic", tickers: [], flagged: false, reason: "nothing notable" };
}
