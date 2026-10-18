// Home "Hatches": filter tabs + search, a table on desktop and cards on mobile, "Load more".
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Amount, Button, ChevronRight, LinkBadge, MiniEgg, PresetBadge, SearchIcon, Segmented, ShellBar, Skeleton, StatusPill, TestBadge, progressInk, presetLabel } from '@/components/ds';
import type { HatchPool } from '@/lib/dbc/pool';
import { PLATFORM_NAME, matchesHatch, type HatchFilter } from '@/lib/links/listing';
import { fetchTokenMetadata, type HatchTokenMetadata as TokenMetadata } from '@/lib/metadata/token';
import { formatAmount, formatPercent } from '@/lib/format/amount';
import { timeAgo } from '@/lib/format/time';
import { useIsTestLaunch, usePresetConfigs, useQuoteSymbol } from '@/hooks/useHatch';
import { cn } from '@/lib/utils';
import { TokenAvatar } from './TokenAvatar';

type Filter = HatchFilter;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'INCUBATING', label: 'Incubating' },
  { value: 'ALMOST_HATCHED', label: 'Almost hatched' },
  { value: 'HATCHED', label: 'Hatched' },
  { value: 'LINK', label: 'Link coins' },
];
const PAGE = 10;
const GRID = 'md:grid md:grid-cols-[minmax(0,2.2fr)_1.2fr_1.3fr_1.8fr_1fr_24px] md:gap-5';

const pct = (p: HatchPool) => (p.isMigrated ? 1 : p.progress);

function Row({ pool, md, created }: { pool: HatchPool; md?: TokenMetadata | null; created?: number }) {
  const quote = useQuoteSymbol(pool.quote);
  const paired = pool.presetId === 'STOCK' ? quote : null;
  const age = timeAgo(created);
  const name = md?.name ?? '…';
  const symbol = md?.symbol ?? '';
  const isTest = useIsTestLaunch(pool.baseMint);
  return (
    <Link
      href={`/token/${pool.baseMint}`}
      className={cn(
        'group block border-b border-surface-3 bg-hatch-bg px-4 py-4 transition-colors duration-150 last:border-b-0 hover:bg-surface-1 md:items-center md:px-6 md:py-[18px]',
        'focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yolk/50',
        GRID
      )}
    >
      {/* Token */}
      <div className="flex min-w-0 items-center gap-3.5">
        <TokenAvatar mint={pool.baseMint} size={52} paired={paired} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-base font-semibold text-ink">{name}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[13px] font-medium text-ink-muted">
              {symbol && `$${symbol}`}
              {age && ` · ${age} ago`}
              <span className="md:hidden"> · {pool.isLink ? `Link${pool.link ? ` · ${PLATFORM_NAME[pool.link.platform]}` : ''}` : presetLabel(pool.presetId)}</span>
            </span>
            {isTest && <TestBadge size="sm" />}
          </span>
        </div>
        <StatusPill status={pool.status} size="sm" className="md:hidden" />
      </div>
      {/* Preset */}
      <div className="hidden md:block">
        {pool.isLink ? <LinkBadge platform={pool.link?.platform} /> : <PresetBadge preset={pool.presetId} variant="dot" />}
      </div>
      {/* Price */}
      <div className="mt-3 flex items-center justify-between md:mt-0 md:block">
        <Amount value={pool.price} unit={quote} className="text-[15px] font-medium text-ink md:text-[15px]" unitClassName="text-xs" />
        <span className={cn('font-mono text-[13px] md:hidden', progressInk(pool.progress, pool.isMigrated))}>{formatPercent(pct(pool))}</span>
      </div>
      {/* Progress */}
      <div className="mt-2 flex flex-col gap-2 md:mt-0">
        <div className="hidden justify-between font-mono text-xs font-medium md:flex">
          <span className={progressInk(pool.progress, pool.isMigrated)}>{formatPercent(pct(pool))}</span>
          <span className="truncate pl-2 text-ink-muted">
            {formatAmount(pool.quoteReserveUi)} / {formatAmount(pool.thresholdUi)} {quote}
          </span>
        </div>
        <ShellBar progress={pool.progress} hatched={pool.isMigrated} height={8} />
      </div>
      {/* Status */}
      <div className="hidden md:block">
        <StatusPill status={pool.status} />
      </div>
      <ChevronRight size={18} className="hidden text-ink-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink md:block" />
    </Link>
  );
}

