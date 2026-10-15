import Page from '@/components/ui/Page/Page';
import { useHatchPool, useRouteMint, useTokenMetadata } from '@/hooks/useHatch';
import { TradePanel } from '@/components/Hatch/TradePanel';
import { AboutCard, HatchedCard, LiveShieldCard, ProgressCard, SniperReceiptCard, TokenHero, TradeOnMeteora } from '@/components/Hatch/TokenSections';
import { HatchInfoCard, LifecycleStepper, MoreHatches } from '@/components/Hatch/TokenLayout';
import { LinkCoinBanner } from '@/components/Hatch/LinkCoinBanner';
import { usePresetConfigs } from '@/hooks/useHatch';
import { isLinkConfig } from '@/lib/presets';
import { Button, Card, Skeleton } from '@/components/ds';
import { ClaimCreatorFees } from '@/components/Hatch/ClaimCreatorFees';
import Head from 'next/head';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { PublicKey } from '@solana/web3.js';
import { SITE_ORIGIN, SocialMeta } from '@/components/SocialMeta';
import { getTokenCard, tokenCardMeta } from '@/lib/server/tokenCard';

type Social = { title: string; description: string; image: string; url: string } | null;
type Props = { mint: string; social: Social };

/**
 * A DBC pool exists for this mint, but not under one of Hatch's configs: Hatch did not launch it and
 * cannot vouch for its curve or fees, so trading (and Pay with SOL) is not offered here.
 */
const NotHatchLaunch = () => (
  <Card className="flex flex-col gap-3 rounded-[24px] border-danger/40 bg-danger/[0.06] p-6" role="alert">
    <span className="font-display text-lg font-semibold text-ink">Not a Hatch launch</span>
    <span className="text-sm leading-normal text-ink-2">
      This token has a Meteora bonding-curve pool, but it was not launched with Hatch. Hatch does not trade it, and Pay with SOL is off.
      Check the pool on an explorer before trading it anywhere.
    </span>
  </Card>
);

/** On-chain Hatch token page body: works on any network, no indexers. */
const HatchOnChain = ({ mint }: { mint: string }) => {
  const { data: pool, isLoading, error, refetch } = useHatchPool(mint);
  const { data: md } = useTokenMetadata(mint);
  const { data: hc } = usePresetConfigs();
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
    // Design v2: lifecycle stepper; two columns (progress, shield, info, about | trade, earnings); more hatches.
    // Mobile: one column in the order progress, trade + earnings, shield, info, about.
    <>
      {hc && isLinkConfig(hc, pool.configKey) && <LinkCoinBanner mint={mint} />}
      {pool.presetId !== null && <LifecycleStepper pool={pool} />}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:gap-7 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-5 max-lg:contents md:gap-6">
          <div className="max-lg:order-1">{pool.isMigrated ? <HatchedCard pool={pool} symbol={md?.symbol ?? ''} /> : <ProgressCard pool={pool} />}</div>
          {/* v2 pools: the Sniper shield with the live fee for the first 60 s, then the shield receipt (else nothing). */}
          <div className="flex flex-col gap-5 empty:hidden max-lg:order-3 md:gap-6">
            <LiveShieldCard pool={pool} />
            <SniperReceiptCard pool={pool} />
          </div>
          <div className="max-lg:order-4">
            <HatchInfoCard pool={pool} />
          </div>
          <div className="empty:hidden max-lg:order-5">
            <AboutCard pool={pool} mint={mint} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-5 max-lg:order-2 lg:sticky lg:top-24">
          {pool.presetId === null && !(hc && isLinkConfig(hc, pool.configKey)) ? (
            <NotHatchLaunch />
          ) : pool.isMigrated ? (
            <TradeOnMeteora pool={pool} />
          ) : (
            <TradePanel pool={pool} baseSymbol={symbol} />
          )}
          <ClaimCreatorFees pool={pool} baseSymbol={symbol} />
        </div>
      </div>
      {pool.presetId !== null && <MoreHatches pool={pool} />}
    </>
  );
};

/** Page used when Jupiter data is off (default, and always on devnet). */
const HatchTokenPage = ({ mint: propMint, social }: Props) => {
  // From getStaticProps, so the server HTML and the first client render agree.
  const routeMint = useRouteMint();
  const mint = propMint || routeMint;
  const { data: pool } = useHatchPool(mint);
  const { data: md } = useTokenMetadata(mint);
  return (
    <Page containerClassName="gap-7 md:gap-9 md:pt-10">
      <Head>
        <title>{md?.symbol ? `$${md.symbol} · ${md.name} - Hatch` : 'Token - Hatch'}</title>
      </Head>
      {social && <SocialMeta {...social} />}
      {mint && <TokenHero mint={mint} pool={pool} />}
      {mint && <HatchOnChain mint={mint} />}
    </Page>
  );
};

export default function TokenPage(props: Props) {
  return <HatchTokenPage {...props} />;
}

// Share cards: the page HTML carries per-token og/twitter tags (crawlers don't run JS). Rendered on first
// request and refreshed every 5 minutes (ISR); the chain read is capped so a slow RPC never blocks the page.
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const mint = String(params?.tokenId ?? '');
  try {
    new PublicKey(mint);
  } catch {
    return { props: { mint, social: null }, revalidate: 3600 };
  }
  const card = await Promise.race([getTokenCard(mint).catch((): null => null), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
  if (!card) return { props: { mint, social: null }, revalidate: 60 };
  const url = `${SITE_ORIGIN}/token/${mint}`;
  return { props: { mint, social: { ...tokenCardMeta(card), image: `${SITE_ORIGIN}/api/og/${mint}`, url } }, revalidate: 300 };
};
