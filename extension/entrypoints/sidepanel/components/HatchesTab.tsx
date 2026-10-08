import { useEffect } from "react";
import { HATCH_WEB_URL, tokenPageUrl } from "../../../lib/config";
import { sendToBackground } from "../../../lib/messages";
import { KEYS, type HatchesCache } from "../../../lib/storage";
import { useStorageValue } from "../hooks";
import { EmptyState } from "./states";
import { ArrowUpRight, Button, Card, Overline, ShellBar, StatusPill, TokenArt, progressInk } from "./ui";

/** Sums "0.4212" style amounts per symbol for the claimable summary. */
function claimableTotals(list: HatchesCache["list"]) {
  const totals = new Map<string, number>();
  for (const h of list) {
    if (!h.claimableCreatorFees.hasFees) continue;
    const n = Number(h.claimableCreatorFees.amount.replace(/,/g, ""));
    if (Number.isFinite(n)) totals.set(h.claimableCreatorFees.symbol, (totals.get(h.claimableCreatorFees.symbol) ?? 0) + n);
  }
  return [...totals.entries()].map(([sym, n]) => `${n.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${sym}`);
}

export function HatchesTab() {
  const wallet = useStorageValue<string | null>(KEYS.wallet, null);
  const cache = useStorageValue<HatchesCache | null>(KEYS.hatches, null);
  // Nothing cached for this wallet yet: ask the background for a refresh now instead of waiting for its poll.
  const stale = !!wallet && cache?.wallet !== wallet;
  useEffect(() => {
    if (stale) void sendToBackground({ type: "refresh-hatches" });
  }, [stale]);

  if (!wallet) {
    return (
      <EmptyState
        title="Connect on the web app"
        body="Connect your wallet on Hatch once and the tokens you launch show up here, with their progress and fees."
        action={
          <Button variant="secondary" onClick={() => window.open(`${HATCH_WEB_URL}/my-hatches`, "_blank")}>
            Open Hatch <ArrowUpRight size={13} />
          </Button>
        }
      />
    );
  }

  const list = cache?.wallet === wallet ? cache.list : [];
  const totals = claimableTotals(list);
  if (cache?.wallet === wallet && list.length === 0 && !cache.error)
    return (
      <EmptyState
        title="Your nest is empty"
        body="Your first token is one click away. Draft one from any page."
        action={
          <Button onClick={() => window.open(`${HATCH_WEB_URL}/launch`, "_blank")}>Hatch your first token</Button>
        }
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5">
      <Card className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <Overline>Claimable fees</Overline>
          <span className="truncate font-mono text-[13px] font-medium">{totals.length ? totals.join(" · ") : "Nothing to claim yet"}</span>
        </div>
        <a
          href={`${HATCH_WEB_URL}/my-hatches`}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-yolk hover:underline"
        >
          Claim <ArrowUpRight size={12} />
        </a>
      </Card>

      {cache?.error && <p className="px-1 text-xs text-danger">Couldn&apos;t refresh: {cache.error}</p>}
      {stale && <p className="px-1 text-xs text-ink-muted">Loading your hatches…</p>}

      {list.map((h) => (
        <a
          key={h.mint}
          href={tokenPageUrl(h.tokenUrl)}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-[14px] border border-surface-3 bg-night p-3 transition-colors hover:border-line-strong hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50"
        >
          <TokenArt ticker={h.symbol} size={42} paired={h.preset === "STOCK"} />
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{h.name}</span>
              <StatusPill status={h.status} small />
            </div>
            <div className="flex items-center gap-2">
              <ShellBar progress={h.status === "Hatched" ? 100 : h.progress} />
              <span className={`w-[52px] shrink-0 text-right font-mono text-[11px] font-medium ${progressInk(h.status === "Hatched" ? 100 : h.progress)}`}>
                {(h.status === "Hatched" ? 100 : h.progress).toFixed(2)}%
              </span>
            </div>
          </div>
          <span className="text-ink-muted transition-colors group-hover:text-ink">
            <ArrowUpRight size={14} />
          </span>
        </a>
      ))}

      <div className="mt-1.5 flex items-center justify-center gap-4">
        <a href={`${HATCH_WEB_URL}/my-hatches`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-semibold text-yolk hover:underline">
          Open My Hatches on the web <ArrowUpRight size={12} />
        </a>
        <button type="button" onClick={() => void sendToBackground({ type: "refresh-hatches" })} className="text-[13px] font-medium text-ink-muted hover:text-ink">
          Refresh
        </button>
      </div>
      {cache?.at && <p className="text-center font-mono text-[10px] text-ink-disabled">updated {new Date(cache.at).toLocaleTimeString()}</p>}
    </div>
  );
}
