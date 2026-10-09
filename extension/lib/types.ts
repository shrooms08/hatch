/** Shapes shared with the Hatch web app API (mirrors web/src/lib/buddy/schema.ts). */
export type PresetId = "STOCK" | "MEME" | "AI_AGENT";
export type PageKind = "stock" | "tweet" | "article" | "generic";

export type Detected = { kind: PageKind; tickers: string[] };

export type PageContext = {
  url: string;
  title: string;
  text: string;
  images: string[];
  detected: Detected;
};

export type Draft = {
  name: string;
  symbol: string;
  description: string;
  preset: PresetId;
  imageUrl: string | null;
  stockTicker: string | null;
};

export type BuddyDraft = Draft & { reasoning: string; reply: string };

export type BuddyNotice = { worthIt: boolean; kind: PageKind; hint: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type PresetInfo = { id: PresetId; label: string; description: string; quoteSymbol: string; explainer: string[] };

/** Launch copy for one config (GET /api/presets `copy`): the launch form's exact text. Keys: MEME, AI_AGENT, STOCK:<TICKER>. */
export type PresetCopy = { howItWorks: string; fee: string; honest: string | null; shield: boolean; creatorPct: number };
export type PresetCopyMap = Record<string, PresetCopy>;
export const copyKey = (preset: string, stockTicker?: string | null) => (preset === "STOCK" ? `STOCK:${(stockTicker ?? "").toUpperCase()}` : preset);

export type HatchStatus = "Incubating" | "Almost hatched" | "Hatched";

export type HatchSummary = {
  name: string;
  symbol: string;
  mint: string;
  pool: string;
  preset: PresetId | null;
  progress: number;
  status: HatchStatus;
  /**
   * Unclaimed creator quote fees. `amount` is the web's display string (formatAmount: "0.0₄4806"); never parse it.
   * `ui` (exact decimal) and `raw` + `decimals` are absent in caches written before v0.6.2.
   */
  claimableCreatorFees: { amount: string; ui?: string; raw?: string; decimals?: number; symbol: string; hasFees: boolean };
  tokenUrl: string;
};

/** Claimable totals per quote token, computed by the web app exactly as its My Hatches page shows them. */
export type ClaimableTotal = { symbol: string; amount: string; ui: string };

export type EggState = "idle" | "noticed" | "thinking" | "ready";

export type StockInfo = { ticker: string; config: string; quoteMint: string; symbol: string; name: string };
export type StockMap = Record<string, StockInfo>;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** A Hatch token the wallet holds (GET /api/holdings). */
export type Holding = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  preset: PresetId;
  quoteSymbol: string;
  balance: string;
  valueQuote: string;
  valueUsd: number | null;
  progressPct: number;
  status: HatchStatus;
  hatched: boolean;
  test: boolean;
  tokenUrl: string;
};
