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
  HonestNote,
  InspiredChip,
  Overline,
  PresetBadge,
  ShellBar,
  Skeleton,
  StageEgg,
  StatusPill,
  ShieldBadge,
  TestBadge,
} from '@/components/ds';
import { ChickenOrb } from '@/components/ds/ChickenOrb';
import type { HatchPool } from '@/lib/dbc/pool';
import { formatAmount, formatPercent } from '@/lib/format/amount';
import { explorerAddressUrl, explorerTxUrl, EXPLORER_NAME, meteoraPoolUrl } from '@/lib/config/network';
import { sourceDomain } from '@/lib/metadata/token';
import { stockForConfig, stockPreset } from '@/lib/presets';
import { useHolders, useIsTestLaunch, useLiveBaseFee, useMintSupply, usePresetConfigs, useQuoteSymbol, useShieldReceipt, useTokenMetadata, useUsdPrice } from '@/hooks/useHatch';
import { rawToUi } from '@/lib/solana/mint';
import { SNIPER_SHIELD_LINE, baseFeePercentAt, formatFeePercent, hasSniperShield } from '@/lib/dbc/feeSchedule';
import { EggFill, HatchBurst, ShieldLive } from '@/components/motion';
import { useWallet } from '@jup-ag/wallet-adapter';
import type { ShareInfo } from '@/lib/share';
import { ShareActions } from './ShareActions';
import { Tip } from '@/components/Onboarding/Tip';
import { HowItWorksChip } from '@/components/Onboarding/Walkthrough';
import { shortAddr } from '@/components/ds/Pill';
import { cn } from '@/lib/utils';
import { TokenAvatar } from './TokenAvatar';

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
        <HowItWorksChip />
      </div>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-7">
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
        {md?.name && pool !== undefined && <TokenShare mint={mint} pool={pool} symbol={symbol} />}
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
  return <ShareActions mint={mint} info={info} showBlink={!!pool && pool.presetId !== null && !pool.isMigrated} className="self-start md:self-center" />;
}

