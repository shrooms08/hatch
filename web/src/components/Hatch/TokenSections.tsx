// Token page sections (design/v1 "Token Page" + "Hatched States"). Display only: all data comes
// from chain via the existing hooks.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AddressChip,
  Amount,
  ArrowUpRight,
  Button,
  Card,
  DefRow,
  EGG_RADIUS,
  InspiredChip,
  Overline,
  PresetBadge,
  ShellBar,
  Skeleton,
  StatusPill,
  ShieldBadge,
  TestBadge,
} from '@/components/ds';
import { ChickenOrb } from '@/components/ds/ChickenOrb';
import type { HatchPool } from '@/lib/dbc/pool';
import { formatAmount, formatPercent } from '@/lib/format/amount';
import { explorerAddressUrl, explorerTxUrl, EXPLORER_NAME, meteoraPoolUrl } from '@/lib/config/network';
import { sourceDomain } from '@/lib/metadata/token';
import { isLinkConfig, stockForConfig } from '@/lib/presets';
import { useIsTestLaunch, useLiveBaseFee, usePresetConfigs, useQuoteSymbol, useShieldReceipt, useTokenMetadata } from '@/hooks/useHatch';
import { rawToUi } from '@/lib/solana/mint';
import { SNIPER_SHIELD_LINE, baseFeePercentAt, formatFeePercent, hasSniperShield } from '@/lib/dbc/feeSchedule';
import { EggFill, HatchBurst, ShieldLive } from '@/components/motion';
import { useWallet } from '@jup-ag/wallet-adapter';
import type { ShareInfo } from '@/lib/share';
import { ShareActions } from './ShareActions';
import { Tip } from '@/components/Onboarding/Tip';
import { HowItWorksChip } from '@/components/Onboarding/Walkthrough';
import { shortAddr } from '@/components/ds/Pill';
import { TokenAvatar } from './TokenAvatar';
import { HeroPriceOrCountdown, SectionTitle, useStockOf } from './TokenLayout';

