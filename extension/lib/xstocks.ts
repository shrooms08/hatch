/**
 * Stock ticker -> xStock (tokenized stock on Solana) table, used by the STOCK preset.
 *
 * Mainnet mint addresses are intentionally null.
 * TODO(mainnet): fill each `mainnetMint` from the official registry (https://api.xstocks.fi/api/v1/token),
 * verify on-chain (Token-2022, issuer authorities) and confirm a DBC token badge exists. Never guess them.
 * On devnet every stock maps to the mock NVDAx mint created by scripts/ (DEVNET_STOCK_MINT).
 */
import { DEVNET_STOCK_MINT, NETWORK } from "./config";

export type XStock = { ticker: string; xSymbol: string; company: string; mainnetMint: string | null };

export const XSTOCKS: Record<string, XStock> = Object.fromEntries(
  (
    [
      ["NVDA", "NVIDIA"],
      ["TSLA", "Tesla"],
      ["AAPL", "Apple"],
      ["MSFT", "Microsoft"],
      ["GOOGL", "Alphabet"],
      ["AMZN", "Amazon"],
      ["META", "Meta Platforms"],
      ["NFLX", "Netflix"],
      ["AMD", "AMD"],
      ["COIN", "Coinbase"],
      ["MSTR", "MicroStrategy"],
      ["HOOD", "Robinhood"],
      ["PLTR", "Palantir"],
      ["CRCL", "Circle"],
      ["SPY", "SPDR S&P 500 ETF"],
      ["QQQ", "Invesco QQQ ETF"],
    ] as const
  ).map(([ticker, company]) => [ticker, { ticker, xSymbol: `${ticker}x`, company, mainnetMint: null }]),
);

/** The xStock for a ticker, or null if Hatch doesn't list it. */
export function xStockFor(ticker: string | null | undefined): XStock | null {
  if (!ticker) return null;
  return XSTOCKS[ticker.toUpperCase().replace(/^\$/, "")] ?? null;
}

/** Quote mint Hatch would use for this stock on the current network (null = not available yet). */
export function quoteMintFor(ticker: string | null | undefined): string | null {
  const x = xStockFor(ticker);
  if (!x) return null;
  return NETWORK === "devnet" ? DEVNET_STOCK_MINT || null : x.mainnetMint;
}
