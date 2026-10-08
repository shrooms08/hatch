import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { launchUrl } from "../../../lib/api";
import { stockFor, unavailableTickers } from "../../../lib/stocks";
import { copyKey, type PageContext, type PresetCopyMap, type PresetId, type PresetInfo } from "../../../lib/types";
import { useDraftSession, useStocks } from "../hooks";
import { DraftSkeleton, EmptyState, ErrorCard } from "./states";
import { BuddyDots, Button, Card, EggGlyph, Field, SendIcon, SmileIcon, SparkIcon, TextArea, TextInput, TokenImage, TrendIcon, cx, presetLabel } from "./ui";

const PRESET_ORDER: PresetId[] = ["STOCK", "MEME", "AI_AGENT"];
const SUGGESTIONS = ["use meme preset", "funnier name", "shorter ticker"];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function PageSummary({ page }: { page: PageContext }) {
  const host = hostOf(page.url);
  const ticker = page.detected.tickers[0];
  return (
    <Card className="flex items-center gap-2.5 px-3 py-2.5">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-surface-3 text-xs font-bold uppercase text-success">{host[0]}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold">{page.title || page.url}</span>
        <span className="truncate font-mono text-[11px] font-medium text-ink-muted">
          {host} · {page.detected.kind}
        </span>
      </div>
      {ticker && <span className="shrink-0 rounded-full border border-yolk/40 px-[7px] py-[3px] font-mono text-[11px] font-medium text-yolk">{ticker}</span>}
    </Card>
  );
}

const PRESET_ICON: Record<PresetId, React.ReactNode> = { STOCK: <TrendIcon />, MEME: <SmileIcon />, AI_AGENT: <SparkIcon size={13} /> };

