import { HATCH_WEB_URL, NETWORK } from "../../../lib/config";
import { sendToBackground } from "../../../lib/messages";
import { DEFAULT_SETTINGS, KEYS, updateSettings, type Settings } from "../../../lib/storage";
import { useStorageValue } from "../hooks";
import { Button, Card, Muted } from "./ui";

export function SettingsTab() {
  const settings = useStorageValue<Settings>(KEYS.settings, DEFAULT_SETTINGS);
  const wallet = useStorageValue<string | null>(KEYS.wallet, null);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <Card>
        <label className="flex items-center justify-between gap-2">
          <span>Hide the egg everywhere</span>
          <input
            type="checkbox"
            checked={settings.hiddenEverywhere}
            onChange={(e) => void updateSettings((s) => ({ ...s, hiddenEverywhere: e.target.checked }))}
          />
        </label>
      </Card>

      <Card>
        <p className="mb-2">Hidden on these sites</p>
        {settings.hiddenSites.length === 0 && <Muted>None.</Muted>}
        {settings.hiddenSites.map((site) => (
          <div key={site} className="flex items-center justify-between">
            <span>{site}</span>
            <Button variant="ghost" onClick={() => void updateSettings((s) => ({ ...s, hiddenSites: s.hiddenSites.filter((x) => x !== site) }))}>
              Show again
            </Button>
          </div>
        ))}
      </Card>

      <Card>
        <p>Tracking wallet: {wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "none"}</p>
        {wallet && (
          <Button variant="ghost" className="mt-1 px-0" onClick={() => void sendToBackground({ type: "forget-wallet" })}>
            Stop tracking this wallet
          </Button>
        )}
        <Muted>Hatch only stores your public address. Keys never leave Phantom.</Muted>
      </Card>

      <Muted>
        Web app: {HATCH_WEB_URL} · {NETWORK}
      </Muted>
    </div>
  );
}
