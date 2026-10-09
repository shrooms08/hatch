import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Decimal from 'decimal.js';
import Page from '@/components/ui/Page/Page';
import { Amount, Button, Card, EGG_RADIUS, EggGlyph, Overline, PresetBadge, Segmented, ShellBar, Skeleton, StatusPill, TestBadge, notify } from '@/components/ds';
import { TokenAvatar } from '@/components/Hatch/TokenAvatar';
import { useHatchPools, useHoldings, useIsTestLaunch, useQuoteSymbol, useTokenMetadata } from '@/hooks/useHatch';
import type { Holding } from '@/pages/api/holdings';
import type { PresetId } from '@/lib/presets';
import { useRouter } from 'next/router';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildClaimCreatorFees, signAndSend } from '@/lib/dbc/transactions';
import { formatAmount, formatPercent } from '@/lib/format/amount';
import { getConnection } from '@/lib/solana/connection';
import { EXPLORER_NAME, explorerTxUrl } from '@/lib/config/network';
import { progressInk } from '@/components/ds/Progress';
import { cn } from '@/lib/utils';
import { reportTxError, type FriendlyError } from '@/lib/txErrors';
import { TxErrorNote } from '@/components/Hatch/TxErrorNote';

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
  const [txError, setTxError] = useState<FriendlyError | null>(null);
  const label = md?.symbol ? `$${md.symbol}` : 'your token';
  const isTest = useIsTestLaunch(pool.baseMint);
  return (
    <Card className="flex flex-col gap-3 rounded-[18px] p-3.5 transition-colors hover:border-line md:p-5">
      <Link href={`/token/${pool.baseMint}`} className="group flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50">
        <TokenAvatar mint={pool.baseMint} size={48} paired={pool.presetId === 'STOCK' ? quote : null} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink group-hover:text-ink-accent">{md?.name ?? '…'}</span>
            {isTest && <TestBadge size="sm" />}
          </span>
          <span className="truncate font-mono text-xs font-medium text-ink-muted">
            <span className={progressInk(pool.progress, pool.isMigrated)}>{formatPercent(pool.isMigrated ? 1 : pool.progress)}</span> ·{' '}
            {formatAmount(pool.isMigrated ? pool.thresholdUi : pool.quoteReserveUi)} / {formatAmount(pool.thresholdUi)} {quote}
          </span>
        </div>
        <StatusPill status={pool.status} size="sm" />
      </Link>
      <ShellBar progress={pool.progress} hatched={pool.isMigrated} height={8} />
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5 font-mono text-[13px] font-medium text-ink">
          <span className="truncate">
            <Amount value={pool.fees.creatorQuote} /> <span className="text-ink-muted">{quote} claimable</span>
          </span>
          {/* Earnings line: your share of all trading fees so far, paid in the quote token. */}
          <span className="truncate text-[11px] text-ink-muted">
            Earned {formatAmount(pool.fees.creatorEarnedQuote)} {quote} · claimed {formatAmount(pool.fees.creatorClaimedQuote)}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-ink-accent hover:text-ink-accent"
          disabled={!hasFees(pool) || busy}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setTxError(null);
            try {
              await claim(pool, label);
            } catch (e) {
              const f = reportTxError(e, {}, 'claim');
              setTxError(f);
              notify.error({ title: "Claim didn't go through", body: f.message });
            } finally {
              setBusy(false);
            }
          }}
        >
          Claim
        </Button>
      </div>
      <TxErrorNote error={txError} onDismiss={() => setTxError(null)} />
    </Card>
  );
}

function ClaimableSummary({ pools }: { pools: HatchPool[] }) {
  const claim = useClaim();
  const [busy, setBusy] = useState<string | null>(null);
  const [txError, setTxError] = useState<FriendlyError | null>(null);
  const withFees = pools.filter(hasFees);
  // Totals per quote token (SOL pools and NVDAx pools add up separately).
  const totals = new Map<string, { pool: HatchPool; sum: Decimal }>();
  for (const p of withFees) {
    const t = totals.get(p.quote.address) ?? { pool: p, sum: new Decimal(0) };
    t.sum = t.sum.add(p.fees.creatorQuote);
    totals.set(p.quote.address, t);
  }
  const claimAll = async () => {
    setTxError(null);
    for (const [i, p] of withFees.entries()) {
      setBusy(`Claiming ${i + 1} of ${withFees.length}… confirm in your wallet`);
      try {
        await claim(p, `token ${i + 1} of ${withFees.length}`);
      } catch (e) {
        const f = reportTxError(e, {}, 'claim');
        setTxError(f);
        notify.error({ title: "Claim didn't go through", body: f.message });
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
      <TxErrorNote error={txError} onDismiss={() => setTxError(null)} className="w-full" />
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

type View = 'created' | 'holdings';

export default function MyHatches() {
  const { publicKey, connecting } = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const router = useRouter();
  const wallet = publicKey?.toBase58();
  const view: View = router.query.view === 'holdings' ? 'holdings' : 'created';
  const setView = (v: View): void => {
    void router.replace({ pathname: router.pathname, query: v === 'holdings' ? { view: v } : {} }, undefined, { shallow: true });
  };

  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>My Hatches - Hatch</title>
      </Head>
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[34px] font-bold leading-none tracking-[-0.035em] text-ink md:text-[44px]">My Hatches</h1>
          <p className="text-[15px] text-ink-2">
            {view === 'created' ? 'Tokens you launched with Hatch, and the creator fees you can claim.' : 'Hatch tokens in your wallet, read from chain.'}
          </p>
        </div>
        <Segmented
          label="My Hatches view"
          value={view}
          onChange={setView}
          options={[
            { value: 'created', label: 'Created' },
            { value: 'holdings', label: 'Holdings' },
          ]}
          className="w-full max-w-[320px]"
        />

        {!wallet ? (
          <EmptyNest
            title={connecting ? 'Connecting…' : 'Connect to see your nest'}
            body={view === 'created' ? 'Your hatches are read from chain by the wallet that launched them.' : 'Your holdings are read from chain for the connected wallet.'}
            action={
              <Button size="header" onClick={() => setShowModal(true)} loading={connecting}>
                Connect wallet
              </Button>
            }
          />
        ) : view === 'created' ? (
          <CreatedView creator={wallet} />
        ) : (
          <HoldingsView wallet={wallet} />
        )}
      </div>
    </Page>
  );
}

function LoadError({ what, error, retry }: { what: string; error: unknown; retry: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="font-display text-xl font-semibold text-ink">Couldn&apos;t read your {what}</span>
      <span className="text-sm text-ink-2">{error instanceof Error ? error.message : 'The chain read failed.'}</span>
      <Button variant="secondary" size="sm" onClick={retry}>
        Try again
      </Button>
    </Card>
  );
}

const GridSkeleton = () => (
  <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
    <Skeleton className="h-24 rounded-[18px] md:col-span-2" />
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-36 rounded-[18px]" />
    ))}
  </div>
);

