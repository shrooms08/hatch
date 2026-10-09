// "Your earnings": the pool creator's trading-fee share, paid in the pool's quote token (all Hatch configs
// collect fees in the quote token: NVDAx/TSLAx for stock pools, SOL otherwise). Shown only to the creator's
// wallet; every hook (balance preflight, price) lives in the inner card, so other visitors cost no reads.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@jup-ag/wallet-adapter';
import { Amount, Button, Card, DefRow, notify } from '@/components/ds';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildClaimCreatorFees, signAndSend } from '@/lib/dbc/transactions';
import { formatAmount } from '@/lib/format/amount';
import { getConnection } from '@/lib/solana/connection';
import { EXPLORER_NAME, explorerTxUrl } from '@/lib/config/network';
import { stockForConfig } from '@/lib/presets';
import { claimCostLamports, formatSol, formatSolNeed } from '@/lib/costs';
import { playChirpDouble } from '@/lib/motion/sound';
import { usePresetConfigs, useHasTokenAccount, useQuoteSymbol, useRentPerByte, useSolLamports, useUsdPrice } from '@/hooks/useHatch';
import { reportTxError, type FriendlyError } from '@/lib/txErrors';
import { SolShortNote, TxErrorNote } from './TxErrorNote';

export function ClaimCreatorFees({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  if (!wallet.publicKey || wallet.publicKey.toBase58() !== pool.creator) return null; // non-creators see nothing
  return <EarningsCard pool={pool} baseSymbol={baseSymbol} />;
}

const usdText = (v: number) => (v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`);

function EarningsCard({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const quoteSymbol = useQuoteSymbol(pool.quote);
  const usd = useUsdPrice(pool.quote.address);
  const { data: hc } = usePresetConfigs();
  const stock = pool.presetId === 'STOCK' && hc ? stockForConfig(hc, pool.configKey) : null;
  const [busy, setBusy] = useState(false);
  const [txError, setTxError] = useState<FriendlyError | null>(null);

  const { creatorQuote, creatorBase, creatorClaimedQuote } = pool.fees;
  const nothing = creatorQuote.isZero() && creatorBase.isZero();

  // SOL preflight: fee + priority + rent for any token account the claim creates.
  const solLamports = useSolLamports(wallet.publicKey);
  const rent = useRentPerByte();
  const hasBase = useHasTokenAccount(wallet.publicKey, pool.baseMint);
  const hasQuote = useHasTokenAccount(pool.quote.isNativeSol ? null : wallet.publicKey, pool.quote);
  const need =
    rent.data != null && hasBase.data !== undefined && (pool.quote.isNativeSol || hasQuote.data !== undefined)
      ? claimCostLamports({ perByte: rent.data, needsBaseAccount: !hasBase.data, needsQuoteAccount: !pool.quote.isNativeSol && !hasQuote.data, quoteIsSol: pool.quote.isNativeSol })
      : null;
  const solShort = !nothing && need != null && solLamports.data != null && solLamports.data < need;

  const claim = async () => {
    setBusy(true);
    setTxError(null);
    try {
      const connection = getConnection();
      const tx = await buildClaimCreatorFees({ connection, creator: wallet.publicKey!, pool: pool.address });
      const sig = await signAndSend(wallet, connection, tx);
      playChirpDouble(0.4);
      notify.success({
        title: 'Earnings claimed',
        body: `${formatAmount(creatorQuote)} ${quoteSymbol}${creatorBase.isZero() ? '' : ` + ${formatAmount(creatorBase)} ${baseSymbol}`} sent to your wallet.`,
        action: { label: `View on ${EXPLORER_NAME}`, href: explorerTxUrl(sig) },
      });
      await queryClient.invalidateQueries(['hatch']);
    } catch (e) {
      const f = reportTxError(e, { balanceLamports: solLamports.data, neededLamports: need, symbol: 'SOL' }, 'claim');
      setTxError(f);
      notify.error({ title: "Claim didn't go through", body: f.message, action: { label: 'Try again', onClick: () => void claim() } });
    } finally {
      setBusy(false);
    }
  };

  const unclaimedUsd = usd.data && !creatorQuote.isZero() ? creatorQuote.mul(usd.data).toNumber() : null;
  const claimedUsd = usd.data && !creatorClaimedQuote.isZero() ? creatorClaimedQuote.mul(usd.data).toNumber() : null;
  return (
    <Card className="flex flex-col gap-4 rounded-[24px] p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">Your earnings</h2>
        <span className="rounded-pill border border-success/40 px-2 py-1 font-mono text-[11px] font-medium tracking-[0.08em] text-success">YOU CREATED THIS</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-2">Unclaimed trading fees</span>
        <Amount value={creatorQuote} unit={quoteSymbol} className="text-[28px] font-medium text-ink" unitClassName="text-[15px]" />
        {!creatorBase.isZero() && <Amount value={creatorBase} unit={baseSymbol} className="text-sm text-ink-2" />}
        {unclaimedUsd !== null && <span className="font-mono text-[13px] font-medium text-ink-muted">≈ {usdText(unclaimedUsd)}</span>}
      </div>
      <div className="flex flex-col gap-2 text-[13px]">
        <DefRow label="Claimed so far" className="text-[13px]">
          <span className="font-mono">
            {formatAmount(creatorClaimedQuote)} {quoteSymbol}
            {claimedUsd !== null && <span className="text-ink-muted"> · ≈ {usdText(claimedUsd)}</span>}
          </span>
        </DefRow>
        <DefRow label="Your share" className="text-[13px]">
          {pool.creatorFeePct}% of trading fees
        </DefRow>
      </div>
      <span className="text-xs leading-normal text-ink-muted">
        {stock ? `Paid in tokenized ${stock.name} (${stock.symbol}).` : pool.quote.isNativeSol ? 'Paid in SOL.' : `Paid in ${quoteSymbol}.`} Claims go to this wallet.
      </span>
      {solShort && <SolShortNote need={formatSolNeed(need!)} have={formatSol(solLamports.data!)} />}
      <Button variant={pool.isMigrated ? 'primary' : 'secondary'} block onClick={claim} loading={busy} disabled={nothing || solShort}>
        {busy ? 'Confirm in your wallet…' : nothing ? 'Nothing to claim yet' : 'Claim earnings'}
      </Button>
      <TxErrorNote error={txError} onDismiss={() => setTxError(null)} />
    </Card>
  );
}
