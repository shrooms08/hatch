// Request/response shapes for the Hatch browser buddy endpoints (/api/buddy/*, /api/hatches).
import { z } from 'zod';
import { PRESET_IDS, type PresetId } from '@/lib/presets';

export const PAGE_TEXT_MAX = 6000;
export const MAX_PAGE_IMAGES = 12;
export const MAX_MESSAGES = 20;

const httpUrl = z
  .string()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), 'must be an http(s) URL');

export const PAGE_KINDS = ['stock', 'tweet', 'article', 'generic'] as const;

export const pageContextSchema = z.object({
  url: httpUrl,
  title: z.string().max(500).default(''),
  // Longer text is trimmed (not rejected) to PAGE_TEXT_MAX.
  text: z.string().max(100_000).default('').transform((t) => t.slice(0, PAGE_TEXT_MAX)),
  images: z.array(httpUrl).max(50).default([]).transform((a) => a.slice(0, MAX_PAGE_IMAGES)),
  detected: z
    .object({
      kind: z.enum(PAGE_KINDS).default('generic'),
      tickers: z
        .array(z.string().max(12))
        .max(20)
        .default([])
        .transform((a) => a.map((t) => t.toUpperCase().replace(/^\$/, '')).filter((t) => /^[A-Z]{1,6}(\.[A-Z])?$/.test(t))),
    })
    .default({ kind: 'generic', tickers: [] }),
});

export const draftSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  description: z.string(),
  preset: z.enum(PRESET_IDS),
  imageUrl: z.string().nullable(),
  stockTicker: z.string().nullable(),
});

export const draftRequestSchema = z.object({
  page: pageContextSchema,
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }))
    .max(MAX_MESSAGES)
    .default([]),
  /** The draft as the user sees it now, including manual edits (optional). */
  currentDraft: draftSchema.partial().optional(),
});

export const noticeRequestSchema = z.object({
  url: httpUrl,
  title: z.string().max(500).default(''),
  text: z.string().max(20_000).default('').transform((t) => t.slice(0, 1500)),
  detected: pageContextSchema.shape.detected,
});

export type PageContext = z.infer<typeof pageContextSchema>;
export type DraftRequest = z.infer<typeof draftRequestSchema>;
export type NoticeRequest = z.infer<typeof noticeRequestSchema>;

export type BuddyDraft = {
  name: string;
  symbol: string;
  description: string;
  preset: PresetId;
  imageUrl: string | null;
  stockTicker: string | null;
  reasoning: string;
  reply: string;
};

export type BuddyNotice = { worthIt: boolean; kind: (typeof PAGE_KINDS)[number]; hint: string };

export type HatchSummary = {
  name: string;
  symbol: string;
  mint: string;
  pool: string;
  preset: PresetId | null;
  progress: number; // percent, 2 decimals
  status: 'Incubating' | 'Almost hatched' | 'Hatched';
  /**
   * Unclaimed creator quote fees. `amount` is the display string (formatAmount: "0.0₄4806"; never parse it),
   * `ui` the exact decimal, `raw` + `decimals` the on-chain units.
   */
  claimableCreatorFees: { amount: string; ui: string; raw: string; decimals: number; symbol: string; hasFees: boolean };
  tokenUrl: string;
};

/** Claimable totals per quote token, as the web My Hatches page shows them. */
export type ClaimableTotal = { symbol: string; amount: string; ui: string };

export type HatchesResponse = { wallet: string; network: string; hatches: HatchSummary[]; claimableTotals: ClaimableTotal[] };
