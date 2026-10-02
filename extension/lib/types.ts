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

export type HatchStatus = "Incubating" | "Almost hatched" | "Hatched";

export type HatchSummary = {
  name: string;
  symbol: string;
  mint: string;
  pool: string;
  preset: PresetId | null;
  progress: number;
  status: HatchStatus;
  claimableCreatorFees: { amount: string; symbol: string; hasFees: boolean };
  tokenUrl: string;
};

export type EggState = "idle" | "noticed" | "thinking" | "ready";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
