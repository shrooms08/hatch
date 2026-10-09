import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { claimableLine } from "../../../lib/claimable";
import type { Holding } from "../../../lib/types";
import { tokenPageUrl, webUrl } from "../../../lib/config";
import { sendToBackground } from "../../../lib/messages";
import { KEYS, type HatchesCache } from "../../../lib/storage";
import { useStorageValue } from "../hooks";
import { EmptyState } from "./states";
import { ArrowUpRight, Button, Card, Overline, ShellBar, Skeleton, StatusPill, TokenArt, TokenImage, cx, presetLabel, progressInk } from "./ui";

type View = "created" | "holdings";

export function HatchesTab() {
  const wallet = useStorageValue<string | null>(KEYS.wallet, null);
  const [view, setView] = useState<View>("created");
  if (!wallet) {
    return (
      <EmptyState
        title="Connect on the web app"
        body="Connect your wallet on Hatch once and the tokens you launch and hold show up here, with their progress and fees."
        action={
          <Button variant="secondary" onClick={() => window.open(webUrl("/my-hatches"), "_blank")}>
            Open Hatch <ArrowUpRight size={13} />
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="My Hatches view" className="mx-3.5 mt-3.5 grid grid-cols-2 rounded-full border border-line bg-inset p-1">
        {(["created", "holdings"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cx("h-8 rounded-full text-[13px] font-semibold transition-colors", view === v ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink")}
          >
            {v === "created" ? "Created" : "Holdings"}
          </button>
        ))}
      </div>
      {view === "created" ? <CreatedList wallet={wallet} /> : <HoldingsList wallet={wallet} />}
    </div>
  );
}

const usd = (v: number) => (v < 0.01 ? "<$0.01" : `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`);

/** Hatch tokens this wallet holds (GET /api/holdings: chain read, USD values are estimates). */
function HoldingsList({ wallet }: { wallet: string }) {
  const [state, setState] = useState<{ list: Holding[] | null; error: string | null; at: number | null }>({ list: null, error: null, at: null });
  const load = useCallback(async () => {
    const r = await api.holdings(wallet);
    setState((s) => (r.ok ? { list: r.data.holdings, error: null, at: Date.now() } : { ...s, error: r.error }));
  }, [wallet]);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (!state.list && !state.error)
    return (
      <div className="flex flex-col gap-2 p-3.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-[14px]" />
        ))}
      </div>
    );
  if (state.list && state.list.length === 0)
    return (
      <EmptyState
        title="No holdings yet"
        body="Tokens you buy on Hatch show up here."
        action={
          <Button variant="secondary" onClick={() => window.open(webUrl("/#hatches"), "_blank")}>
            Explore hatches <ArrowUpRight size={13} />
          </Button>
        }
      />
    );
  const list = state.list ?? [];
  const total = list.reduce((n, h) => n + (h.valueUsd ?? 0), 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5">
      {list.length > 0 && (
        <Card className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <Overline>Holdings value · estimate</Overline>
            <span className="font-mono text-[13px] font-medium">≈ {usd(total)}</span>
          </div>
          <span className="max-w-[150px] text-right text-[10px] leading-snug text-ink-muted">Curve price × Jupiter price of the quote token</span>
        </Card>
      )}
      {state.error && <p className="px-1 text-xs text-danger">Couldn&apos;t refresh: {state.error}</p>}
      {list.map((h) => (
        <a
          key={h.mint}
          href={tokenPageUrl(h.tokenUrl)}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-[14px] border border-surface-3 bg-night p-3 transition-colors hover:border-line-strong hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50"
        >
          <TokenImage src={h.image} ticker={h.symbol} size={42} paired={h.preset === "STOCK"} />
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{h.name}</span>
              <StatusPill status={h.status} small />
            </div>
            <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink-2">
              <span className="truncate">
                {h.balance} ${h.symbol}
              </span>
              <span className="shrink-0 text-right">
                {h.valueQuote} {h.quoteSymbol}
                {h.valueUsd != null && <span className="text-ink-muted"> · ≈{usd(h.valueUsd)}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] font-medium text-ink-muted">
                {presetLabel(h.preset)} {h.quoteSymbol}
              </span>
              <ShellBar progress={h.hatched ? 100 : h.progressPct} />
              <span className={`w-[44px] shrink-0 text-right font-mono text-[10px] ${progressInk(h.hatched ? 100 : h.progressPct)}`}>{(h.hatched ? 100 : h.progressPct).toFixed(1)}%</span>
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-yolk group-hover:underline">{h.hatched ? "Trade" : "Sell"}</span>
        </a>
      ))}
      <div className="mt-1.5 flex items-center justify-center gap-4">
        <a href={webUrl("/my-hatches?view=holdings")} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-semibold text-yolk hover:underline">
          Open Holdings on the web <ArrowUpRight size={12} />
        </a>
        <button type="button" onClick={() => void load()} className="text-[13px] font-medium text-ink-muted hover:text-ink">
          Refresh
        </button>
      </div>
      {state.at && <p className="text-center font-mono text-[10px] text-ink-disabled">updated {new Date(state.at).toLocaleTimeString()} · values are estimates</p>}
    </div>
  );
}

function CreatedList({ wallet }: { wallet: string }) {
  const cache = useStorageValue<HatchesCache | null>(KEYS.hatches, null);
  // Nothing cached for this wallet yet: ask the background for a refresh now instead of waiting for its poll.
  const stale = !!wallet && cache?.wallet !== wallet;
  useEffect(() => {
    if (stale) void sendToBackground({ type: "refresh-hatches" });
  }, [stale]);

  const list = cache?.wallet === wallet ? cache.list : [];
  const claimable = cache?.wallet === wallet ? claimableLine(cache) : null;
  if (cache?.wallet === wallet && list.length === 0 && !cache.error)
    return (
      <EmptyState
        title="Your nest is empty"
        body="Your first token is one click away. Draft one from any page."
        action={
          <Button onClick={() => window.open(webUrl("/launch"), "_blank")}>Hatch your first token</Button>
        }
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5">
      <Card className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <Overline>Claimable fees</Overline>
          <span className="truncate font-mono text-[13px] font-medium">{claimable ?? "Nothing to claim yet"}</span>
        </div>
        <a
          href={webUrl("/my-hatches")}
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
        <a href={webUrl("/my-hatches")} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] font-semibold text-yolk hover:underline">
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
