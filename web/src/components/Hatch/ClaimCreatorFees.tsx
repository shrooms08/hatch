import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@jup-ag/wallet-adapter';
import { Amount, Button, Card, notify } from '@/components/ds';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildClaimCreatorFees, signAndSend } from '@/lib/dbc/transactions';
import { formatAmount } from '@/lib/format/amount';
import { getConnection } from '@/lib/solana/connection';
import { EXPLORER_NAME, explorerTxUrl } from '@/lib/config/network';
import { useQuoteSymbol, useUsdPrice } from '@/hooks/useHatch';

/** Rendered only for the pool creator's wallet. */
export function ClaimCreatorFees({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const quoteSymbol = useQuoteSymbol(pool.quote);
  const usd = useUsdPrice(pool.quote.address);
  const [busy, setBusy] = useState(false);

  if (!wallet.publicKey || wallet.publicKey.toBase58() !== pool.creator) return null;

  const { creatorQuote, creatorBase } = pool.fees;
  const nothing = creatorQuote.isZero() && creatorBase.isZero();

  const claim = async () => {
    setBusy(true);
    try {
      const connection = getConnection();
      const tx = await buildClaimCreatorFees({ connection, creator: wallet.publicKey!, pool: pool.address });
      const sig = await signAndSend(wallet, connection, tx);
      notify.success({
        title: 'Creator fees claimed',
        body: `${formatAmount(creatorQuote)} ${quoteSymbol}${creatorBase.isZero() ? '' : ` + ${formatAmount(creatorBase)} ${baseSymbol}`} sent to your wallet.`,
        action: { label: `View on ${EXPLORER_NAME}`, href: explorerTxUrl(sig) },
      });
      await queryClient.invalidateQueries(['hatch']);
    } catch (e) {
      notify.error({ title: "Claim didn't go through", body: e instanceof Error ? e.message : 'Claim failed', action: { label: 'Try again', onClick: () => void claim() } });
    } finally {
      setBusy(false);
    }
  };

  const usdValue = usd.data ? creatorQuote.mul(usd.data) : null;
  return (
    <Card className="flex flex-col gap-4 rounded-[24px] p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">Creator fees</h2>
        <span className="rounded-pill border border-success/40 px-2 py-1 font-mono text-[11px] font-medium tracking-[0.08em] text-success">YOU CREATED THIS</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-2">Claimable now</span>
        <Amount value={creatorQuote} unit={quoteSymbol} className="text-[28px] font-medium text-ink" unitClassName="text-[15px]" />
        {!creatorBase.isZero() && <Amount value={creatorBase} unit={baseSymbol} className="text-sm text-ink-2" />}
        {usdValue && !creatorQuote.isZero() && <span className="font-mono text-[13px] font-medium text-ink-muted">≈ ${usdValue.lt(0.01) ? usdValue.toSignificantDigits(2).toFixed() : usdValue.toFixed(2)}</span>}
      </div>
      <Button variant={pool.isMigrated ? 'primary' : 'secondary'} block onClick={claim} loading={busy} disabled={nothing}>
        {busy ? 'Confirm in your wallet…' : nothing ? 'Nothing to claim yet' : 'Claim fees'}
      </Button>
    </Card>
  );
}