function CreatedView({ creator }: { creator: string }) {
  const { data, isLoading, error, refetch } = useHatchPools({ creator, enabled: !!creator });
  if (isLoading) return <GridSkeleton />;
  if (error) return <LoadError what="hatches" error={error} retry={() => void refetch()} />;
  if (!data?.length)
    return (
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
    );
  return (
    <>
      <ClaimableSummary pools={data} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {data.map((p) => (
          <MyHatchCard key={p.address} pool={p} />
        ))}
      </div>
    </>
  );
}

const usd = (v: number) => (v < 0.01 ? '<$0.01' : `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 2 : 0 })}`);

function HoldingsView({ wallet }: { wallet: string }) {
  const { data, isLoading, error, refetch } = useHoldings(wallet);
  if (isLoading) return <GridSkeleton />;
  if (error) return <LoadError what="holdings" error={error} retry={() => void refetch()} />;
  if (!data?.length)
    return (
      <EmptyNest
        title="No holdings yet"
        body="Tokens you buy on Hatch show up here."
        action={
          <Button asChild size="header" variant="secondary">
            <Link href="/#hatches">Explore hatches</Link>
          </Button>
        }
      />
    );
  const total = data.reduce((n, h) => n + (h.valueUsd ?? 0), 0);
  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <Overline className="text-[10px] md:text-[11px]">Holdings value · estimate</Overline>
          <span className="font-mono text-lg font-medium text-ink md:text-2xl">≈ {usd(total)}</span>
        </div>
        <span className="max-w-[340px] text-xs leading-normal text-ink-muted">Estimates from the curve price and Jupiter&apos;s price of the quote token. Selling moves the price.</span>
      </Card>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {data.map((h) => (
          <HoldingCard key={h.mint} h={h} />
        ))}
      </div>
    </>
  );
}

function HoldingCard({ h }: { h: Holding }) {
  return (
    <Card className="flex flex-col gap-3 rounded-[18px] p-3.5 md:p-5">
      <Link href={h.tokenUrl} className="group flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50">
        <TokenAvatar mint={h.mint} size={48} paired={h.preset === 'STOCK' ? h.quoteSymbol : null} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink group-hover:text-ink-accent">{h.name}</span>
            {h.test && <TestBadge size="sm" />}
          </span>
          <span className="flex min-w-0 items-center gap-2 font-mono text-xs font-medium text-ink-muted">
            {h.symbol && <span>${h.symbol}</span>}
            <PresetBadge preset={h.preset as PresetId} quote={h.quoteSymbol} variant="dot" className="h-6 px-2 text-[11px]" />
          </span>
        </div>
        <StatusPill status={h.statusId} size="sm" />
      </Link>
      <div className="grid grid-cols-2 gap-2 rounded-md bg-inset px-3.5 py-3 font-mono text-[13px]">
        <span className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Balance</span>
          <span className="truncate text-ink">
            {h.balance} {h.symbol}
          </span>
        </span>
        <span className="flex flex-col gap-0.5 text-right">
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Value (est.)</span>
          <span className="truncate text-ink">
            {h.valueQuote} {h.quoteSymbol}
            {h.valueUsd != null && <span className="text-ink-muted"> · ≈ {usd(h.valueUsd)}</span>}
          </span>
        </span>
      </div>
      <ShellBar progress={h.progressPct / 100} hatched={h.hatched} height={8} />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-ink-muted">{h.hatched ? 'Hatched' : `${h.progressPct < 1 ? h.progressPct.toFixed(2) : Math.floor(h.progressPct)}% to hatch`}</span>
        <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-ink-accent hover:text-ink-accent">
          <Link href={h.tokenUrl}>{h.hatched ? 'Trade' : 'Sell'}</Link>
        </Button>
      </div>
    </Card>
  );
}
