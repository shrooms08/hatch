import { useEffect, useRef } from "react";
import { browser } from "wxt/browser";
import { NETWORK } from "../../../lib/config";
import { sendToBackground } from "../../../lib/messages";
import { OrbBuddy } from "../../../lib/buddy/orb";
import { DOTS } from "../../../lib/buddy/config";
import { DEFAULT_SETTINGS, KEYS, updateSettings, type Settings } from "../../../lib/storage";
import { useStorageValue } from "../hooks";
import { Card, DefRow, Toggle } from "./ui";

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
};

/** The real buddy (same orb engine as on the page), idling. */
function LiveBuddy({ size = 72 }: { size?: number }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const orb = new OrbBuddy({ renderSize: size, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    orb.canvas.style.cssText = "position:absolute;left:-25%;top:-25%;width:150%;height:150%;pointer-events:none";
    holder.current?.append(orb.canvas);
    return () => orb.destroy();
  }, [size]);
  return <div ref={holder} aria-hidden className="relative" style={{ width: size, height: size }} />;
}

function Row({ title, sub, mono, children, last }: { title: string; sub: string; mono?: boolean; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 p-4 ${last ? "" : "border-b border-surface-3"}`}>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-sm font-semibold">{title}</span>
        <span className={`truncate text-xs text-ink-muted ${mono ? "font-mono" : ""}`}>{sub}</span>
      </div>
      {children}
    </div>
  );
}

export function SettingsTab({ activeUrl }: { activeUrl: string | null }) {
  const stored = useStorageValue<Partial<Settings>>(KEYS.settings, DEFAULT_SETTINGS);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...stored };
  const wallet = useStorageValue<string | null>(KEYS.wallet, null);
  const host = hostOf(activeUrl);
  const hiddenHere = !!host && settings.hiddenSites.includes(host);
  const otherHidden = settings.hiddenSites.filter((s) => s !== host);
  const version = browser.runtime.getManifest().version;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3.5">
      <Card className="rounded-[16px]">
        <Row title="Sounds" sub="A soft chirp when the panel opens, a double chirp on hatch">
          <Toggle label="Sounds" checked={settings.sounds !== false} onChange={(v) => void updateSettings((s) => ({ ...s, sounds: v }))} />
        </Row>
        <Row title="Notice pages automatically" sub="Stock pages and tweets only, once per page">
          <Toggle label="Notice pages automatically" checked={settings.noticeAuto !== false} onChange={(v) => void updateSettings((s) => ({ ...s, noticeAuto: v }))} />
        </Row>
        <Row title="Hide on this site" sub={host ?? "Open a web page first"} mono>
          <Toggle
            label="Hide on this site"
            checked={hiddenHere}
            onChange={(v) =>
              host &&
              void updateSettings((s) => ({ ...s, hiddenSites: v ? [...new Set([...s.hiddenSites, host])] : s.hiddenSites.filter((x) => x !== host) }))
            }
          />
        </Row>
        <Row title="Hide everywhere" sub="Open the panel from the toolbar instead" last>
          <Toggle label="Hide everywhere" checked={settings.hiddenEverywhere} onChange={(v) => void updateSettings((s) => ({ ...s, hiddenEverywhere: v }))} />
        </Row>
      </Card>

      {otherHidden.length > 0 && (
        <Card className="flex flex-col gap-1 rounded-[16px] p-4">
          <span className="mb-1 text-[13px] font-semibold">Also hidden on</span>
          {otherHidden.map((site) => (
            <div key={site} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-ink-2">{site}</span>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-yolk hover:underline"
                onClick={() => void updateSettings((s) => ({ ...s, hiddenSites: s.hiddenSites.filter((x) => x !== site) }))}
              >
                Show again
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-3 rounded-[16px] p-4">
        <DefRow label="Network">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${NETWORK === "mainnet-beta" ? "bg-success" : "bg-warning"}`} />
            Solana {NETWORK === "mainnet-beta" ? "Mainnet" : "Devnet"}
          </span>
        </DefRow>
        <DefRow label="Version">{version}</DefRow>
        <DefRow label="Wallet">{wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "none"}</DefRow>
        {wallet && (
          <button type="button" className="self-start text-xs font-medium text-ink-muted hover:text-danger" onClick={() => void sendToBackground({ type: "forget-wallet" })}>
            Stop tracking this wallet
          </button>
        )}
        <span className="text-[11px] leading-normal text-ink-muted">Hatch only stores your public address. Keys never leave your wallet.</span>
        <span className="text-[11px] leading-normal text-ink-muted">
          Privacy: when you draft, the page&apos;s title, address (without query string) and text go to Hatch to write the draft. Automatic hints send the
          same for stock pages and tweets only, once per page. Nothing else leaves your browser.
        </span>
      </Card>

      <div className="flex flex-col items-center gap-2.5 py-7">
        <LiveBuddy size={72} />
        <span className="text-xs text-ink-muted">Your buddy, made of {DOTS.count} dots.</span>
      </div>
    </div>
  );
}
