import Head from 'next/head';
import Link from 'next/link';
import Explore from '@/components/Explore';
import Page from '@/components/ui/Page/Page';
import { Button, DotField, EggGlyph, PuzzleIcon, StatTile, Tag } from '@/components/ds';
import { ChickenOrb } from '@/components/ds/ChickenOrb';
import { TokenArt } from '@/components/ds/TokenArt';
import { HatchTable } from '@/components/Hatch/HatchTable';
import { useHatchPools, useHatchStats } from '@/hooks/useHatch';
import { ENABLE_JUPITER_DATA } from '@/lib/config/network';
import { formatUsdCompact } from '@/lib/format/time';

/** Hero illustration: a news page, the drafted token card, the buddy's hint and the orb. */
function HeroIllustration() {
  return (
    <div className="relative mx-auto hidden h-[520px] w-[560px] shrink-0 lg:block" aria-hidden>
      <div className="absolute left-0 top-5 w-[500px] overflow-hidden rounded-[22px] border border-line bg-surface-1 shadow-hatch-lg">
        <div className="flex h-10 items-center gap-2 border-b border-surface-3 bg-surface-2 px-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[9px] w-[9px] rounded-full bg-line-strong" />
          ))}
          <span className="ml-3 flex h-6 flex-1 items-center rounded-pill bg-hatch-bg px-3 font-mono text-[11px] font-medium text-ink-muted">
            nvidianews.nvidia.com/news/q3-results
          </span>
        </div>
        <div className="flex flex-col gap-3.5 px-7 py-[26px]">
          <span className="font-mono text-[11px] font-medium tracking-[0.1em] text-ink-muted">NEWSROOM · EARNINGS</span>
          <span className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink">NVIDIA announces record quarterly revenue, data center up again</span>
          <div className="flex flex-col gap-2">
            {['100%', '100%', '82%', '64%'].map((w, i) => (
              <div key={i} className="h-[9px] rounded-[9px] bg-surface-3" style={{ width: w }} />
            ))}
          </div>
          <div className="mt-1.5 h-[110px] rounded-md bg-surface-2" />
        </div>
      </div>
      <div className="absolute right-0 top-[228px] flex w-[310px] animate-rise-in flex-col gap-3.5 rounded-lg border border-line-strong bg-surface-2 p-4 shadow-hatch-lg [animation-delay:200ms]">
        <div className="flex items-center gap-3">
          <TokenArt ticker="NVEGG" seed="NVEGG-yolk" paired="NVDAx" size={56} />
          <div className="flex flex-col gap-[3px]">
            <span className="text-base font-semibold text-ink">Green Team Egg</span>
            <span className="font-mono text-[13px] font-medium text-ink-muted">$NVEGG · draft</span>
          </div>
        </div>
        <span className="text-[13px] leading-normal text-ink-2">Pool priced in tokenized NVIDIA. Buyers can pay with SOL.</span>
        <span className="flex h-11 items-center justify-center rounded-pill bg-yolk font-display text-sm font-bold text-ink-on-yolk">Hatch it</span>
      </div>
      <div className="absolute left-[150px] top-[350px] max-w-[220px] animate-rise-in rounded-[16px_16px_4px_16px] bg-shell px-3.5 py-3 text-[13px] font-medium leading-[1.4] text-night shadow-[0_12px_32px_rgba(0,0,0,0.5)] [animation-delay:500ms]">
        This is about NVIDIA. Hatch a coin backed by tokenized NVDA?
      </div>
      <div className="absolute left-[300px] top-[448px]">
        <ChickenOrb size={64} mood="egg" />
      </div>
    </div>
  );
}

function StatsStrip() {
  const { data, isLoading, isError } = useHatchStats();
  const n = (v: number | undefined) => (v === undefined ? '-' : v.toLocaleString('en-US'));
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-[22px] border border-surface-3 bg-surface-1 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
      <StatTile label="Tokens hatched" value={n(data?.tokens)} loading={isLoading} className="border-r border-surface-3 max-md:px-3.5 max-md:py-3" />
      <StatTile label="Unique wallets" value={n(data?.wallets)} loading={isLoading} className="border-r border-surface-3 max-md:px-3.5 max-md:py-3" />
      <StatTile
        label="Volume · USD"
        value={data ? formatUsdCompact(data.volumeUsd) : '-'}
        loading={isLoading}
        className="max-md:px-3.5 max-md:py-3 md:border-r md:border-surface-3"
      />
      <div className="hidden items-center gap-2.5 px-8 font-mono text-xs font-medium md:flex">
        {isError ? (
          <span className="text-ink-muted">OFFLINE</span>
        ) : (
          <>
            <span className="h-2 w-2 animate-live-pulse rounded-full bg-success" />
            <span className="text-success">LIVE</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Chain-only home: hero, live stats, every pool under Hatch's preset configs. */
function HatchHome() {
  const { data, isLoading, error, refetch } = useHatchPools();
  const stats = useHatchStats();
  return (
    <>
      <section className="relative">
        <DotField />
        <div className="relative mx-auto flex max-w-[1440px] items-center gap-14 px-4 pb-10 pt-10 md:px-10 md:pb-[72px] md:pt-[88px] lg:px-20">
          <div className="flex min-w-0 flex-1 flex-col gap-6 md:gap-8">
            <span className="inline-flex h-[34px] items-center gap-2.5 self-start rounded-pill border border-line bg-surface-1 pl-1.5 pr-3.5 text-[13px] font-medium text-ink-2">
              <Tag>New</Tag>
              <span className="truncate">Stock-paired launches<span className="hidden sm:inline"> with tokenized NVIDIA</span></span>
            </span>
            <h1 className="font-display text-[46px] font-bold leading-[0.95] tracking-[-0.045em] text-ink sm:text-[64px] xl:text-[96px]">
              Launch anything <span className="text-yolk">you see.</span>
            </h1>
            <p className="max-w-[560px] text-pretty text-[15px] leading-[1.55] text-ink-2 md:text-[19px]">
              Reading about NVIDIA? Hatch a coin whose pool is priced in tokenized NVIDIA stock (NVDAx) instead of SOL. Pay with plain SOL and we swap it for you.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild glow className="h-[52px] px-7 text-base md:h-[58px]">
                <Link href="/launch">
                  <EggGlyph size={18} />
                  Hatch a token
                </Link>
              </Button>
              <Button asChild variant="secondary" className="h-[52px] bg-surface-1 px-[26px] text-base md:h-[58px]">
                <Link href="/extension">
                  <PuzzleIcon size={18} />
                  Get the extension
                </Link>
              </Button>
            </div>
          </div>
          <HeroIllustration />
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1440px] px-4 md:px-10 lg:px-20">
        <StatsStrip />
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-14 md:px-10 md:pt-[88px] lg:px-20">
        <HatchTable pools={data} isLoading={isLoading} error={error} onRetry={() => void refetch()} createdAt={stats.data?.createdAt} />
      </div>
    </>
  );
}

export default function Index() {
  return (
    <Page bleed={!ENABLE_JUPITER_DATA}>
      <Head>
        <title>Hatch · Launch anything you see</title>
      </Head>
      {ENABLE_JUPITER_DATA ? <Explore /> : <HatchHome />}
    </Page>
  );
}
