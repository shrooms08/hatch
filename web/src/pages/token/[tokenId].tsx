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
import { HatchPoolPanel } from '@/components/Hatch/HatchPoolPanel';
import { TradePanel } from '@/components/Hatch/TradePanel';
import { ClaimCreatorFees } from '@/components/Hatch/ClaimCreatorFees';
import { ENABLE_JUPITER_DATA } from '@/lib/config/network';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect } from 'react';

const Terminal = dynamic(() => import('@/components/Terminal'), { ssr: false });

/** On-chain Hatch panel: works on any network, no indexers. */
const HatchOnChain = ({ mint }: { mint: string }) => {
  const { data: pool, isLoading, error } = useHatchPool(mint);
  const { data: md } = useTokenMetadata(mint);
  const symbol = md?.symbol || 'token';

  if (isLoading) return <p className="text-sm text-neutral-400">Reading pool from chain…</p>;
  if (error) return <p className="text-sm text-rose">{error instanceof Error ? error.message : 'Failed to load pool'}</p>;
  if (!pool) return <p className="text-sm text-neutral-400">No Hatch (DBC) pool found for this token.</p>;

  return (
    <div className="flex flex-col gap-4">
      <HatchPoolPanel pool={pool} symbol={symbol} />
      <TradePanel pool={pool} baseSymbol={symbol} />
      <ClaimCreatorFees pool={pool} baseSymbol={symbol} />
    </div>
  );
};

/** Page used when Jupiter data is off (default, and always on devnet). */
const HatchTokenPage = () => {
  const mint = useRouteMint();
  const { data: pool } = useHatchPool(mint);
  const { data: md } = useTokenMetadata(mint);
  return (
    <Page>
      <Head>
        <title>{md?.symbol ? `$${md.symbol} - Hatch` : 'Token - Hatch'}</title>
      </Head>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="rounded-lg border border-neutral-700 p-4">
          {mint && <HatchTokenHeader mint={mint} presetId={pool?.presetId ?? null} />}
        </div>
        {mint && <HatchOnChain mint={mint} />}
      </div>
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