function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cn('border-b border-surface-3 px-4 py-4 last:border-b-0 md:items-center md:px-6 md:py-[18px]', GRID)}>
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-[52px] w-[52px] rounded-sm" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="hidden h-7 w-28 md:block" />
          <Skeleton className="mt-3 h-4 w-28 md:mt-0" />
          <Skeleton className="mt-2 h-2 w-full md:mt-0" />
          <Skeleton className="hidden h-7 w-24 md:block" />
          <span />
        </div>
      ))}
    </>
  );
}

export function HatchTable({
  pools,
  isLoading,
  error,
  onRetry,
  createdAt,
}: {
  pools: HatchPool[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  createdAt?: Record<string, number>;
}) {
  const [filter, setFilter] = useState<Filter>('ALL');
  // The "Link coins" tab only where link coins exist (a LINK config is set; not on mainnet today).
  const { data: hc } = usePresetConfigs();
  const filters = hc?.link ? FILTERS : FILTERS.filter((f) => f.value !== 'LINK');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const list = useMemo(() => pools ?? [], [pools]);
  const metas = useQueries({
    queries: list.map((p) => ({ queryKey: ['hatch', 'metadata', p.baseMint], queryFn: () => fetchTokenMetadata(p.baseMint), staleTime: 5 * 60_000 })),
  });
  const mdByMint = useMemo(() => new Map(list.map((p, i) => [p.baseMint, metas[i]?.data])), [list, metas]);

  const filtered = useMemo(() => {
    // Newest first when creation times are known; the chain order otherwise.
    const created = (p: HatchPool) => createdAt?.[p.address] ?? p.link?.hatchedAt ?? 0; // link coins: when they were hatched
    const sorted = createdAt ? [...list].sort((a, b) => created(b) - created(a)) : list;
    return sorted.filter((p) => matchesHatch(p, filter, query, mdByMint.get(p.baseMint)));
  }, [list, filter, query, mdByMint, createdAt]);

  return (
    <section className="flex flex-col gap-7" aria-labelledby="hatches-title">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="flex flex-col gap-2.5">
          <h2 id="hatches-title" className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.025em] text-ink md:text-[44px]">
            Hatches
          </h2>
          <p className="text-[15px] text-ink-2 md:text-base">Tokens launched with Hatch, read live from Meteora DBC.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <Segmented
              label="Filter hatches"
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setShown(PAGE);
              }}
              options={filters}
              equal={false}
              className="w-max"
            />
          </div>
          <label className="flex h-[46px] w-full items-center gap-2.5 rounded-pill border border-line px-4 text-sm transition-colors focus-within:border-yolk focus-within:shadow-focus sm:w-60">
            <SearchIcon size={15} className="shrink-0 text-ink-muted" />
            <span className="sr-only">Search hatches</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
              placeholder={hc?.link ? "Search name, ticker or link" : "Search name or ticker"}
              className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-surface-3">
        <div className={cn('hidden border-b border-surface-3 bg-surface-1 px-6 py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-muted', GRID)}>
          <span>Token</span>
          <span>Preset</span>
          <span>Price</span>
          <span>Progress</span>
          <span>Status</span>
          <span />
        </div>
        {isLoading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="font-display text-xl font-semibold text-ink">Couldn&apos;t read the hatches</span>
            <span className="max-w-md text-sm text-ink-2">{error instanceof Error ? error.message : 'The chain read failed.'}</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <MiniEgg progress={0} className="scale-125" />
            <span className="font-display text-xl font-semibold text-ink">{list.length ? 'No hatches match' : 'No hatches yet'}</span>
            <span className="text-sm text-ink-2">{list.length ? 'Try another filter or search.' : 'Be the first to hatch a token.'}</span>
            {!list.length && (
              <Button asChild size="sm">
                <Link href="/launch">Hatch a token</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            {filtered.slice(0, shown).map((p) => (
              <Row key={p.address} pool={p} md={mdByMint.get(p.baseMint)} created={createdAt?.[p.address] ?? p.link?.hatchedAt ?? undefined} />
            ))}
            {filtered.length > shown && (
              <div className="flex justify-center border-t border-surface-3 bg-hatch-bg p-[18px]">
                <Button variant="outline" size="header" onClick={() => setShown((n) => n + PAGE)}>
                  Load more hatches
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
