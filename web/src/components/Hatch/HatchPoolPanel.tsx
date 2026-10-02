import type { HatchPool } from '@/lib/dbc/pool';
import { formatUi } from '@/lib/solana/mint';
import { explorerAddressUrl } from '@/lib/config/network';
import { shortenAddress } from '@/lib/utils';
import { useQuoteSymbol } from '@/hooks/useHatch';
import { CurveProgress, HatchStatusBadge } from './HatchStatus';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="text-right text-neutral-100">{children}</span>
    </div>
  );
}

function AddressLink({ address, className }: { address: string; className?: string }) {
  return (
    <a href={explorerAddressUrl(address)} target="_blank" rel="noreferrer" className={className ?? 'hover:underline'}>
      {shortenAddress(address)}
    </a>
  );
}

export function HatchPoolPanel({ pool, symbol }: { pool: HatchPool; symbol?: string }) {
  const quote = useQuoteSymbol(pool.quote);
  return (
    <div className="rounded-lg border border-neutral-750 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Bonding curve</h2>
        <HatchStatusBadge status={pool.status} />
      </div>
      <CurveProgress progress={pool.progress} className="mb-3" />
      <Row label="Price">
        {formatUi(pool.price)} {quote}
        {symbol ? ` per ${symbol}` : ''}
      </Row>
      <Row label="Raised">
        {formatUi(pool.quoteReserveUi)} / {formatUi(pool.thresholdUi)} {quote}
      </Row>
      <Row label="Quote token">
        {quote}
        {pool.quote.isToken2022 ? ' (Token-2022)' : ''} · <AddressLink address={pool.quote.address} />
      </Row>
      <Row label="DBC pool">
        <AddressLink address={pool.address} />
      </Row>
      {pool.dammV2Pool && (
        <Row label="DAMM v2 pool">
          <AddressLink address={pool.dammV2Pool} className="text-primary hover:underline" />
        </Row>
      )}
    </div>
  );
}
