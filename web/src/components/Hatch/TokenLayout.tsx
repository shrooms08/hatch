// Token page v2 sections (design/token-page/Hatch_Token_Page_v2.html): header price / shield countdown,
// the 5-step lifecycle stepper, "Hatch info" leader rows and "More hatches". Display only: everything comes
// from the pool already on the page or from cached server routes (/api/pools, /api/holders, metadata).
import Link from 'next/link';
import { Amount, Button, Card, DefRow, HonestNote, Overline, StatusPill } from '@/components/ds';
import { shortAddr } from '@/components/ds/Pill';
import type { HatchPool } from '@/lib/dbc/pool';
import { baseFeePercentAt, formatFeePercent, hasSniperShield, shieldRange } from '@/lib/dbc/feeSchedule';
import { explorerAddressUrl, meteoraPoolUrl } from '@/lib/config/network';
import { formatAmount, formatPercent } from '@/lib/format/amount';
import { countdownParts, formatLaunchTime, lifecycleSteps, timeAgo, type StepKey, type StepState } from '@/lib/lifecycle';
import { isLinkConfig, stockDisclosure, stockForConfig } from '@/lib/presets';
import { useLinkForMint } from './LinkCoinBanner';
import { useHatchPools, useHolders, useLiveBaseFee, usePresetConfigs, useQuoteSymbol, useTokenMetadata, useUsdPrice } from '@/hooks/useHatch';
import { cn } from '@/lib/utils';
import { TokenAvatar } from './TokenAvatar';

/** Card title in the v2 style (Unbounded 22 / 600). */
export const SectionTitle = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <h2 className={cn('font-display text-[20px] font-semibold tracking-[-0.015em] text-ink md:text-[22px]', className)}>{children}</h2>
);

/** The xStock a stock-paired pool is quoted in (NVDAx / TSLAx), else null. */
export function useStockOf(pool: HatchPool | null | undefined) {
  const { data: hc } = usePresetConfigs();
  return pool?.presetId === 'STOCK' && hc ? stockForConfig(hc, pool.configKey) : null;
}

const launchedAt = (pool: HatchPool) => (pool.feeSchedule.activationType === 1 && Number(pool.activationPoint) > 0 ? Number(pool.activationPoint) : null);

/** Header, right side: the live price, or during a v2 pool's first 60 s the shield countdown. */
export function HeroPriceOrCountdown({ pool }: { pool: HatchPool }) {
  const fee = useLiveBaseFee(pool);
  const quote = useQuoteSymbol(pool.quote);
  if (pool.presetId !== null && fee?.shield && fee.decaying) return <ShieldCountdown seconds={fee.secondsLeft} feePct={fee.percent} />;
  return (
    <div className="flex flex-col gap-1.5 md:items-end">
      <Overline className="tracking-[0.12em]">Price</Overline>
      <span className="flex items-baseline gap-2.5 font-mono">
        <Amount value={pool.price} className="text-[26px] font-medium text-ink md:text-[32px]" />
        <span className="text-sm font-medium text-ink-muted md:text-[15px]">{quote}</span>
      </span>
    </div>
  );
}

function ShieldCountdown({ seconds, feePct }: { seconds: number; feePct: number }) {
  const [mm, ss] = countdownParts(seconds);
  return (
    <Card className="flex w-full flex-col gap-4 rounded-[24px] border-line p-5 shadow-[0_24px_64px_rgba(0,0,0,0.4)] md:w-auto md:p-7" aria-live="off">
      <Overline className="tracking-[0.12em]">Shield ends in</Overline>
      <div className="flex items-start gap-2" role="timer" aria-label={`Shield ends in ${mm}:${ss}`}>
        {[
          [mm, 'Minutes'],
          [ss, 'Seconds'],
        ].map(([v, label], i) => (
          <div key={label} className="flex items-start gap-2">
            {i > 0 && <span className="pt-5 font-mono text-xl text-ink-muted">:</span>}
            <div className="flex flex-col items-center gap-2">
              <span className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-ink font-mono text-[28px] font-semibold tracking-[-0.02em] text-surface-1 md:h-[72px] md:w-[72px] md:text-[32px]">
                {v}
              </span>
              <span className="font-mono text-[11px] font-medium text-ink-muted">{label}</span>
            </div>
          </div>
        ))}
      </div>
      <DefRow label="Fee now">
        <span className="text-yolk">{formatFeePercent(feePct)}</span>
      </DefRow>
    </Card>
  );
}

