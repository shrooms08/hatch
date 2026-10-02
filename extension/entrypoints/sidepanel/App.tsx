import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { SIDEPANEL_PORT } from "../../lib/messages";
import { DraftTab } from "./components/DraftTab";
import { HatchesTab } from "./components/HatchesTab";
import { SettingsTab } from "./components/SettingsTab";
import { Button, Egg, Muted } from "./components/ui";
import { useActivePage, usePresets, useStorageValue } from "./hooks";
import { KEYS, incubatingCount, type HatchesCache } from "../../lib/storage";

type Tab = "draft" | "hatches" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("draft");
  const { active, reload } = useActivePage();
  const presets = usePresets();
  const cache = useStorageValue<HatchesCache | null>(KEYS.hatches, null);
  const incubating = cache ? incubatingCount(cache.list) : 0;

  // Held open while the panel is open; the background chirps on connect (open) and disconnect (close).
  useEffect(() => {
    const port = browser.runtime.connect({ name: SIDEPANEL_PORT });
    return () => port.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen flex-col gap-3 p-3">
      <header className="flex items-center gap-2">
        <Egg size={22} />
        <span className="text-base font-bold">Hatch</span>
      </header>

      <nav className="flex gap-1 border-b border-[var(--border)]">
        {(
          [
            ["draft", "Draft"],
            ["hatches", incubating ? `My Hatches (${incubating})` : "My Hatches"],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-2 pb-2 text-sm ${tab === id ? "border-b-2 border-[var(--accent)] font-semibold" : "text-[var(--muted)]"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "draft" &&
        (active.status === "ready" ? (
          <DraftTab key={active.page.url} tabId={active.tabId} page={active.page} presets={presets} />
        ) : active.status === "loading" ? (
          <Muted>Reading this page…</Muted>
        ) : (
          <div className="flex flex-col gap-2">
            <Muted>{active.reason}</Muted>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </div>
        ))}
      {tab === "hatches" && <HatchesTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
