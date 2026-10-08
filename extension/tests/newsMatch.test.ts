import { describe, expect, it } from "vitest";
import { collectHeadlines, localHint, matchHeadlines } from "../lib/newsMatch";
import type { StockMap } from "../lib/types";

const STOCKS: StockMap = {
  NVDA: { ticker: "NVDA", config: "c1", quoteMint: "m1", symbol: "NVDAx", name: "NVIDIA" },
  TSLA: { ticker: "TSLA", config: "c2", quoteMint: "m2", symbol: "TSLAx", name: "Tesla" },
};
const h = (title: string, ogTitle = "", h1 = "") => ({ title, ogTitle, h1 });

/** A tiny Document stand-in: title, og:title and h1 only; the body is there but must never be read. */
function fakeDoc(o: { title: string; og?: string; h1?: string; body: string }) {
  const read: string[] = [];
  return {
    read,
    doc: {
      title: o.title,
      querySelector: (sel: string) => {
        read.push(sel);
        if (sel.includes("og:title")) return o.og ? ({ content: o.og } as unknown as Element) : null;
        if (sel.includes("h1")) return o.h1 ? ({ textContent: o.h1 } as unknown as Element) : null;
        return null;
      },
      body: { innerText: o.body },
    },
  };
}

describe("news heads-up matcher (local only)", () => {
  it("matches names and tickers in headlines", () => {
    expect(matchHeadlines(h("Nvidia beats earnings as data center sales soar"), STOCKS)?.ticker).toBe("NVDA");
    expect(matchHeadlines(h("Markets", "NVIDIA unveils new chips"), STOCKS)?.ticker).toBe("NVDA");
    expect(matchHeadlines(h("Daily wrap", "", "Why $TSLA fell 6% today"), STOCKS)?.ticker).toBe("TSLA");
    expect(matchHeadlines(h("TSLA deliveries beat estimates - Reuters"), STOCKS)?.ticker).toBe("TSLA");
    expect(matchHeadlines(h("Tesla's robotaxi launch slips"), STOCKS)?.ticker).toBe("TSLA");
  });

  it("does not match lookalikes or lowercase tickers", () => {
    expect(matchHeadlines(h("The nvdaily newsletter"), STOCKS)).toBeNull();
    expect(matchHeadlines(h("tsla is a typo here"), STOCKS)).toBeNull();
    expect(matchHeadlines(h("Weather today: rain"), STOCKS)).toBeNull();
  });

  it("ignores body-only mentions (the body is never read)", () => {
    const { doc, read } = fakeDoc({ title: "Ten gadgets we loved this year", h1: "Ten gadgets we loved", body: "…including a laptop with an NVIDIA GPU and a Tesla charger…" });
    const headlines = collectHeadlines(doc as unknown as Document);
    expect(matchHeadlines(headlines, STOCKS)).toBeNull();
    expect(read.every((sel) => /og:title|twitter:title|h1/.test(sel))).toBe(true);
    const hit = fakeDoc({ title: "Tech news", og: "Nvidia stock hits a record", body: "unrelated" });
    expect(matchHeadlines(collectHeadlines(hit.doc as unknown as Document), STOCKS)?.ticker).toBe("NVDA");
  });

  it("builds the local hint", () => {
    expect(localHint(STOCKS.NVDA!)).toBe("This is about NVIDIA. Hatch a coin backed by tokenized NVDA?");
  });
});
