/**
 * Hatch web app client (adapted from GLANCE's ApiClient, minus Bearer auth: the extension holds
 * no keys or sessions). Used by the background worker and the side panel; content scripts go
 * through the background.
 */
import { HATCH_WEB_URL, withPreviewBypass } from "./config";
import type { BuddyDraft, BuddyNotice, ChatMessage, Draft, HatchSummary, PageContext, PresetInfo, Result, StockMap } from "./types";

const OFFLINE = `Can't reach Hatch at ${HATCH_WEB_URL}. Is the web app running?`;

async function request<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 45_000): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(withPreviewBypass(`${HATCH_WEB_URL}${path}`), {
      method,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, error: OFFLINE };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const error = (json as { error?: unknown } | null)?.error;
    return { ok: false, error: typeof error === "string" ? error : `Hatch returned HTTP ${res.status}` };
  }
  return { ok: true, data: json as T };
}

export const api = {
  draft: (page: PageContext, messages: ChatMessage[], currentDraft?: Partial<Draft>) =>
    request<BuddyDraft>("POST", "/api/buddy/draft", { page, messages, currentDraft }, 90_000),
  notice: (input: Pick<PageContext, "url" | "title" | "text" | "detected">) =>
    request<BuddyNotice>("POST", "/api/buddy/notice", input, 20_000),
  hatches: (wallet: string) =>
    request<{ wallet: string; network: string; hatches: HatchSummary[] }>("GET", `/api/hatches?wallet=${encodeURIComponent(wallet)}`),
  presets: () => request<{ network: string; presets: PresetInfo[] }>("GET", "/api/presets"),
  stocks: () => request<{ network: string; stocks: StockMap }>("GET", "/api/stocks"),
};

/** The web app's /launch URL, prefilled (the user reviews, then Phantom signs on the web app). */
export function launchUrl(draft: Draft, sourceUrl: string): string {
  const q = new URLSearchParams({
    name: draft.name,
    symbol: draft.symbol,
    description: draft.description,
    preset: draft.preset,
    source: sourceUrl,
  });
  if (draft.imageUrl) q.set("image", draft.imageUrl);
  if (draft.preset === "STOCK" && draft.stockTicker) q.set("stock", draft.stockTicker);
  return withPreviewBypass(`${HATCH_WEB_URL}/launch?${q.toString()}`, true);
}
