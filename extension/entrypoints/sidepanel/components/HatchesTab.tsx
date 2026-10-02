import { HATCH_WEB_URL, tokenPageUrl } from "../../../lib/config";
import { sendToBackground } from "../../../lib/messages";
import { KEYS, type HatchesCache } from "../../../lib/storage";
import { useStorageValue } from "../hooks";
import { Button, Card, Muted } from "./ui";

export function HatchesTab() {
  const wallet = useStorageValue<string | null>(KEYS.wallet, null);
  const cache = useStorageValue<HatchesCache | null>(KEYS.hatches, null);

  if (!wallet) {
    return (
      <Card className="text-sm">
        <p className="mb-2">Connect your wallet on the Hatch web app and your tokens will show up here.</p>
        <a className="text-[var(--accent)] underline" href={HATCH_WEB_URL} target="_blank" rel="noreferrer">
          Open Hatch
        </a>
      </Card>
    );
  }

  const list = cache?.wallet === wallet ? cache.list : [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Muted>
          Wallet {wallet.slice(0, 4)}…{wallet.slice(-4)}
          {cache?.at ? ` · updated ${new Date(cache.at).toLocaleTimeString()}` : ""}
        </Muted>
        <Button variant="ghost" onClick={() => void sendToBackground({ type: "refresh-hatches" })}>
          Refresh
        </Button>
      </div>
      {cache?.error && <Muted>Couldn't refresh: {cache.error}</Muted>}
      {list.length === 0 && <Muted>No hatches yet.</Muted>}
      {list.map((h) => (
        <a key={h.mint} href={tokenPageUrl(h.tokenUrl)} target="_blank" rel="noreferrer" className="block">
          <Card className="hover:border-white/30">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">
                {h.name} {h.symbol && <span className="text-[var(--muted)]">${h.symbol}</span>}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">{h.status}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, h.progress)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
              <span>{h.progress.toFixed(2)}% to hatch</span>
              {h.claimableCreatorFees.hasFees && (
                <span>
                  {h.claimableCreatorFees.amount} {h.claimableCreatorFees.symbol} to claim
                </span>
              )}
            </div>
          </Card>
        </a>
      ))}
    </div>
  );
}