export function TokenHero({ mint, pool }: { mint: string; pool: HatchPool | null | undefined }) {
  const { data: md, isLoading } = useTokenMetadata(mint);
  const quote = useQuoteSymbol(pool?.quote);
  const domain = sourceDomain(md?.json?.external_url);
  const symbol = md?.symbol ?? '';
  return (
    <div className="flex flex-col gap-5 md:gap-7">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-[13px] font-medium text-ink-muted">
          <Link href="/" className="hover:text-ink">
            Hatches
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink">{symbol || shortAddr(mint, 4)}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {md?.name && pool !== undefined && <TokenShare mint={mint} pool={pool} symbol={symbol} />}
          <HowItWorksChip />
        </div>
      </div>
      {/* Design v2 header: image, big name + ticker, badges; live price (or the shield countdown) on the right. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-7">
          <TokenAvatar mint={mint} size={112} paired={pool?.presetId === 'STOCK' ? quote : null} className="max-md:!h-[72px] max-md:!w-[72px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
              {isLoading ? (
                <Skeleton className="h-10 w-72 rounded-md" />
              ) : (
                <h1 className="min-w-0 break-words font-display text-[26px] font-bold leading-none tracking-[-0.035em] text-ink md:text-[48px]">
                  {md?.name || 'Unknown token'}
                </h1>
              )}
              {symbol && <span className="font-mono text-sm font-medium text-ink-muted md:text-xl">${symbol}</span>}
            </div>
            <div className="hidden flex-wrap items-center gap-2.5 md:flex">
              <HeroChips mint={mint} pool={pool} quote={quote} domain={domain} url={md?.json?.external_url} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          <HeroChips mint={mint} pool={pool} quote={quote} domain={domain} url={md?.json?.external_url} />
        </div>
        {pool && <HeroPriceOrCountdown pool={pool} />}
      </div>
      {pool && pool.presetId !== null && hasSniperShield(pool.feeSchedule) && (
        <Tip id="token-shield" title="Sniper shield." className="max-w-[640px]">
          {SNIPER_SHIELD_LINE}
        </Tip>
      )}
    </div>
  );
}

/** Share + Copy link on every token page; the creator's wallet gets the "I just hatched" wording. */
function TokenShare({ mint, pool, symbol }: { mint: string; pool: HatchPool | null; symbol: string }) {
  const { publicKey } = useWallet();
  const { data: hc } = usePresetConfigs();
  const stock = pool?.presetId === 'STOCK' && hc ? stockForConfig(hc, pool.configKey) : null;
  const info: ShareInfo = {
    symbol,
    preset: pool?.presetId ?? null,
    stockTicker: stock?.ticker ?? null,
    stockName: stock?.name ?? null,
    shield: !!pool && hasSniperShield(pool.feeSchedule),
    creator: !!pool && !!publicKey && publicKey.toBase58() === pool.creator,
    progressPct: pool ? pool.progress * 100 : null,
    hatched: !!pool?.isMigrated,
  };
  // "Copy Blink" stays off while dial.to is down (its links would be dead); /actions.json and the Action API stay live.
  return <ShareActions mint={mint} info={info} size="sm" />;
}

function HeroChips({ mint, pool, quote, domain, url }: { mint: string; pool: HatchPool | null | undefined; quote: string; domain: string | null; url?: string }) {
  const isTest = useIsTestLaunch(mint);
  const fee = useLiveBaseFee(pool);
  const { data: hc } = usePresetConfigs();
  return (
    <>
      {isTest && <TestBadge className="h-[30px]" />}
      {fee?.shield && (
        <ShieldBadge
          className="h-[30px]"
          fee={fee.decaying ? formatFeePercent(fee.percent) : undefined}
          title={fee.decaying ? `${SNIPER_SHIELD_LINE} ${fee.secondsLeft}s left.` : SNIPER_SHIELD_LINE}
        />
      )}
      {pool && pool.presetId === null && !(hc && isLinkConfig(hc, pool.configKey)) && (
        <span className="inline-flex h-[30px] items-center rounded-pill border border-danger/45 bg-danger/[0.12] px-3 text-xs font-semibold text-danger">Not a Hatch launch</span>
      )}
      {pool && <StatusPill status={pool.status} className="h-[30px]" />}
      {pool?.presetId && <PresetBadge preset={pool.presetId} quote={quote} className="h-[30px]" />}
      {domain && <InspiredChip domain={domain} href={url} />}
      <AddressChip address={mint} label="Mint" />
    </>
  );
}

/**
 * First 60 seconds of a v2 pool (creation time known): the Sniper shield with the LIVE fee from the pool's
 * real fee scheduler. Hidden once the fee has reached its floor, or when the creation time is unknown.
 */
export function LiveShieldCard({ pool }: { pool: HatchPool }) {
  const fee = useLiveBaseFee(pool);
  const feeNow = useCallback(() => baseFeePercentAt(pool.feeSchedule, pool.activationPoint, Date.now() / 1000), [pool.feeSchedule, pool.activationPoint]);
  const known = Number(pool.activationPoint) > 0;
  if (!known || pool.presetId === null || pool.isMigrated || !fee?.shield || !fee.decaying) return null;
  return (
    <Card className="flex items-center gap-4 rounded-[24px] border-success/30 p-4 md:p-5">
      <ShieldLive feeNow={feeNow} className="h-[176px] w-[176px] shrink-0 md:h-[200px] md:w-[200px]" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-ink">Sniper shield is on</span>
        <span className="text-[13px] leading-normal text-ink-2">
          Live fee {formatFeePercent(fee.percent)}, falling to {formatFeePercent(fee.shield.end)} in {fee.secondsLeft}s. Anyone buying now pays it; it is the pool&apos;s real fee.
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-success">Live</span>
      </div>
    </Card>
  );
}

/**
 * After the shield window of a v2 pool: what the fee scheduler collected above its end fee from early buys,
 * from the pool's on-chain swap events via /api/shield. Amounts only; buyers are never labelled.
 */
export function SniperReceiptCard({ pool }: { pool: HatchPool }) {
  const fee = useLiveBaseFee(pool);
  const quote = useQuoteSymbol(pool.quote);
  const ended = pool.presetId !== null && Number(pool.activationPoint) > 0 && !!fee?.shield && !fee.decaying;
  const { data: r } = useShieldReceipt(pool.address, ended);
  if (!ended || !r) return null;
  const seconds = r.windowEnd - r.windowStart;
  const amt = (raw: string) => `${formatAmount(rawToUi(raw, pool.quote))} ${quote}`;
  const base = formatFeePercent(r.baseFeePct);
  return (
    <Card className="flex flex-col gap-2.5 rounded-[24px] px-5 py-6 md:px-9 md:py-8">
      <div className="flex items-center justify-between gap-3">
        <Overline className="text-success">Shield receipt</Overline>
        <ShieldHowItWorks start={formatFeePercent(r.startFeePct)} end={base} seconds={seconds} step={Number(pool.feeSchedule.periodFrequency)} />
      </div>
      {r.buys === 0 ? (
        <>
          <span className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink md:text-[26px]">No early buys hit the shield.</span>
          <span className="text-[13px] leading-normal text-ink-2">
            No buys landed in the first {seconds}s, while the fee was falling from {formatFeePercent(r.startFeePct)} to {base}.
          </span>
        </>
      ) : (
        <>
          <span className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink md:text-[26px]">Shield collected {amt(r.taxRaw)}</span>
          <span className="text-[13px] leading-normal text-ink-2">
            from {r.buys} early {r.buys === 1 ? 'buy' : 'buys'} in the first {seconds}s. Total fees paid: {amt(r.feesRaw)}.
          </span>
          {r.signatures[0] && (
            <a
              href={explorerTxUrl(r.signatures[0])}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 self-start font-mono text-[11px] font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {r.buys === 1 ? 'See the buy' : 'See the first buy'} on {EXPLORER_NAME} <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </>
      )}
      {!r.final && <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">Settling on chain</span>}
    </Card>
  );
}

/** Small "How it works" popover for the receipt (click/tap to open; Escape or a click outside closes it). */
function ShieldHowItWorks({ start, end, seconds, step }: { start: string; end: string; seconds: number; step: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-pill border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        How it works
      </button>
      {open && (
        <div role="note" className="absolute right-0 top-full z-20 mt-2 w-[min(300px,calc(100vw-48px))] rounded-[14px] border border-line bg-surface-2 p-3.5 text-[12px] leading-normal text-ink-2 shadow-lg">
          The shield is designed to tax snipers. For the first {seconds} seconds after launch, the trading fee starts at {start} and steps down every {step}
          seconds until it reaches {end}; a buy in that window pays the fee in force at that moment. &ldquo;Shield collected&rdquo; is the part above {end}. It
          leaves out the small volatility fee any trade can pay. All figures are read from each swap on chain.
        </div>
      )}
    </div>
  );
}

/**
 * Incubating / almost hatched (design v2 "Hatching progress"): the dot-matrix egg fills to the real progress
 * beside the % and the bar. Pool facts live in HatchInfoCard.
 */
export function ProgressCard({ pool }: { pool: HatchPool }) {
  const quote = useQuoteSymbol(pool.quote);
  const toGo = pool.thresholdUi.minus(pool.quoteReserveUi);
  const stock = useStockOf(pool);
  const egg = (variant: 'full' | 'compact', className: string) => (
    <EggFill
      progress={pool.progress}
      raised={pool.quoteReserveUi.toNumber()}
      quoteSymbol={quote}
      ready={pool.isMigrated || pool.progress >= 1}
      variant={variant}
      showLabel={false}
      className={className}
    />
  );
  return (
    <div className="flex flex-col gap-2.5">
      <Card className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-6 overflow-hidden rounded-[24px] px-5 py-6 md:grid-cols-[150px_minmax(0,1fr)] md:gap-8 md:px-9 md:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(rgb(var(--dot-field) / 0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        />
        {/* The egg fills to the pool's real progress; each buy the poll picks up pours in (+amount). */}
        <div className="relative h-[150px] w-[150px] max-md:hidden">{egg('full', 'absolute inset-0 h-full w-full')}</div>
        <div className="relative flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-4">
            {egg('compact', 'relative h-[84px] w-[84px] shrink-0 md:hidden')}
            <div className="flex min-w-0 flex-1 flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <SectionTitle>Hatching progress</SectionTitle>
              <span className="font-display text-[34px] font-bold leading-none tracking-[-0.04em] text-yolk md:text-[40px]">{formatPercent(pool.progress)}</span>
            </div>
          </div>
          <Tip id="token-progress">This fills as people buy. At 100% it hatches.</Tip>
          <ShellBar progress={pool.progress} height={10} />
          <div className="flex flex-wrap justify-between gap-2 font-mono text-[13px] font-medium md:text-sm">
            <span>
              <Amount value={pool.quoteReserveUi} className="text-ink" /> <span className="text-ink-muted">/ {formatAmount(pool.thresholdUi)} {quote}</span>
            </span>
            <span className="text-ink-muted">{formatAmount(toGo.gt(0) ? toGo : 0)} to go</span>
          </div>
        </div>
      </Card>
      {stock && (
        <p className="px-1 text-[13px] leading-normal text-ink-muted">
          Priced in tokenized {stock.name}. Graduates into a Meteora DAMM v2 pool paired with {stock.symbol}.
        </p>
      )}
    </div>
  );
}

export function AboutCard({ pool, mint }: { pool: HatchPool | null | undefined; mint: string }) {
  const { data: md } = useTokenMetadata(mint);
  const description = md?.json?.description?.trim();
  // The "not the stock" note for stock pools lives in Hatch info.
  if (!description || !pool) return null;
  return (
    <Card className="flex flex-col gap-4 rounded-[24px] px-5 py-6 md:px-9 md:py-8">
      <SectionTitle>About</SectionTitle>
      <p className="max-w-[720px] whitespace-pre-line break-words text-base leading-relaxed text-ink-2">{description}</p>
    </Card>
  );
}

/** Hatched: ember card with cracked shell + buddy, final raise. */
/** Graduated pools whose burst already played in this visit (once per token per page load). */
const burstPlayed = new Set<string>();

export function HatchedCard({ pool, symbol }: { pool: HatchPool; symbol: string }) {
  const quote = useQuoteSymbol(pool.quote);
  const [burst, setBurst] = useState(() => !burstPlayed.has(pool.baseMint));
  useEffect(() => {
    burstPlayed.add(pool.baseMint);
  }, [pool.baseMint]);
  return (
    <Card className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-8 overflow-hidden rounded-[24px] border-ember/50 p-6 md:grid-cols-[260px_minmax(0,1fr)] md:gap-11 md:p-10">
      {burst && <HatchBurst onDone={() => setBurst(false)} />}
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-[520px] w-[520px] bg-[radial-gradient(circle,rgba(232,87,42,0.28)_0%,rgba(232,87,42,0)_60%)]" />
      <div className="relative mx-auto h-[300px] w-[260px]" aria-hidden>
        <div
          className="absolute left-[30px] top-2.5 h-[250px] w-[200px] -translate-x-3 -translate-y-[26px] -rotate-12 bg-ember motion-safe:animate-shell-top"
          style={{ borderRadius: EGG_RADIUS, clipPath: 'polygon(0 0,100% 0,100% 42%,84% 52%,70% 40%,55% 54%,40% 41%,26% 53%,12% 42%,0 50%)' }}
        />
        <div
          className="absolute left-[30px] top-10 h-[250px] w-[200px] bg-ember"
          style={{ borderRadius: EGG_RADIUS, clipPath: 'polygon(0 50%,12% 42%,26% 53%,40% 41%,55% 54%,70% 40%,84% 52%,100% 42%,100% 100%,0 100%)' }}
        />
        <div className="absolute left-24 top-24 motion-safe:animate-pop-in">
          <ChickenOrb size={68} />
        </div>
      </div>
      <div className="relative flex flex-col gap-[18px]">
        <span className="font-display text-[48px] font-bold leading-[0.95] tracking-[-0.04em] text-ink md:text-[64px]">
          Hatched<span className="text-ember">.</span>
        </span>
        <span className="max-w-[440px] text-[17px] leading-[1.55] text-ink-2">
          {symbol || 'This token'} reached its goal and moved into a full Meteora pool. Trading continues there, with deeper liquidity.
        </span>
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between font-mono text-[15px] font-medium">
            <span className="text-ink">
              {formatAmount(pool.thresholdUi)} <span className="text-ink-muted">/ {formatAmount(pool.thresholdUi)} {quote}</span>
            </span>
            <span className="text-ember">100%</span>
          </div>
          <ShellBar progress={1} hatched height={12} />
        </div>
      </div>
    </Card>
  );
}

export function TradeOnMeteora({ pool }: { pool: HatchPool }) {
  const quote = useQuoteSymbol(pool.quote);
  return (
    <Card className="flex flex-col gap-4 rounded-[24px] p-6">
      <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">Trade on Meteora</h2>
      <div className="flex flex-col gap-2.5">
        <DefRow label="Price">
          <Amount value={pool.price} unit={quote} />
        </DefRow>
        {pool.dammV2Pool && (
          <DefRow label="Pool">
            <a href={explorerAddressUrl(pool.dammV2Pool)} target="_blank" rel="noreferrer" className="text-ink-accent hover:underline">
              DAMM v2 · {shortAddr(pool.dammV2Pool, 4)} ↗
            </a>
          </DefRow>
        )}
      </div>
      {pool.dammV2Pool && (
        <Button asChild variant="ember" glow className="h-14 font-display text-base font-bold">
          <a href={meteoraPoolUrl(pool.dammV2Pool)} target="_blank" rel="noreferrer">
            Open pool on Meteora <ArrowUpRight size={14} />
          </a>
        </Button>
      )}
    </Card>
  );
}
