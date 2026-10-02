import Link from 'next/link';
import type { HatchPool } from '@/lib/dbc/pool';
import { formatAmount } from '@/lib/format/amount';
import { PRESETS } from '@/lib/presets';
import { useQuoteSymbol, useTokenMetadata } from '@/hooks/useHatch';
import { CurveProgress, HatchStatusBadge } from './HatchStatus';

function HatchRow({ pool, showFees }: { pool: HatchPool; showFees: boolean }) {
  const { data: md } = useTokenMetadata(pool.baseMint);
  const quote = useQuoteSymbol(pool.quote);
  const image = md?.json?.image;
  return (
    <Link
      href={`/token/${pool.baseMint}`}
      className="flex flex-col gap-3 rounded-lg border border-neutral-750 p-4 transition-colors hover:border-neutral-600 md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-md bg-neutral-850" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{md?.name ?? '…'}</span>
            {md?.symbol && <span className="text-sm text-neutral-400">${md.symbol}</span>}
          </div>
          <div className="text-xs text-neutral-500">
            {pool.presetId ? PRESETS[pool.presetId].label : 'Unknown preset'} · {formatAmount(pool.price)} {quote}
          </div>
        </div>
      </div>
      <div className="w-full md:w-48">
        <CurveProgress progress={pool.progress} />
      </div>
      {showFees && (
        <div className="text-xs text-neutral-400 md:w-44 md:text-right">
          Claimable: {formatAmount(pool.fees.creatorQuote)} {quote}
        </div>
      )}
      <HatchStatusBadge status={pool.status} className="self-start md:self-center" />
    </Link>
  );
}

export function HatchList({
  pools,
  isLoading,
  error,
  empty,
  showFees = false,
}: {
  pools: HatchPool[] | undefined;
  isLoading: boolean;
  error: unknown;
  empty: React.ReactNode;
  showFees?: boolean;
}) {
  if (isLoading) return <p className="text-sm text-neutral-400">Loading from chain…</p>;
  if (error) return <p className="text-sm text-rose">{error instanceof Error ? error.message : 'Failed to load'}</p>;
  if (!pools?.length) return <div className="text-sm text-neutral-400">{empty}</div>;
  return (
    <div className="flex flex-col gap-3">
      {pools.map((p) => (
        <HatchRow key={p.address} pool={p} showFees={showFees} />
      ))}
    </div>
  );
}
