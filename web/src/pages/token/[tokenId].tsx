import { TokenPageMsgHandler } from '@/components/Token/TokenPageMsgHandler';
import { TokenChart } from '@/components/TokenChart/TokenChart';
import { TokenDetails } from '@/components/TokenHeader/TokenDetail';
import { TokenHeader } from '@/components/TokenHeader/TokenHeader';
import { TokenStats } from '@/components/TokenHeader/TokenStats';
import { TokenBottomPanel } from '@/components/TokenTable';
import Page from '@/components/ui/Page/Page';
import { DataStreamProvider, useDataStream } from '@/contexts/DataStreamProvider';
import { TokenChartProvider } from '@/contexts/TokenChartProvider';
import { useTokenAddress, useTokenInfo } from '@/hooks/queries';
import { useHatchPool, useRouteMint, useTokenMetadata } from '@/hooks/useHatch';
import { HatchTokenHeader } from '@/components/Hatch/HatchTokenHeader';
import { TradePanel } from '@/components/Hatch/TradePanel';
import { AboutCard, HatchedCard, ProgressCard, StageTimeline, TokenHero, TradeOnMeteora } from '@/components/Hatch/TokenSections';
import { Button, Card, Skeleton } from '@/components/ds';
import { ClaimCreatorFees } from '@/components/Hatch/ClaimCreatorFees';
import { ENABLE_JUPITER_DATA } from '@/lib/config/network';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect } from 'react';

const Terminal = dynamic(() => import('@/components/Terminal'), { ssr: false });

/** On-chain Hatch token page body: works on any network, no indexers. */
const HatchOnChain = ({ mint }: { mint: string }) => {
  const { data: pool, isLoading, error, refetch } = useHatchPool(mint);
  const { data: md } = useTokenMetadata(mint);
  const symbol = md?.symbol || 'token';

  if (isLoading)
    return (
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Skeleton className="h-[452px] rounded-[24px]" />
        <Skeleton className="h-[640px] rounded-[24px]" />
      </div>
    );
  if (error || !pool)
    return (
      <Card className="flex flex-col items-center gap-3 rounded-[24px] px-6 py-16 text-center">
        <span className="font-display text-xl font-semibold text-ink">{error ? 'Couldn\u2019t read this pool' : 'No Hatch pool for this token'}</span>
        <span className="max-w-md text-sm text-ink-2">
          {error ? (error instanceof Error ? error.message : 'The chain read failed.') : 'This mint was not launched with Hatch, or its pool is not on this network.'}
        </span>
        {error && (
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
      </Card>
    );

  return (
    <div className="grid items-start gap-5 md:gap-7 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-w-0 flex-col gap-5 md:gap-6">
        {pool.isMigrated ? <HatchedCard pool={pool} symbol={md?.symbol ?? ''} /> : <ProgressCard pool={pool} />}
        {!pool.isMigrated && <StageTimeline pool={pool} />}
        <div className="max-lg:order-last">
          <AboutCard pool={pool} mint={mint} />
        </div>
      </div>
      <div className="flex flex-col gap-5 lg:sticky lg:top-24">
        {pool.isMigrated ? <TradeOnMeteora pool={pool} /> : <TradePanel pool={pool} baseSymbol={symbol} />}
        <ClaimCreatorFees pool={pool} baseSymbol={symbol} />
      </div>
    </div>
  );
};

/** Page used when Jupiter data is off (default, and always on devnet). */
const HatchTokenPage = () => {
  const mint = useRouteMint();
  const { data: pool } = useHatchPool(mint);
  const { data: md } = useTokenMetadata(mint);
  return (
    <Page containerClassName="gap-7 md:gap-9 md:pt-10">
      <Head>
        <title>{md?.symbol ? `$${md.symbol} · ${md.name} - Hatch` : 'Token - Hatch'}</title>
      </Head>
      {mint && <TokenHero mint={mint} pool={pool} />}
      {mint && <HatchOnChain mint={mint} />}
    </Page>
  );
};

// ---------- Jupiter-indexer version (feature-flagged; mainnet only) ----------

const SwapWidget = () => {
  const tokenId = useTokenAddress();
  if (!tokenId) return null;
  return <Terminal mint={tokenId} />;
};

export const TokenPageWithContext = () => {
  const tokenId = useTokenAddress();
  const { data: poolId } = useTokenInfo((data) => data?.id);
  const { subscribeTxns, unsubscribeTxns, subscribePools, unsubscribePools } = useDataStream();

  useEffect(() => {
    if (!tokenId) return;
    subscribeTxns([tokenId]);
    return () => unsubscribeTxns([tokenId]);
  }, [tokenId, subscribeTxns, unsubscribeTxns]);

  useEffect(() => {
    if (!poolId) return;
    subscribePools([poolId]);
    return () => unsubscribePools([poolId]);
    // dont track tokenId to prevent data mismatch
  }, [poolId, subscribePools, unsubscribePools]);

  return (
    <Page>
      <TokenPageMsgHandler />
      <div className="flex flex-col lg:h-[calc(100vh-108px)]">
        <div className="mb-4 flex shrink-0 rounded-lg border border-neutral-700 p-3">
          <TokenHeader className="max-sm:order-1" />
        </div>

        <div className="flex w-full flex-col gap-4 md:flex-row lg:min-h-0 lg:flex-1">
          <div className="flex flex-col gap-4 max-lg:mb-8 max-sm:w-full max-sm:order-3 lg:min-w-[400px] lg:overflow-y-auto">
            {tokenId && <HatchTokenHeader mint={tokenId} presetId={null} />}
            {tokenId && <HatchOnChain mint={tokenId} />}
            <TokenDetails />
            <div>
              <SwapWidget />
            </div>
          </div>

          <div className="flex w-full flex-col border-neutral-850 max-sm:order-2 lg:min-h-0">
            <div className="shrink-0">
              <TokenStats key={`token-stats-${poolId}`} />
            </div>
            <div className="flex h-[300px] w-full shrink-0 flex-col lg:h-[min(500px,55vh)]">
              <TokenChartProvider>
                <TokenChart />
              </TokenChartProvider>
            </div>
            <TokenBottomPanel className="flex flex-col overflow-hidden max-lg:h-screen lg:min-h-0 lg:flex-1" />
          </div>
        </div>
      </div>
    </Page>
  );
};

export default function TokenPage() {
  if (!ENABLE_JUPITER_DATA) return <HatchTokenPage />;
  return (
    <DataStreamProvider>
      <TokenPageWithContext />
    </DataStreamProvider>
  );
}