const STEP_TITLE: Record<StepKey, string> = { launched: 'Launched', shield: 'Shield', curve: 'Bonding curve', graduation: 'Graduation', damm: 'DAMM v2' };
const EGG_STEP_RADIUS = '50% / 60% 60% 40% 40%';

function StepMarker({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[46px] w-[38px] shrink-0 items-center justify-center border-2 font-display text-sm font-bold',
        state === 'current' && 'border-yolk bg-yolk text-ink-on-yolk shadow-[0_0_0_6px_rgba(242,169,59,0.15),0_0_24px_rgba(242,169,59,0.45)]',
        state === 'done' && 'border-yolk bg-yolk/15 text-yolk',
        state === 'future' && 'border-line-strong bg-inset text-ink-muted',
        state === 'skipped' && 'border-dashed border-line-strong bg-transparent text-ink-muted/70'
      )}
      style={{ borderRadius: EGG_STEP_RADIUS }}
    >
      {n}
    </span>
  );
}

/** 1 Launched, 2 Shield, 3 Bonding curve, 4 Graduation, 5 DAMM v2, from real pool data. Vertical on mobile. */
export function LifecycleStepper({ pool }: { pool: HatchPool }) {
  const fee = useLiveBaseFee(pool);
  const quote = useQuoteSymbol(pool.quote);
  const shield = hasSniperShield(pool.feeSchedule);
  const range = shield ? shieldRange(pool.feeSchedule) : null;
  const flat = shield ? null : baseFeePercentAt(pool.feeSchedule, '0', 0);
  const at = launchedAt(pool);
  const steps = lifecycleSteps({ launchedAt: at, hasShield: shield, shieldLive: !!fee?.decaying, progress: pool.progress, isMigrated: pool.isMigrated });
  const lines = (key: StepKey): React.ReactNode[] => {
    switch (key) {
      case 'launched':
        return at ? ['Trading opened', formatLaunchTime(at)] : ['Trading opened', 'on chain'];
      case 'shield':
        return shield && range
          ? [fee?.decaying ? `Fee now ${formatFeePercent(fee.percent)}` : `First ${Math.round(Number(pool.feeSchedule.periodFrequency) * pool.feeSchedule.numberOfPeriod)}s`, `Fee ${formatFeePercent(range.start)} to ${formatFeePercent(range.end)}`]
          : [`Flat ${formatFeePercent(flat ?? 1)} fee`, 'from launch'];
      case 'curve':
        return ['Buys fill the egg', `${formatPercent(pool.progress)} so far`];
      case 'graduation':
        return ['At 100%', `${formatAmount(pool.thresholdUi)} ${quote}`];
      case 'damm':
        return pool.isMigrated && pool.dammV2Pool
          ? [
              'Trading on Meteora',
              <a key="l" href={meteoraPoolUrl(pool.dammV2Pool)} target="_blank" rel="noreferrer" className="text-ink-accent hover:underline">
                Open pool ↗
              </a>,
            ]
          : ['Trading on Meteora', 'after graduation'];
    }
  };
  return (
    <Card className="rounded-[24px] px-5 py-6 md:px-9 md:pb-7 md:pt-8">
      <ol className="flex flex-col md:grid md:grid-cols-5">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const lit = s.state === 'done' || s.state === 'current';
          const lineLit = s.state === 'done' || (s.state === 'skipped' && steps[i + 1]?.state !== 'future');
          const title = s.key === 'shield' && s.state === 'skipped' ? 'No shield' : STEP_TITLE[s.key];
          return (
            <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0 md:flex-col md:gap-3 md:pb-0 md:pr-5" aria-current={s.state === 'current' ? 'step' : undefined}>
              {/* Connector: right of the marker on desktop, below it on mobile. */}
              {!last && (
                <span
                  aria-hidden
                  className={cn('absolute left-[18px] top-[50px] bottom-1 w-0.5 md:left-[42px] md:right-0 md:top-[22px] md:h-0.5 md:w-auto', lineLit ? 'bg-yolk' : 'bg-line')}
                />
              )}
              <StepMarker n={i + 1} state={s.state} />
              <div className="flex min-w-0 flex-col gap-2 pt-1 md:pt-0">
                <span className={cn('font-display text-base font-semibold tracking-[-0.015em] md:text-lg', lit ? 'text-ink' : 'text-ink-muted')}>{title}</span>
                <span className="flex flex-col font-mono text-[13px] font-medium leading-[1.55] text-ink-muted">
                  {lines(s.key).map((l, j) => (
                    <span key={j}>{l}</span>
                  ))}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Two columns of leader rows with the pool's facts; stock pools add market cap, pool holds and the honest note. */
export function HatchInfoCard({ pool }: { pool: HatchPool }) {
  const quote = useQuoteSymbol(pool.quote);
  const holders = useHolders(pool.baseMint);
  const stock = useStockOf(pool);
  const usd = useUsdPrice(stock ? pool.quote.address : undefined);
  const { data: hc } = usePresetConfigs();
  const isLink = !!hc && isLinkConfig(hc, pool.configKey);
  const { data: linkInfo } = useLinkForMint(pool.baseMint, isLink);
  const heldForOwner = isLink && !linkInfo?.claimed;
  const at = launchedAt(pool);
  const fee = hasSniperShield(pool.feeSchedule) ? shieldRange(pool.feeSchedule).end : baseFeePercentAt(pool.feeSchedule, '0', 0);
  const marketCap = stock && pool.totalSupply ? pool.price.mul(pool.totalSupply) : null;
  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-ink-accent hover:underline">
      {label}
    </a>
  );
  const left: [string, React.ReactNode][] = [
    ['Starting price', <Amount key="s" value={pool.startPrice} unit={quote} className="text-sm" />],
    ['Hatches at', `${formatAmount(pool.thresholdUi)} ${quote}`],
    ['Total supply', pool.totalSupply ? pool.totalSupply.toNumber().toLocaleString('en-US') : '-'],
    ['Holders', holders.data != null ? holders.data.toLocaleString('en-US') : holders.isError ? 'n/a' : holders.isLoading ? '…' : 'n/a'],
    ['Launched', at ? <span key="t" title={formatLaunchTime(at)}>{timeAgo(at)}</span> : '-'],
  ];
  const right: [string, React.ReactNode][] = [
    ['Quote token', stock ? `${quote} · tokenized ${stock.name}` : quote],
    ['Pay with', pool.quote.isNativeSol ? 'SOL' : `SOL or ${quote}`],
    [
      'Trade fee',
      heldForOwner ? (
        // Link coins: the full sentence wraps instead of truncating.
        <span key="f" className="block whitespace-normal">
          {formatFeePercent(fee)} · {formatFeePercent((fee * pool.creatorFeePct) / 100)} held for the link&apos;s owner until they claim it
        </span>
      ) : (
        `${formatFeePercent(fee)} · ${formatFeePercent((fee * pool.creatorFeePct) / 100)} to creator`
      ),
    ],
    ['Pool', pool.isMigrated && pool.dammV2Pool ? link(meteoraPoolUrl(pool.dammV2Pool), `DAMM v2 · ${shortAddr(pool.dammV2Pool, 4)} ↗`) : link(explorerAddressUrl(pool.address), `Meteora DBC · ${shortAddr(pool.address, 4)} ↗`)],
    heldForOwner
      ? [
          'Fee vault',
          <span key="v" className="block whitespace-normal">
            {link(explorerAddressUrl(pool.creator), shortAddr(pool.creator, 4))}{' '}
            <span className="text-ink-muted">({heldFor(linkInfo)})</span>
          </span>,
        ]
      : ['Creator', link(explorerAddressUrl(pool.creator), shortAddr(pool.creator, 4))],
  ];
  if (stock) {
    left.push([
      'Market cap',
      marketCap ? (
        <span key="m" className="whitespace-nowrap">
          {formatAmount(marketCap)} {stock.ticker}
          {usd.data && <span className="text-ink-muted"> · ≈ ${formatUsd(marketCap.mul(usd.data).toNumber())}</span>}
        </span>
      ) : (
        '-'
      ),
    ]);
    right.push(['Pool holds', `${formatAmount(pool.quoteReserveUi)} ${stock.symbol}`]);
  }
  return (
    <Card className="flex flex-col gap-5 rounded-[24px] px-5 py-6 md:px-9 md:py-8">
      <SectionTitle>Hatch info</SectionTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-3.5 md:grid-cols-2">
        {[left, right].map((col, c) => (
          <div key={c} className="flex min-w-0 flex-col gap-3.5">
            {col.map(([label, value]) => (
              <DefRow key={label} label={label}>
                {value}
              </DefRow>
            ))}
          </div>
        ))}
      </div>
      {stock && <HonestNote className="rounded-[14px] px-4 py-3.5">{stockDisclosure(stock)}</HonestNote>}
    </Card>
  );
}

const PLATFORM_NAME: Record<string, string> = { x: 'X', youtube: 'YouTube', github: 'GitHub' };
/** "held for @jack on X", "held for example.com", or "held for the link's owner" when unknown. */
function heldFor(info: { ownerHandle: string | null; ownerPlatform: string | null } | null | undefined) {
  if (!info?.ownerHandle) return "held for the link's owner";
  const platform = info.ownerPlatform ? PLATFORM_NAME[info.ownerPlatform] : undefined;
  return `held for ${info.ownerHandle}${platform ? ` on ${platform}` : ''}`;
}

const formatUsd = (v: number) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? v.toFixed(2) : v.toPrecision(2));

/** Up to 4 other Hatch tokens of the same kind (stock-paired or not), from the cached /api/pools list. */
export function MoreHatches({ pool }: { pool: HatchPool }) {
  const { data: pools } = useHatchPools();
  const stockKind = pool.presetId === 'STOCK';
  const more = (pools ?? [])
    .filter((p) => p.baseMint !== pool.baseMint && p.presetId !== null && (p.presetId === 'STOCK') === stockKind)
    .sort((a, b) => Number(a.isMigrated) - Number(b.isMigrated) || b.progress - a.progress)
    .slice(0, 4);
  if (!more.length) return null;
  return (
    <section className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-[24px] font-bold tracking-[-0.025em] text-ink md:text-[32px]">{stockKind ? 'More stock-paired hatches' : 'More hatches'}</h2>
        <Link href="/" className="text-sm font-semibold text-ink-accent hover:underline">
          See all hatches →
        </Link>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {more.map((p) => (
          <MoreHatchCard key={p.baseMint} pool={p} />
        ))}
      </div>
    </section>
  );
}

function MoreHatchCard({ pool }: { pool: HatchPool }) {
  const { data: md } = useTokenMetadata(pool.baseMint);
  const quote = useQuoteSymbol(pool.quote);
  const holders = useHolders(pool.baseMint);
  return (
    <Card className="flex min-w-0 flex-col gap-4 rounded-[22px] p-3.5">
      <TokenAvatar mint={pool.baseMint} size={240} radius={14} paired={pool.presetId === 'STOCK' ? quote : null} className="!aspect-square !h-auto !w-full" />
      <div className="flex flex-col gap-3 px-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate font-display text-lg font-semibold tracking-[-0.02em] text-ink">{md?.name || shortAddr(pool.baseMint, 4)}</span>
          <StatusPill status={pool.status} size="sm" className="shrink-0" />
        </div>
        <div className="flex flex-col gap-2">
          <DefRow label="Price" className="text-[13px]">
            <Amount value={pool.price} unit={quote} className="text-[13px]" />
          </DefRow>
          <DefRow label="Raised" className="text-[13px]">
            {formatAmount(pool.quoteReserveUi)} / {formatAmount(pool.thresholdUi)}
          </DefRow>
          <DefRow label="Progress" className="text-[13px]">
            {formatPercent(pool.progress)}
          </DefRow>
          <DefRow label="Holders" className="text-[13px]">
            {holders.data != null ? holders.data.toLocaleString('en-US') : '…'}
          </DefRow>
        </div>
      </div>
      <Button asChild variant="primary" className="h-[46px] w-full text-sm font-semibold">
        <Link href={`/token/${pool.baseMint}`}>
          Open hatch
        </Link>
      </Button>
    </Card>
  );
}
