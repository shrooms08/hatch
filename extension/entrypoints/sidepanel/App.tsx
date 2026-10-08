import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { SIDEPANEL_PORT } from "../../lib/messages";
import { webUrl } from "../../lib/config";
import { DraftTab } from "./components/DraftTab";
import { HatchesTab } from "./components/HatchesTab";
import { SettingsTab } from "./components/SettingsTab";
import { DraftSkeleton, EmptyState } from "./components/states";
import { Button, HatchMark, cx } from "./components/ui";
import { useActivePage, usePresets, useStorageValue } from "./hooks";
import { KEYS, incubatingCount, type HatchesCache } from "../../lib/storage";

type Tab = "draft" | "hatches" | "settings";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function App() {
  const [tab, setTab] = useState<Tab>("draft");
  const { active, reload } = useActivePage();
  const presets = usePresets();
  const cache = useStorageValue<HatchesCache | null>(KEYS.hatches, null);
  const wallet = useStorageValue<string | null>(KEYS.wallet, null);
  const incubating = cache ? incubatingCount(cache.list) : 0;

  // Held open while the panel is open; the background chirps on connect (open) and disconnect (close).
  useEffect(() => {
    const port = browser.runtime.connect({ name: SIDEPANEL_PORT });
    return () => port.disconnect();
  }, []);

  const tabs: [Tab, string][] = [
    ["draft", "Draft"],
    ["hatches", incubating ? `My Hatches · ${incubating}` : "My Hatches"],
    ["settings", "Settings"],
  ];

  return (
    <div className="flex h-screen flex-col bg-night">
      <header className="flex shrink-0 flex-col gap-3.5 border-b border-surface-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <a href={webUrl()} target="_blank" rel="noreferrer" className="flex items-center gap-[9px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50">
            <HatchMark size={24} />
            <span className="font-display text-[17px] font-bold tracking-[-0.02em]">Hatch</span>
          </a>
          {wallet && (
            <span className="flex items-center gap-1.5 font-mono text-xs font-medium text-ink-2" title={wallet}>
              <span className="h-[18px] w-[18px] rounded-full bg-[conic-gradient(#F2A93B,#E8572A,#F6EEDC,#F2A93B)]" />
              {short(wallet)}
            </span>
          )}
        </div>
        <nav role="tablist" aria-label="Hatch panel" className="flex gap-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx(
                "relative px-3 pb-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:text-ink",
                tab === id ? "font-semibold text-ink" : "font-medium text-ink-muted hover:text-ink-2",
              )}
            >
              {label}
              <span
                aria-hidden
                className={cx("absolute inset-x-0 -bottom-px h-0.5 origin-center rounded-full bg-yolk transition-transform duration-200 ease-out", tab === id ? "scale-x-100" : "scale-x-0")}
              />
            </button>
          ))}
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {tab === "draft" &&
          (active.status === "ready" ? (
            <DraftTab key={active.page.url} tabId={active.tabId} page={active.page} presets={presets} />
          ) : active.status === "loading" ? (
            <div className="p-3.5">
              <DraftSkeleton withPage />
            </div>
          ) : (
            <EmptyState
              title="Nothing to hatch here yet"
              body={
                active.reason.startsWith("Reload")
                  ? "Reload this page so Hatch can read it, then open the panel again."
                  : "Open an article about a stock, a tweet, or anything that deserves a coin. Or describe one yourself."
              }
              action={
                active.reason.startsWith("Reload") ? (
                  <Button variant="secondary" onClick={reload}>
                    Try again
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => void browser.tabs.create({ url: webUrl("/launch") })}>
                    Start from scratch
                  </Button>
                )
              }
            />
          ))}
        {tab === "hatches" && <HatchesTab />}
        {tab === "settings" && <SettingsTab activeUrl={active.status === "ready" ? active.page.url : null} />}
      </main>
    </div>
  );
}
