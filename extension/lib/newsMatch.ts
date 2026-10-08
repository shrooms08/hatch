/**
 * Privacy-safe news heads-up: LOCAL ONLY. On ordinary pages the buddy compares the page title, og:title and
 * main headline with the stocks Hatch supports (from GET /api/stocks, cached). Nothing is sent for this
 * check; page text goes to Hatch only when the user clicks the hint or "Draft from this page".
 * Body text is never read here.
 */
import type { StockInfo, StockMap } from "./types";

/** Other common names per ticker (the stock's own name and ticker are always used). */
const ALIASES: Record<string, string[]> = {
  NVDA: ["Nvidia", "NVIDIA Corp", "Nvidia's"],
  TSLA: ["Tesla", "Tesla's", "Tesla Inc"],
  AAPL: ["Apple"],
  MSFT: ["Microsoft"],
  GOOGL: ["Google", "Alphabet"],
  AMZN: ["Amazon"],
  META: ["Meta Platforms"],
};

export type Headlines = { title: string; ogTitle: string; h1: string };

/** The three headline sources of a page (no body text). */
export function collectHeadlines(doc: Pick<Document, "title" | "querySelector">): Headlines {
  const og = doc.querySelector<HTMLMetaElement>('meta[property="og:title"], meta[name="og:title"], meta[name="twitter:title"]')?.content ?? "";
  const h1 = doc.querySelector("article h1, main h1, h1")?.textContent ?? "";
  return { title: (doc.title ?? "").slice(0, 300), ogTitle: og.slice(0, 300), h1: h1.replace(/\s+/g, " ").trim().slice(0, 300) };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names match case-insensitively as whole words; tickers match as uppercase words or $cashtags. */
function matcher(stock: StockInfo): (text: string) => boolean {
  const names = [stock.name, ...(ALIASES[stock.ticker] ?? [])].filter((n) => n && n.length >= 3).map(escape);
  const nameRe = names.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${names.join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu") : null;
  const tickerRe = new RegExp(`(^|[^A-Za-z0-9$])\\$?${escape(stock.ticker)}(?=$|[^A-Za-z0-9])`);
  const cashRe = new RegExp(`\\$${escape(stock.ticker)}(?=$|[^A-Za-z0-9])`, "i");
  return (text) => (!!nameRe && nameRe.test(text)) || tickerRe.test(text) || cashRe.test(text);
}

/** The first supported stock named in a headline, or null. */
export function matchHeadlines(h: Headlines, stocks: StockMap): StockInfo | null {
  const text = [h.title, h.ogTitle, h.h1].filter(Boolean).join("\n");
  if (!text) return null;
  for (const stock of Object.values(stocks)) if (matcher(stock)(text)) return stock;
  return null;
}

/** The buddy's local hint for a match. */
export const localHint = (s: StockInfo) => `This is about ${s.name}. Hatch a coin backed by tokenized ${s.ticker}?`;