export function DraftTab({ tabId, page, presets, copy }: { tabId: number; page: PageContext; presets: PresetInfo[]; copy: PresetCopyMap }) {
  const s = useDraftSession(tabId, page);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const preset = presets.find((p) => p.id === s.draft?.preset);
  const stocks = useStocks();
  const paired = stockFor(stocks, s.draft?.stockTicker);
  const comingSoon = unavailableTickers(stocks, page.detected.tickers);
  const thread = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }, [s.chat.length, s.busy]);

  const pickPreset = (preset: PresetId) => {
    if (preset !== "STOCK") return s.edit({ preset, stockTicker: null });
    // STOCK needs an available stock: the page's ticker if pairable, else the first available one.
    const ticker = page.detected.tickers.find((t) => stockFor(stocks, t)) ?? Object.keys(stocks)[0] ?? null;
    s.edit({ preset, stockTicker: ticker });
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || s.busy) return;
    setMessage("");
    s.send(t);
  };

  const offline = !!s.error?.startsWith("Can't reach Hatch");
  const resting = !!s.error?.includes("resting");
  // The launch form's own text for this config (from /api/presets); the generic explainer only if it's missing.
  const configCopy = s.draft ? copy[copyKey(s.draft.preset, s.draft.stockTicker)] : undefined;
  const explainer = preset?.explainer ?? [];
  const honest = s.draft?.preset === "STOCK" ? configCopy?.honest ?? explainer.find((l) => l.startsWith("This token is not the stock")) : undefined;
  const body = configCopy ? [configCopy.howItWorks] : explainer.filter((l) => !l.startsWith("This token is not the stock"));

  if (resting && !s.draft)
    return (
      <EmptyState
        resting
        title="Hatch is resting"
        body="We're taking a short break. Try again later. Your tokens and fees are safe on-chain."
        action={
          <Button variant="secondary" onClick={s.redraft}>
            Try again
          </Button>
        }
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
        <PageSummary page={page} />

        {!s.draft && s.busy && <DraftSkeleton />}
        {!s.draft && !s.busy && !s.error && (
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-line-strong px-5 py-7 text-center">
            <BuddyDots size={56} />
            <span className="font-display text-base font-bold tracking-[-0.02em]">Draft a token from this page?</span>
            <span className="text-[13px] leading-normal text-ink-2">Hatch reads this page and drafts a token with AI. Nothing is sent until you ask.</span>
            <Button onClick={s.redraft}>Draft from this page</Button>
          </div>
        )}
        {s.error && !resting && <ErrorCard message={s.error} offline={offline} onRetry={s.redraft} />}
        {s.error && resting && (
          <Card className="px-3.5 py-3 text-[13px] text-ink-2">Hatch is resting, so it can&apos;t change the draft right now. Try again later.</Card>
        )}

        {s.draft && (
          <div className="flex animate-rise-in flex-col gap-3 rounded-[18px] border border-line bg-surface-1 p-3.5">
            <div className="flex items-center gap-3">
              <TokenImage src={s.draft.imageUrl} ticker={s.draft.symbol} size={64} paired={!!paired} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-display text-base font-bold tracking-[-0.02em]">{s.draft.name || "Untitled"}</span>
                <span className="font-mono text-xs font-medium text-ink-muted">${s.draft.symbol || "TICKER"}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                aria-expanded={editing}
                className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50"
              >
                {editing ? "Done" : "Edit"}
              </button>
            </div>

            {editing ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[1fr_130px] gap-2">
                  <Field label="Name" aside={`${s.draft.name.length}/32`}>
                    <TextInput value={s.draft.name} maxLength={32} onChange={(e) => s.edit({ name: e.target.value })} />
                  </Field>
                  <Field label="Ticker">
                    <TextInput
                      className="font-mono"
                      value={s.draft.symbol}
                      maxLength={10}
                      onChange={(e) => s.edit({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                    />
                  </Field>
                </div>
                <Field label="Description" aside={`${s.draft.description.length}/500`}>
                  <TextArea rows={3} maxLength={500} value={s.draft.description} onChange={(e) => s.edit({ description: e.target.value })} />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-ink-2">Preset</span>
                  <div role="radiogroup" aria-label="Preset" className="grid grid-cols-3 gap-1.5">
                    {PRESET_ORDER.map((id) => {
                      const disabled = id === "STOCK" && Object.keys(stocks).length === 0;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={s.draft!.preset === id}
                          disabled={disabled}
                          onClick={() => pickPreset(id)}
                          className={cx(
                            "flex h-9 items-center justify-center gap-1.5 rounded-full border text-xs font-semibold transition-colors disabled:opacity-40",
                            s.draft!.preset === id ? "border-yolk bg-yolk/[0.12] text-yolk" : "border-line text-ink-2 hover:border-line-strong",
                          )}
                        >
                          {presets.find((p) => p.id === id)?.label ?? presetLabel(id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {page.images.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-ink-2">Image</span>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {page.images.map((src) => (
                        <button
                          key={src}
                          type="button"
                          aria-label="Use this image"
                          aria-pressed={src === s.draft!.imageUrl}
                          onClick={() => s.edit({ imageUrl: src })}
                          className={cx("shrink-0 rounded-[8px] p-0.5", src === s.draft!.imageUrl ? "ring-2 ring-yolk" : "ring-1 ring-line")}
                        >
                          <TokenImage src={src} ticker={s.draft!.symbol} size={40} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              s.draft.description && <p className="text-[13px] leading-normal text-ink-2">{s.draft.description}</p>
            )}

            {preset && (
              <div className="flex flex-col gap-1.5 rounded-[12px] bg-inset px-3 py-2.5">
                <span className="flex items-center gap-[7px] text-[13px] font-semibold">
                  {PRESET_ICON[preset.id]}
                  {preset.label}
                  <span className={cx("font-mono text-[11px] font-medium", preset.id === "STOCK" ? "text-yolk" : "text-ink-muted")}>
                    {preset.id === "STOCK" ? paired?.symbol ?? preset.quoteSymbol : preset.quoteSymbol}
                  </span>
                </span>
                {body.map((line) => (
                  <span key={line} className="text-xs leading-normal text-ink-2">
                    {line}
                  </span>
                ))}
                {honest && <span className="text-xs leading-[1.45] text-warning">{honest}</span>}
              </div>
            )}
            {s.draft.preset !== "STOCK" && comingSoon.length > 0 && (
              <span className="text-xs text-ink-muted">Stock-paired launches for {comingSoon.join(", ")} are coming soon.</span>
            )}
            {s.reasoning && (
              <span className="flex gap-[7px] text-xs leading-[1.45] text-info">
                <span className="mt-0.5">
                  <SparkIcon size={12} />
                </span>
                Why: {s.reasoning}
              </span>
            )}

            <Button
              size="lg"
              block
              className="shadow-cta"
              onClick={() => void browser.tabs.create({ url: launchUrl(s.draft!, page.url) })}
              disabled={!s.draft.name || !s.draft.symbol}
            >
              <EggGlyph size={18} />
              Hatch it
            </Button>
            <span className="text-center text-[11px] text-ink-muted">Opens Hatch prefilled. You review and sign with your own wallet.</span>
          </div>
        )}

        {/* Chat thread */}
        {(s.chat.length > 0 || (s.busy && s.draft)) && (
          <div className="mt-auto flex flex-col gap-2.5 pt-2" aria-live="polite">
            {s.chat.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex animate-rise-in justify-end">
                  <span className="max-w-[260px] rounded-[14px_14px_4px_14px] bg-yolk px-3 py-2.5 text-[13px] leading-[1.45] text-on-yolk">{m.text}</span>
                </div>
              ) : (
                <div key={i} className="flex animate-rise-in items-end gap-2">
                  <BuddyDots size={26} />
                  <span className="max-w-[280px] rounded-[14px_14px_14px_4px] bg-surface-2 px-3 py-2.5 text-[13px] leading-[1.45]">{m.text}</span>
                </div>
              ),
            )}
            {s.busy && s.draft && (
              <div className="flex items-end gap-2" aria-label="Hatch is thinking">
                <BuddyDots size={26} />
                <span className="flex gap-[5px] rounded-[14px_14px_14px_4px] bg-surface-2 px-3.5 py-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-typing rounded-full bg-ink-2" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className={cx("flex shrink-0 flex-col gap-2.5 border-t border-surface-3 px-3.5 pb-3.5 pt-3", (!s.draft || resting) && "opacity-50")}>
        {s.draft && (
          <div className="flex gap-1.5 overflow-x-auto">
            {SUGGESTIONS.map((t) => (
              <button
                key={t}
                type="button"
                disabled={s.busy}
                onClick={() => send(t)}
                className="h-7 shrink-0 rounded-full border border-line px-2.5 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(message);
          }}
          className="flex h-12 items-center gap-2 rounded-full border border-line bg-inset pl-4 pr-[5px] transition-[border-color,box-shadow] focus-within:border-yolk focus-within:shadow-focus"
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask Hatch to change the draft"
            aria-label="Ask Hatch to change the draft"
            maxLength={500}
            disabled={!s.draft || resting}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={s.busy || !message.trim()}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-yolk text-on-yolk transition-colors hover:bg-yolk-hi disabled:bg-surface-3 disabled:text-ink-disabled"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
