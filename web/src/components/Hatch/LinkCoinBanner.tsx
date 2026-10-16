// Token page, link coins only: which link this coin is for, who owns that link, and whether they claimed it.
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ds';
import { formatRemaining, timelockRemainingMs } from '@/lib/links/claimRules';

type LinkInfo = {
  canonicalId: string;
  kind: string;
  displayUrl: string;
  title: string | null;
  ownerPlatform: string | null;
  ownerHandle: string | null;
  status: string;
  claimed: boolean;
  disowned?: boolean;
  claimedWallet?: string | null;
  hatchedBy?: string | null;
  firstBuyLamports?: number | null;
  ownerTrustLabel?: string | null;
  ownerTrustSummary?: string | null;
  pendingClaim?: { destination: string; action: 'claim' | 'disown'; timelockUntil: string } | null;
};

const PLATFORM: Record<string, string> = { x: 'on X', youtube: 'on YouTube', github: 'on GitHub', web: 'site' };

export function useLinkForMint(mint: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['hatch', 'link-by-mint', mint],
    queryFn: async (): Promise<LinkInfo | null> => {
      const res = await fetch(`/api/links/by-mint?mint=${encodeURIComponent(mint!)}`);
      if (!res.ok) return null;
      return ((await res.json()) as { link: LinkInfo | null }).link;
    },
    enabled: !!mint && enabled,
    staleTime: 60_000,
  });
}

export function LinkCoinBanner({ mint }: { mint: string }) {
  const { data: link } = useLinkForMint(mint, true);
  if (!link) return null;
  const badge = link.disowned
    ? { text: 'Disowned by owner', cls: 'border-line-strong text-ink-2' }
    : link.claimed
      ? { text: 'Claimed', cls: 'border-success/40 text-success' }
      : { text: 'Unclaimed', cls: 'border-warning/40 text-warning' };
  const firstBuy = link.firstBuyLamports != null ? link.firstBuyLamports / 1e9 : null;
  return (
    <Card className="flex flex-col gap-2 rounded-[24px] px-5 py-5 md:px-9">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-2">Coin for:</span>
        <a href={link.displayUrl} target="_blank" rel="noreferrer noopener" className="min-w-0 break-all font-mono text-sm font-medium text-ink-accent hover:underline">
          {link.displayUrl}
        </a>
        <span className={`rounded-pill border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.text}</span>
      </div>
      {link.ownerHandle && (
        <span className="text-sm text-ink-2">
          Owner: <span className="font-medium text-ink">{link.ownerHandle}</span> {link.ownerPlatform ? PLATFORM[link.ownerPlatform] ?? '' : ''}
          {link.disowned ? (
            <span className="text-ink-muted">
              {' '}
              · disowned the coin; held fees and future fees go to <span className="font-mono">{short(link.claimedWallet)}</span>, a wallet they chose
            </span>
          ) : link.claimed ? (
            <span className="text-ink-muted"> · claimed; their share of trading fees goes to their wallet</span>
          ) : (
            <span className="text-ink-muted"> · their share of trading fees is held for them by Hatch&apos;s vault until they claim it</span>
          )}
        </span>
      )}
      {(link.claimed || link.disowned) && (link.ownerTrustSummary || link.ownerTrustLabel) && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {link.ownerTrustSummary && <span>Owner&apos;s GitHub: {link.ownerTrustSummary}</span>}
          {link.ownerTrustLabel && <span className="rounded-pill border border-warning/40 px-2 py-0.5 text-[11px] font-semibold text-warning">{link.ownerTrustLabel}</span>}
        </span>
      )}
      {link.pendingClaim && !link.claimed && !link.disowned && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-2 text-sm text-ink">
          <span>
            {link.pendingClaim.action === 'disown' ? 'Disown' : 'Claim'} pending to <span className="font-mono">{short(link.pendingClaim.destination)}</span> · executes in{' '}
            {formatRemaining(timelockRemainingMs(link.pendingClaim.timelockUntil))}
          </span>
          <Link href={`/dispute/${mint}`} className="font-medium text-ink-accent hover:underline">
            Dispute this claim
          </Link>
        </span>
      )}
      {(link.hatchedBy || firstBuy != null) && (
        <span className="text-xs text-ink-muted">
          {link.hatchedBy && <>Hatched by <span className="font-mono">{short(link.hatchedBy)}</span></>}
          {link.hatchedBy && firstBuy != null && ' · '}
          {firstBuy != null && <>Hatcher bought {firstBuy.toLocaleString('en-US', { maximumFractionDigits: 4 })} SOL</>}
        </span>
      )}
      {!link.claimed && !link.disowned && !link.pendingClaim && link.kind === 'github_repo' && (
        <Link href={`/claim/${mint}`} className="self-start text-sm font-medium text-ink-accent hover:underline">
          Own this repo? Claim it
        </Link>
      )}
    </Card>
  );
}

const short = (w: string | null | undefined) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '-');
