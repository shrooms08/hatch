import { useState } from "react";
import { browser } from "wxt/browser";
import { launchUrl } from "../../../lib/api";
import { xStockFor } from "../../../lib/xstocks";
import { NETWORK } from "../../../lib/config";
import type { PageContext, PresetId, PresetInfo } from "../../../lib/types";
import { useDraftSession } from "../hooks";
import { Button, Card, Field, Muted, TextArea, TextInput } from "./ui";

const PRESET_ORDER: PresetId[] = ["STOCK", "MEME", "AI_AGENT"];

function PageSummary({ page }: { page: PageContext }) {
  let host = page.url;
  try {
    host = new URL(page.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep url */
  }
  return (
    <Card>
      <div className="text-xs text-[var(--muted)]">
        {host} · {page.detected.kind}
        {page.detected.tickers.length > 0 && ` · ${page.detected.tickers.map((t) => `$${t}`).join(" ")}`}
      </div>
      <div className="mt-1 line-clamp-2 text-sm">{page.title || page.url}</div>
    </Card>
  );
}

export function DraftTab({ tabId, page, presets }: { tabId: number; page: PageContext; presets: PresetInfo[] }) {
  const s = useDraftSession(tabId, page);
  const [message, setMessage] = useState("");
  const preset = presets.find((p) => p.id === s.draft?.preset);
  const xs = xStockFor(s.draft?.stockTicker);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || s.busy) return;
    setMessage("");
    s.send(text);
  };

  return (
    <div className="flex flex-col gap-3">
      <PageSummary page={page} />

      {s.error && (
        <Card className="border-red-500/40 text-sm text-red-300">
          {s.error}{" "}
          <Button variant="ghost" onClick={s.redraft}>
            Try again
          </Button>
        </Card>
      )}

      {!s.draft && s.busy && <Muted>Drafting a token for this page…</Muted>}

      {s.draft && (
        <Card className="flex flex-col gap-2">
          <div className="flex gap-3">
            {s.draft.imageUrl ? (
              <img src={s.draft.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-md bg-white/5" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Field label="Name">
                <TextInput value={s.draft.name} maxLength={32} onChange={(e) => s.edit({ name: e.target.value })} />
              </Field>
              <Field label="Ticker">
                <TextInput
                  value={s.draft.symbol}
                  maxLength={10}
                  onChange={(e) => s.edit({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                />
              </Field>
            </div>
          </div>

          {page.images.length > 1 && (
            <div className="flex gap-1 overflow-x-auto">
              {page.images.map((src) => (
                <button key={src} type="button" onClick={() => s.edit({ imageUrl: src })} className={src === s.draft!.imageUrl ? "ring-2 ring-[var(--accent)]" : ""}>
                  <img src={src} alt="" className="h-10 w-10 rounded object-cover" />
                </button>
              ))}
            </div>
          )}

          <Field label="Description">
            <TextArea rows={3} maxLength={500} value={s.draft.description} onChange={(e) => s.edit({ description: e.target.value })} />
          </Field>

          <Field label="Preset">
            <select
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
              value={s.draft.preset}
              onChange={(e) => s.edit({ preset: e.target.value as PresetId })}
            >
              {PRESET_ORDER.map((id) => (
                <option key={id} value={id} className="bg-black">
                  {presets.find((p) => p.id === id)?.label ?? id}
                </option>
              ))}
            </select>
          </Field>

          {s.draft.preset === "STOCK" && (
            <Muted>
              {xs
                ? `Paired with ${xs.xSymbol} (${xs.company})${NETWORK === "devnet" ? " · devnet uses mock NVDAx" : ""}.`
                : "No listed xStock for this ticker yet; the web app will use the STOCK preset's configured quote token."}
            </Muted>
          )}

          {preset && (
            <div className="rounded-md bg-white/5 p-2 text-xs text-[var(--muted)]">
              {preset.explainer.map((line) => (
                <p key={line} className="mb-1 last:mb-0">
                  {line}
                </p>
              ))}
            </div>
          )}
          {s.reasoning && <Muted>Why: {s.reasoning}</Muted>}

          <Button onClick={() => void browser.tabs.create({ url: launchUrl(s.draft!, page.url) })} disabled={!s.draft.name || !s.draft.symbol}>
            Hatch it
          </Button>
          <Muted>Opens the Hatch web app prefilled. You review and sign there with Phantom.</Muted>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {s.chat.length === 0 && <Muted>Ask for changes, e.g. "shorter ticker" or "use meme preset".</Muted>}
          {s.chat.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end rounded-md bg-white/10 px-2 py-1 text-sm" : "text-sm"}>
              {m.text}
            </div>
          ))}
          {s.busy && s.draft && <Muted>Thinking…</Muted>}
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <TextInput value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask Hatch to change the draft" maxLength={500} />
          <Button type="submit" disabled={s.busy || !message.trim()}>
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
