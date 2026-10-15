// /scouts: who hatched link coins first. Credit only: scouts get no share of fees.
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useQuery } from '@tanstack/react-query';
import Page from '@/components/ui/Page/Page';
import { Card } from '@/components/ds';
import { shortWallet } from '@/lib/links/claimShared';
import { explorerAddressUrl } from '@/lib/config/network';

type Scout = { wallet: string; hatched: number; graduated: number };

export const getServerSideProps: GetServerSideProps = async () => {
  const { linkNetwork } = await import('@/lib/server/links/chain');
  return linkNetwork() ? { props: {} } : { notFound: true };
};

export default function Scouts() {
  const q = useQuery({
    queryKey: ['links', 'scouts'],
    queryFn: async () => {
      const res = await fetch('/api/links/scouts');
      if (!res.ok) throw new Error('Could not load scouts');
      return ((await res.json()) as { scouts: Scout[] }).scouts;
    },
  });
  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Scouts - Hatch</title>
      </Head>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-bold text-ink">Scouts</h1>
          <p className="text-sm text-ink-2">Wallets that hatched link coins first. Credit only: scouts get no share of fees.</p>
        </div>
        {q.isLoading && <Card className="rounded-[20px] p-5 text-sm text-ink-2">Loading…</Card>}
        {q.error && <Card className="rounded-[20px] p-5 text-sm text-danger">{(q.error as Error).message}</Card>}
        {q.data && (
          <Card className="overflow-hidden rounded-[20px] text-sm">
            <div className="grid grid-cols-[40px_1fr_90px_90px] gap-2 border-b border-surface-3 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
              <span>#</span>
              <span>Scout</span>
              <span className="text-right">Hatched</span>
              <span className="text-right">Graduated</span>
            </div>
            {q.data.map((s, i) => (
              <div key={s.wallet} className="grid grid-cols-[40px_1fr_90px_90px] gap-2 border-b border-surface-3 px-4 py-3 last:border-b-0">
                <span className="font-mono text-ink-muted">{i + 1}</span>
                <a className="font-mono text-ink hover:text-ink-accent" href={explorerAddressUrl(s.wallet)} target="_blank" rel="noreferrer">
                  {shortWallet(s.wallet)}
                </a>
                <span className="text-right font-mono text-ink">{s.hatched}</span>
                <span className="text-right font-mono text-ink">{s.graduated}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Page>
  );
}
