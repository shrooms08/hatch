import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildClaimCreatorFees, signAndSend } from '@/lib/dbc/transactions';
import { formatUi } from '@/lib/solana/mint';
import { getConnection } from '@/lib/solana/connection';
import { explorerTxUrl } from '@/lib/config/network';
import { useQuoteSymbol } from '@/hooks/useHatch';

/** Rendered only for the pool creator's wallet. */
export function ClaimCreatorFees({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const quoteSymbol = useQuoteSymbol(pool.quote);
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
      toast.success('Creator fees claimed', {
        action: { label: 'View', onClick: () => window.open(explorerTxUrl(sig), '_blank') },
      });
      await queryClient.invalidateQueries(['hatch']);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Claim failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-750 p-4">
      <h2 className="mb-2 font-semibold">Your creator fees</h2>
      <p className="mb-3 text-sm text-neutral-300">
        {formatUi(creatorQuote)} {quoteSymbol}
        {!creatorBase.isZero() && ` + ${formatUi(creatorBase)} ${baseSymbol}`} claimable
      </p>
      <Button className="w-full" variant="secondary" onClick={claim} disabled={busy || nothing}>
        {busy ? 'Confirm in your wallet…' : 'Claim creator fees'}
      </Button>
    </div>
  );
}
