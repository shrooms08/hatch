import { describe, expect, it } from "vitest";
import { stockFor, unavailableTickers } from "../lib/stocks";
import type { StockMap } from "../lib/types";

const STOCKS: StockMap = { NVDA: { ticker: "NVDA", config: "cfg", quoteMint: "mint", symbol: "NVDAx", name: "NVIDIA" } };

describe("stock availability (from /api/stocks)", () => {
  it("finds available stocks case- and $-insensitively", () => {
    expect(stockFor(STOCKS, "$nvda")?.symbol).toBe("NVDAx");
    expect(stockFor(STOCKS, "TSLA")).toBeNull();
    expect(stockFor(STOCKS, null)).toBeNull();
  });
  it("lists detected tickers that are coming soon", () => {
    expect(unavailableTickers(STOCKS, ["NVDA", "TSLA", "AAPL"])).toEqual(["TSLA", "AAPL"]);
  });
});
