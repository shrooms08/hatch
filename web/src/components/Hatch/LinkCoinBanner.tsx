// Token page, link coins only: which link this coin is for, who owns that link, and whether they claimed it.
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ds';

type LinkInfo = { canonicalId: string; kind: string; displayUrl: string; title: string | null; ownerPlatform: string | null; ownerHandle: string | null; status: string; claimed: boolean };

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
  return (
    <Card className="flex flex-col gap-2 rounded-[24px] px-5 py-5 md:px-9">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-2">Coin for:</span>
        <a href={link.displayUrl} target="_blank" rel="noreferrer noopener" className="min-w-0 break-all font-mono text-sm font-medium text-ink-accent hover:underline">
          {link.displayUrl}
        </a>
        <span className={link.claimed ? 'rounded-pill border border-success/40 px-2 py-0.5 text-[11px] font-semibold text-success' : 'rounded-pill border border-warning/40 px-2 py-0.5 text-[11px] font-semibold text-warning'}>
          {link.claimed ? 'Claimed' : 'Unclaimed'}
        </span>
      </div>
      {link.ownerHandle && (
        <span className="text-sm text-ink-2">
          Owner: <span className="font-medium text-ink">{link.ownerHandle}</span> {link.ownerPlatform ? PLATFORM[link.ownerPlatform] ?? '' : ''}
          {!link.claimed && <span className="text-ink-muted"> · their share of trading fees is held for them until they claim it</span>}
        </span>
      )}
    </Card>
  );
}
