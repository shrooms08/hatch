// /unclaimed: link coins whose creator fees are waiting for their owner, most held first. Read-only: Hatch never
// tags, posts to or messages owners; owners find their coin here (or on its page) and claim it themselves.
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { useQuery } from '@tanstack/react-query';
import Page from '@/components/ui/Page/Page';
import { Button, Card, LinkBadge } from '@/components/ds';
import { HELD_BY_VAULT, formatSol } from '@/lib/links/claimShared';
import type { PoolLink } from '@/lib/dbc/pool';

type Coin = { mint: string; title: string | null; platform: PoolLink['platform']; ownerHandle: string | null; displayUrl: string; coinName: string | null; ticker: string | null; heldSol: string };

export const getServerSideProps: GetServerSideProps = async () => {
  const { linkNetwork } = await import('@/lib/server/links/chain');
  return linkNetwork() ? { props: {} } : { notFound: true };
};

export default function Unclaimed() {
  const q = useQuery({
    queryKey: ['links', 'unclaimed'],
    queryFn: async () => {
      const res = await fetch('/api/links/unclaimed');
      if (!res.ok) throw new Error('Could not load unclaimed coins');
      return ((await res.json()) as { coins: Coin[] }).coins;
    },
    refetchInterval: 60_000,
  });
  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Unclaimed link coins - Hatch</title>
      </Head>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-bold text-ink">Unclaimed</h1>
          <p className="text-sm text-ink-2">Coins for links whose owners haven&apos;t claimed yet. Their share of trading fees is {HELD_BY_VAULT}, for as long as it takes.</p>
        </div>
        {q.isLoading && <Card className="rounded-[20px] p-5 text-sm text-ink-2">Loading…</Card>}
        {q.error && <Card className="rounded-[20px] p-5 text-sm text-danger">{(q.error as Error).message}</Card>}
        {q.data?.length === 0 && <Card className="rounded-[20px] p-5 text-sm text-ink-2">No fees are waiting right now.</Card>}
        {q.data?.map((c) => (
          <Card key={c.mint} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] p-4 text-sm">
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/token/${c.mint}`} className="truncate font-semibold text-ink hover:text-ink-accent">
                {c.coinName ?? 'Link coin'} {c.ticker && <span className="font-mono text-ink-muted">${c.ticker}</span>}
              </Link>
              <span className="truncate text-ink-2">{c.title ?? c.displayUrl}</span>
              <span className="flex items-center gap-2 text-xs text-ink-muted">
                <LinkBadge platform={c.platform} className="h-6 px-2 text-[11px]" />
                {c.ownerHandle && <span>Owner: {c.ownerHandle}</span>}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-ink">{formatSol(Number(c.heldSol))} held</span>
              <Button asChild size="sm">
                <Link href={`/claim/${c.mint}`}>Claim</Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
