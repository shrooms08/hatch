import { describe, expect, it } from "vitest";
import { cashtags, isStockPageUrl, isTweetUrl, tickersFromUrl } from "../lib/detect";
import { xStockFor } from "../lib/xstocks";

describe("stock page URLs", () => {
  it.each([
    ["https://finance.yahoo.com/quote/NVDA/", ["NVDA"]],
    ["https://finance.yahoo.com/quote/TSLA/news?p=TSLA", ["TSLA"]],
    ["https://www.google.com/finance/quote/AAPL:NASDAQ", ["AAPL"]],
    ["https://www.tradingview.com/symbols/NASDAQ-NVDA/", ["NVDA"]],
    ["https://www.tradingview.com/chart/?symbol=NASDAQ%3AMSFT", ["MSFT"]],
    ["https://www.tradingview.com/chart/abc123/", []],
    ["https://example.com/quote/NVDA", []],
  ])("%s -> %j", (url, tickers) => {
    expect(tickersFromUrl(url)).toEqual(tickers);
  });

  it("recognises stock pages", () => {
    expect(isStockPageUrl("https://finance.yahoo.com/quote/NVDA/")).toBe(true);
    expect(isStockPageUrl("https://www.google.com/finance/")).toBe(true);
    expect(isStockPageUrl("https://www.tradingview.com/chart/xyz/")).toBe(true);
    expect(isStockPageUrl("https://finance.yahoo.com/")).toBe(false);
  });
});

describe("tweets", () => {
  it("matches x.com and twitter.com status pages only", () => {
    expect(isTweetUrl("https://x.com/elonmusk/status/1234567890")).toBe(true);
    expect(isTweetUrl("https://twitter.com/jack/status/20")).toBe(true);
    expect(isTweetUrl("https://mobile.twitter.com/jack/status/20")).toBe(true);
    expect(isTweetUrl("https://x.com/home")).toBe(false);
    expect(isTweetUrl("https://x.com/elonmusk")).toBe(false);
  });
});

describe("cashtags", () => {
  it("extracts stock cashtags, most frequent first, skipping currencies/crypto", () => {
    expect(cashtags("Long $NVDA and $TSLA. $NVDA to the moon! Paid in $USD, bought $BTC")).toEqual(["NVDA", "TSLA"]);
  });
  it("ignores lowercase, prices and embedded dollars", () => {
    expect(cashtags("costs $5 or $nvda or a$AAPL")).toEqual([]);
  });
});

describe("xStocks", () => {
  it("maps tickers to xStock symbols with no invented mainnet mints", () => {
    expect(xStockFor("NVDA")?.xSymbol).toBe("NVDAx");
    expect(xStockFor("$tsla")?.xSymbol).toBe("TSLAx");
    expect(xStockFor("ZZZZ")).toBeNull();
    expect(xStockFor("AAPL")?.mainnetMint).toBeNull();
  });
});
