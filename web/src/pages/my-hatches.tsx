import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Decimal from 'decimal.js';
import Page from '@/components/ui/Page/Page';
import { Amount, Button, Card, EGG_RADIUS, EggGlyph, Overline, ShellBar, Skeleton, StatusPill, notify } from '@/components/ds';
import { TokenAvatar } from '@/components/Hatch/TokenAvatar';
import { useHatchPools, useQuoteSymbol, useTokenMetadata } from '@/hooks/useHatch';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildClaimCreatorFees, signAndSend } from '@/lib/dbc/transactions';
import { formatAmount, formatPercent } from '@/lib/format/amount';
import { getConnection } from '@/lib/solana/connection';
import { EXPLORER_NAME, explorerTxUrl } from '@/lib/config/network';
import { progressInk } from '@/components/ds/Progress';
import { cn } from '@/lib/utils';

const hasFees = (p: HatchPool) => !p.fees.creatorQuote.isZero() || !p.fees.creatorBase.isZero();

/** Claims creator fees for one pool with the existing transaction builder. */
function useClaim() {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  return async (pool: HatchPool, label: string) => {
    const connection = getConnection();
    const tx = await buildClaimCreatorFees({ connection, creator: wallet.publicKey!, pool: pool.address });
    const sig = await signAndSend(wallet, connection, tx);
    notify.success({ title: `Claimed fees from ${label}`, action: { label: `View on ${EXPLORER_NAME}`, href: explorerTxUrl(sig) } });
    await queryClient.invalidateQueries(['hatch']);
  };
}

function MyHatchCard({ pool }: { pool: HatchPool }) {
  const { data: md } = useTokenMetadata(pool.baseMint);
  const quote = useQuoteSymbol(pool.quote);
  const claim = useClaim();
  const [busy, setBusy] = useState(false);
  const label = md?.symbol ? `$${md.symbol}` : 'your token';
  return (
    <Card className="flex flex-col gap-3 rounded-[18px] p-3.5 transition-colors hover:border-line md:p-5">
      <Link href={`/token/${pool.baseMint}`} className="group flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50">
        <TokenAvatar mint={pool.baseMint} size={48} paired={pool.presetId === 'STOCK' ? quote : null} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] font-semibold text-ink group-hover:text-ink-accent">{md?.name ?? '…'}</span>
          <span className="truncate font-mono text-xs font-medium text-ink-muted">
            <span className={progressInk(pool.progress, pool.isMigrated)}>{formatPercent(pool.isMigrated ? 1 : pool.progress)}</span> ·{' '}
            {formatAmount(pool.isMigrated ? pool.thresholdUi : pool.quoteReserveUi)} / {formatAmount(pool.thresholdUi)} {quote}
          </span>
        </div>
        <StatusPill status={pool.status} size="sm" />
      </Link>
      <ShellBar progress={pool.progress} hatched={pool.isMigrated} height={8} />
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[13px] font-medium text-ink">
          <Amount value={pool.fees.creatorQuote} /> <span className="text-ink-muted">{quote} claimable</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-ink-accent hover:text-ink-accent"
          disabled={!hasFees(pool) || busy}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await claim(pool, label);
            } catch (e) {
              notify.error({ title: "Claim didn't go through", body: e instanceof Error ? e.message : 'Claim failed' });
            } finally {
              setBusy(false);
            }
          }}
        >
          Claim
        </Button>
      </div>
    </Card>
  );
}

function ClaimableSummary({ pools }: { pools: HatchPool[] }) {
  const claim = useClaim();
  const [busy, setBusy] = useState<string | null>(null);
  const withFees = pools.filter(hasFees);
  // Totals per quote token (SOL pools and NVDAx pools add up separately).
  const totals = new Map<string, { pool: HatchPool; sum: Decimal }>();
  for (const p of withFees) {
    const t = totals.get(p.quote.address) ?? { pool: p, sum: new Decimal(0) };
    t.sum = t.sum.add(p.fees.creatorQuote);
    totals.set(p.quote.address, t);
  }
  const claimAll = async () => {
    for (const [i, p] of withFees.entries()) {
      setBusy(`Claiming ${i + 1} of ${withFees.length}… confirm in your wallet`);
      try {
        await claim(p, `token ${i + 1} of ${withFees.length}`);
      } catch (e) {
        notify.error({ title: "Claim didn't go through", body: e instanceof Error ? e.message : 'Claim failed' });
        break;
      }
    }
    setBusy(null);
  };
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Overline className="text-[10px] md:text-[11px]">Claimable</Overline>
        {totals.size === 0 ? (
          <span className="font-mono text-[13px] font-medium text-ink-muted md:text-base">Nothing to claim yet</span>
        ) : (
          [...totals.values()].map(({ pool, sum }, i) => <QuoteTotal key={pool.quote.address} pool={pool} sum={sum} plus={i > 0} />)
        )}
        {busy && <span className="text-xs text-ink-accent">{busy}</span>}
      </div>
      <Button size="header" onClick={claimAll} disabled={!withFees.length || !!busy} loading={!!busy}>
        Claim all
      </Button>
    </Card>
  );
}

function QuoteTotal({ pool, sum, plus }: { pool: HatchPool; sum: Decimal; plus: boolean }) {
  const quote = useQuoteSymbol(pool.quote);
  return (
    <span className="font-mono text-[13px] font-medium leading-[1.4] text-ink md:text-lg">
      {plus && '+ '}
      <Amount value={sum} unit={quote} unitClassName="text-ink" />
    </span>
  );
}

function EmptyNest({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border-[1.5px] border-dashed border-line-strong px-5 py-12 text-center">
      <div aria-hidden className="h-[70px] w-14 border-[2.5px] border-dashed border-yolk" style={{ borderRadius: EGG_RADIUS }} />
      <span className="font-display text-lg font-bold text-ink">{title}</span>
      <span className="max-w-sm text-[13px] text-ink-2">{body}</span>
      {action}
    </div>
  );
}

export default function MyHatches() {
  const { publicKey, connecting } = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const creator = publicKey?.toBase58();
  const { data, isLoading, error, refetch } = useHatchPools({ creator, enabled: !!creator });

  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>My Hatches - Hatch</title>
      </Head>
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[34px] font-bold leading-none tracking-[-0.035em] text-ink md:text-[44px]">My Hatches</h1>
          <p className="text-[15px] text-ink-2">Tokens you launched with Hatch, and the creator fees you can claim.</p>
        </div>

        {!creator ? (
          <EmptyNest
            title={connecting ? 'Connecting…' : 'Connect to see your nest'}
            body="Your hatches are read from chain by the wallet that launched them."
            action={
              <Button size="header" onClick={() => setShowModal(true)} loading={connecting}>
                Connect wallet
              </Button>
            }
          />
        ) : isLoading ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <Skeleton className="h-24 rounded-[18px] md:col-span-2" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-[18px]" />
            ))}
          </div>
        ) : error ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="font-display text-xl font-semibold text-ink">Couldn&apos;t read your hatches</span>
            <span className="text-sm text-ink-2">{error instanceof Error ? error.message : 'The chain read failed.'}</span>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </Card>
        ) : !data?.length ? (
          <EmptyNest
            title="Your nest is empty"
            body="Your first token is one click away."
            action={
              <Button asChild size="header">
                <Link href="/launch">
                  <EggGlyph size={14} />
                  Hatch your first token
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <ClaimableSummary pools={data} />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              {data.map((p) => (
                <MyHatchCard key={p.address} pool={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
