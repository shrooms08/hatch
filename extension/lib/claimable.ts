// The "Claimable fees" line in the side panel's My Hatches > Created. The amounts and their formatting come
// from the web app (GET /api/hatches, web/src/lib/claimable.ts: the same logic as the web My Hatches page),
// so tiny amounts read "0.0₄4806 SOL" like the web. Display strings are never parsed back into numbers.
import type { HatchesCache } from "./storage";

/** "0.0₄4806 SOL", "0.0123 SOL · 0.01418 NVDAx", or null when nothing is claimable. */
export function claimableLine(cache: Pick<HatchesCache, "list" | "totals">): string | null {
  if (cache.totals?.length) return cache.totals.map((t) => `${t.amount} ${t.symbol}`).join(" · ");
  // Caches written before the server sent totals: list each hatch's own display amount (no math).
  const each = cache.list.filter((h) => h.claimableCreatorFees.hasFees).map((h) => `${h.claimableCreatorFees.amount} ${h.claimableCreatorFees.symbol}`);
  return each.length ? each.join(" · ") : null;
}
