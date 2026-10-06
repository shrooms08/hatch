/**
 * Stocks Hatch can pair with on the current network, read from the web app (GET /api/stocks)
 * instead of a hardcoded table. Cached in chrome.storage for an hour.
 */
import { api } from "./api";
import { KEYS, getLocal, setLocal } from "./storage";
import type { StockInfo, StockMap } from "./types";

const TTL_MS = 60 * 60 * 1000;
type Cache = { at: number; stocks: StockMap };

export async function loadStocks(force = false): Promise<StockMap> {
  const cached = await getLocal<Cache | null>(KEYS.stocks, null);
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.stocks;
  const r = await api.stocks();
  if (!r.ok) return cached?.stocks ?? {};
  await setLocal(KEYS.stocks, { at: Date.now(), stocks: r.data.stocks } satisfies Cache);
  return r.data.stocks;
}

/** The pairable stock for a ticker ("$nvda" ok), or null if it isn't available on this network. */
export function stockFor(stocks: StockMap, ticker: string | null | undefined): StockInfo | null {
  if (!ticker) return null;
  return stocks[ticker.toUpperCase().replace(/^\$/, "")] ?? null;
}

/** Tickers detected on the page that Hatch can't pair with yet ("coming soon"). */
export function unavailableTickers(stocks: StockMap, tickers: string[]): string[] {
  return tickers.filter((t) => !stockFor(stocks, t));
}
