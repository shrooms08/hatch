import { useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { DEV_WEB_URLS, HATCH_WEB_URL, NETWORK, linkWebBase, webUrl } from "../../../lib/config";
import { sendToBackground } from "../../../lib/messages";
import { GridBuddy } from "../../../lib/buddy/grid";
import { GRID } from "../../../lib/buddy/art";
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

/** The real buddy (same renderer as on the page), idling. */
function LiveBuddy({ size = 72 }: { size?: number }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const buddy = new GridBuddy();
    holder.current?.append(buddy.el);
    return () => buddy.destroy();
  }, [size]);
  return <div ref={holder} aria-hidden className="relative" style={{ width: size, height: size }} />;
}

/** Removes everything Hatch stored in chrome.storage (wallet address, settings, position, notice history). */
function ClearData() {
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  const clear = async () => {
    await sendToBackground({ type: "forget-wallet" }).catch(() => undefined); // also clears the toolbar badge
    await browser.storage.local.clear();
    await browser.storage.session.clear();
    setStep("done");
  };
  if (step === "done") return <span className="text-xs font-semibold text-success">Cleared</span>;
  if (step === "confirm")
    return (
      <div className="flex flex-col gap-2 rounded-[12px] border border-danger/40 bg-danger/[0.06] p-3">
        <span className="text-xs leading-normal text-ink">Remove everything Hatch stored in this browser? Your wallet address, settings, buddy position and notice history are deleted. Tokens on chain are not affected.</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => void clear()} className="rounded-full bg-danger px-3 py-1.5 text-xs font-semibold text-night">
            Clear my data
          </button>
          <button type="button" onClick={() => setStep("idle")} className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2">
            Cancel
          </button>
        </div>
      </div>
    );
  return (
    <button type="button" className="self-start text-xs font-medium text-ink-muted hover:text-danger" onClick={() => setStep("confirm")}>
      Clear my data
    </button>
  );
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
  const manifest = browser.runtime.getManifest();
  const version = manifest.version_name ?? manifest.version;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3.5">
      <Card className="rounded-[16px]">
        <Row title="Sounds" sub="A soft chirp when the panel opens, a double chirp on hatch">
          <Toggle label="Sounds" checked={settings.sounds !== false} onChange={(v) => void updateSettings((s) => ({ ...s, sounds: v }))} />
        </Row>
        <Row title="Chirp on heads-ups and alerts" sub={settings.sounds === false ? "Off while Sounds is off" : "Double chirp for hints and for 80%, hatched and fee alerts"}>
          <Toggle
            label="Chirp on heads-ups and alerts"
            checked={settings.sounds !== false && settings.chirpAlerts !== false}
            disabled={settings.sounds === false}
            onChange={(v) => void updateSettings((s) => ({ ...s, chirpAlerts: v }))}
          />
        </Row>
        <Row title="Notice pages automatically" sub="Stock pages and tweets only, once per page">
          <Toggle label="Notice pages automatically" checked={settings.noticeAuto !== false} onChange={(v) => void updateSettings((s) => ({ ...s, noticeAuto: v }))} />
        </Row>
        <Row title="Check any website" sub="Tweets, YouTube videos and GitHub repos are always checked for a coin. On: other pages too">
          <Toggle label="Check any website" checked={settings.checkAnyWebsite === true} onChange={(v) => void updateSettings((s) => ({ ...s, checkAnyWebsite: v }))} />
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

      {DEV_WEB_URLS.length > 0 && (
        <Card className="flex flex-col gap-2 rounded-[16px] p-4">
          <span className="text-[13px] font-semibold">Dev: web app for link coins</span>
          <span className="text-xs text-ink-muted">Dev builds only. Link lookups, Hatch and View coin use this web app.</span>
          <select
            aria-label="Web app for link coins"
            className="h-9 rounded-[10px] border border-surface-3 bg-surface-2 px-2 font-mono text-xs text-ink"
            value={linkWebBase(settings.devWebBase)}
            onChange={(e) => void updateSettings((s) => ({ ...s, devWebBase: e.target.value === HATCH_WEB_URL ? null : e.target.value }))}
          >
            {[HATCH_WEB_URL, ...DEV_WEB_URLS].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Card>
      )}

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
          same for stock pages and tweets only, once per page. News headlines are checked on your device only. Nothing else leaves your browser.{" "}
          <a href={webUrl("/privacy")} target="_blank" rel="noreferrer" className="font-semibold text-yolk hover:underline">
            Privacy
          </a>
        </span>
        <ClearData />
      </Card>

      <div className="flex flex-col items-center gap-2.5 py-7">
        <LiveBuddy size={72} />
        <span className="text-xs text-ink-muted">Your buddy, made of {GRID * GRID} dots.</span>
      </div>
    </div>
  );
}