function HeroChips({ mint, pool, quote, domain, url }: { mint: string; pool: HatchPool | null | undefined; quote: string; domain: string | null; url?: string }) {
  const isTest = useIsTestLaunch(mint);
  const fee = useLiveBaseFee(pool);
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
      {pool && pool.presetId === null && (
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
    <Card className="flex flex-col gap-2 rounded-[24px] p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <Overline className="text-success">Sniper receipt</Overline>
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

/** Incubating / almost hatched: the big egg, % to hatch, raised vs goal, pool facts. */
export function ProgressCard({ pool }: { pool: HatchPool }) {
  const quote = useQuoteSymbol(pool.quote);
  const holders = useHolders(pool.baseMint);
  const toGo = pool.thresholdUi.minus(pool.quoteReserveUi);
  const stock = useStockName(pool);
  const stockInfo = useStockInfo(pool);
  const supply = useMintSupply(stockInfo ? pool.baseMint : undefined, pool.baseDecimals);
  const usd = useUsdPrice(stockInfo ? pool.quote.address : undefined);
  // Market cap in quote-token units: current curve price x total supply (NVDAx ~ NVDA shares).
  const marketCap = stockInfo && supply.data ? pool.price.mul(supply.data) : null;
  return (
    <div className="flex flex-col gap-2.5">
    <Card className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-8 overflow-hidden rounded-[24px] p-5 md:p-9 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-11">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(rgb(var(--dot-field) / 0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      />
      {/* The egg fills to the pool's real progress; each buy the poll picks up pours in (+amount). */}
      {/* Desktop: the egg fills the left column (canvas absolutely placed, so it never grows the card). */}
      <div className="relative min-h-[340px] self-stretch max-lg:hidden">
        <EggFill
          progress={pool.progress}
          raised={pool.quoteReserveUi.toNumber()}
          quoteSymbol={quote}
          ready={pool.isMigrated || pool.progress >= 1}
          variant="full"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="relative flex min-w-0 flex-col gap-[22px]">
        <Overline>Hatching progress</Overline>
        <Tip id="token-progress">This fills as people buy. At 100% it hatches.</Tip>
        <div className="flex items-center gap-4">
          {/* Mobile: the egg sits beside the number (design M3) */}
          <EggFill
            progress={pool.progress}
            raised={pool.quoteReserveUi.toNumber()}
            quoteSymbol={quote}
            ready={pool.isMigrated || pool.progress >= 1}
            variant="compact"
            showLabel={false}
            className="relative h-[96px] w-[96px] shrink-0 lg:hidden"
          />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <span className="font-display text-[44px] font-bold leading-[0.9] tracking-[-0.04em] text-yolk sm:text-[56px] md:text-[80px]">{formatPercent(pool.progress)}</span>
            <span className="text-base text-ink-2">to hatch</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap justify-between gap-2 font-mono text-[15px] font-medium">
            <span>
              <Amount value={pool.quoteReserveUi} className="text-ink" /> <span className="text-ink-muted">/ {formatAmount(pool.thresholdUi)} {quote}</span>
            </span>
            <span className="text-ink-muted">{formatAmount(toGo.gt(0) ? toGo : 0)} to go</span>
          </div>
          <ShellBar progress={pool.progress} height={12} />
        </div>
        <div className="flex flex-col gap-3 pt-1.5">
          <DefRow label="Price">
            <Amount value={pool.price} unit={quote} className="text-[15px]" />
          </DefRow>
          {stockInfo && (
            <>
              {/* Stock-paired: what the token is worth and what the pool holds, in the stock itself. */}
              <DefRow label="Market cap">
                {marketCap ? (
                  <span className="whitespace-nowrap">
                    {formatAmount(marketCap)} {stockInfo.ticker}
                    {usd.data && <span className="text-ink-muted"> · ≈ ${formatUsd(marketCap.mul(usd.data).toNumber())}</span>}
                  </span>
                ) : (
                  '…'
                )}
              </DefRow>
              <DefRow label="Pool holds">
                {formatAmount(pool.quoteReserveUi)} {stockInfo.symbol}
              </DefRow>
            </>
          )}
          <DefRow label="Quote token">
            {quote}
            {stock ? ` · tokenized ${stock}` : pool.quote.isNativeSol ? ' · Solana' : ''}
          </DefRow>
          <DefRow label="Pool">
            <a href={explorerAddressUrl(pool.address)} target="_blank" rel="noreferrer" className="text-ink-accent hover:underline">
              Meteora DBC · {shortAddr(pool.address, 4)} ↗
            </a>
          </DefRow>
          <DefRow label="Holders">{holders.data ?? (holders.isLoading ? '…' : '-')}</DefRow>
        </div>
      </div>
    </Card>
    {stockInfo && (
      <p className="px-1 text-[13px] leading-normal text-ink-muted">
        Priced in tokenized {stockInfo.name}. Graduates into a Meteora DAMM v2 pool paired with {stockInfo.symbol}.
      </p>
    )}
    </div>
  );
}

/** The xStock a stock-paired pool is quoted in (NVDAx / TSLAx; legacy configs included), else null. */
function useStockInfo(pool: HatchPool) {
  const { data: hc } = usePresetConfigs();
  return pool.presetId === 'STOCK' && hc ? stockForConfig(hc, pool.configKey) : null;
}

const formatUsd = (v: number) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? v.toFixed(2) : v.toPrecision(2));

function useStockName(pool: HatchPool) {
  const { data: hc } = usePresetConfigs();
  return pool.presetId === 'STOCK' && hc ? stockForConfig(hc, pool.configKey)?.name ?? null : null;
}

/** Incubating -> Almost hatched (80%, shell cracks) -> Hatched (full Meteora pool). */
export function StageTimeline({ pool }: { pool: HatchPool }) {
  const idx = pool.status === 'HATCHED' ? 2 : pool.status === 'ALMOST_HATCHED' ? 1 : 0;
  const stages = [
    { title: 'Incubating', here: 'You are here. Buys fill the egg.', note: 'Buys fill the egg.' },
    { title: 'Almost hatched', here: 'You are here. The shell is cracking.', note: 'From 80%. The shell cracks.' },
    { title: 'Hatched', here: 'Moved to a full Meteora pool.', note: 'Moves to a full Meteora pool.' },
  ];
  return (
    <Card className="grid grid-cols-[minmax(0,1fr)] gap-5 rounded-[24px] px-5 py-6 sm:grid-cols-3 md:px-9 md:py-7">
      {stages.map((s, i) => (
        <div key={s.title} className={cn('flex items-center gap-3.5', i > idx && 'opacity-55')}>
          <StageEgg state={i < idx ? 'done' : i === idx ? 'current' : 'next'} />
          <div className="flex flex-col gap-[3px]">
            <span className="text-[15px] font-semibold text-ink">{s.title}</span>
            <span className="text-[13px] text-ink-2">{i === idx ? s.here : s.note}</span>
          </div>
        </div>
      ))}
    </Card>
  );
}

export function AboutCard({ pool, mint }: { pool: HatchPool | null | undefined; mint: string }) {
  const { data: md } = useTokenMetadata(mint);
  const { data: hc } = usePresetConfigs();
  const stock = pool?.presetId === 'STOCK' && hc ? stockForConfig(hc, pool.configKey) : null;
  const honest = pool?.presetId === 'STOCK' ? stockPreset(stock).explainer[2] : null;
  const description = md?.json?.description?.trim();
  if (!description && !honest) return null;
  return (
    <Card className="flex flex-col gap-4 rounded-[24px] px-5 py-6 md:px-9 md:py-8">
      <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">About</h2>
      {description && <p className="max-w-[720px] whitespace-pre-line break-words text-base leading-relaxed text-ink-2">{description}</p>}
      {honest && <HonestNote>{honest.replace("The stock token's issuer", 'The issuer')}</HonestNote>}
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
