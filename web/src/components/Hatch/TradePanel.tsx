import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildSwap, signAndSend, signAndSendVersioned, type TradeSide } from '@/lib/dbc/transactions';
import { buildPayWithSol, quotePayWithSol } from '@/lib/dbc/payWithSol';
import { rawToUi } from '@/lib/solana/mint';
import { formatAmount, formatPercent } from '@/lib/format/amount';
import { getConnection } from '@/lib/solana/connection';
import { NETWORK, explorerAddressUrl, explorerTxUrl } from '@/lib/config/network';
import { JupiterBusyError, WSOL } from '@/lib/jupiter';
import { useQuoteSymbol, useTokenBalance } from '@/hooks/useHatch';

const SLIPPAGE_OPTIONS = [50, 100, 200];
const SOL_FEE_BUFFER = 0.01; // keep some SOL for fees (and new token-account rent) when paying with SOL

function isValidAmount(v: string) {
  return /^\d*\.?\d+$/.test(v) && Number(v) > 0;
}

const errorText = (e: unknown, fallback: string) =>
  e instanceof JupiterBusyError ? e.message : e instanceof Error ? e.message : fallback;

export function TradePanel({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const queryClient = useQueryClient();
  const quoteSymbol = useQuoteSymbol(pool.quote);

  const [side, setSide] = useState<TradeSide>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  // "Pay with SOL": mainnet only (Jupiter has no devnet), for pools not quoted in SOL.
  const canPayWithSol = NETWORK === 'mainnet-beta' && !pool.quote.isNativeSol;
  const [payWithSol, setPayWithSol] = useState(false);
  const [payTouched, setPayTouched] = useState(false);

  const quoteBalance = useTokenBalance(wallet.publicKey, pool.quote.address);
  const baseBalance = useTokenBalance(wallet.publicKey, pool.baseMint);
  const solBalance = useTokenBalance(canPayWithSol ? wallet.publicKey : null, WSOL.toBase58());
  const usingSol = canPayWithSol && side === 'buy' && payWithSol;

  // Default ON when the wallet holds none of the quote token (until the user flips it).
  useEffect(() => {
    if (canPayWithSol && !payTouched && quoteBalance.data) setPayWithSol(quoteBalance.data.isZero());
  }, [canPayWithSol, payTouched, quoteBalance.data]);

  const inSymbol = usingSol ? 'SOL' : side === 'buy' ? quoteSymbol : baseSymbol;
  const outSymbol = side === 'buy' ? baseSymbol : quoteSymbol;
  const inBalance = usingSol ? solBalance.data : side === 'buy' ? quoteBalance.data : baseBalance.data;

  const preview = useQuery({
    queryKey: ['hatch', 'swap-preview', pool.address, side, amount, slippageBps, usingSol, wallet.publicKey?.toBase58()],
    queryFn: async () => {
      if (usingSol) {
        const q = await quotePayWithSol({ connection: getConnection(), pool: pool.address, solUi: amount, slippageBps });
        return {
          out: rawToUi(q.baseOutRaw, q.baseMint),
          minOut: rawToUi(q.baseMinRaw, q.baseMint),
          via: `${formatAmount(rawToUi(q.quoteMinRaw, q.quoteMint))}+ ${quoteSymbol} via ${q.jup.routePlan.map((r) => r.swapInfo.label).join(' → ')}`,
        };
      }
      const { quote } = await buildSwap({ connection: getConnection(), owner: wallet.publicKey!, pool: pool.address, side, amountUi: amount, slippageBps });
      return { out: rawToUi(quote.outRaw, quote.outMint), minOut: rawToUi(quote.minOutRaw, quote.outMint), via: null as string | null };
    },
    enabled: !!wallet.publicKey && isValidAmount(amount) && !pool.isMigrated,
    staleTime: 5_000,
    retry: false,
  });

  if (pool.isMigrated) {
    return (
      <div className="rounded-lg border border-neutral-750 p-4 text-sm text-neutral-300">
        <p className="mb-1 font-semibold text-neutral-100">This token has hatched 🐣</p>
        <p>The bonding curve is closed. Trading continues in its Meteora DAMM v2 pool.</p>
        {pool.dammV2Pool && (
          <a href={explorerAddressUrl(pool.dammV2Pool)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary hover:underline">
            View DAMM v2 pool
          </a>
        )}
      </div>
    );
  }

  const setMax = () => {
    if (!inBalance) return;
    const max = side === 'buy' && (usingSol || pool.quote.isNativeSol) ? inBalance.minus(SOL_FEE_BUFFER) : inBalance;
    setAmount(max.gt(0) ? max.toFixed() : '0'); // toFixed: never exponent notation in the input
  };

  const done = async (sig: string) => {
    toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${baseSymbol}`, {
      action: { label: 'View', onClick: () => window.open(explorerTxUrl(sig), '_blank') },
    });
    setAmount('');
    await queryClient.invalidateQueries(['hatch']);
  };

  const submitWithSol = async () => {
    const connection = getConnection();
    const q = await quotePayWithSol({ connection, pool: pool.address, solUi: amount, slippageBps });
    const plan = await buildPayWithSol(connection, wallet.publicKey!, q);
    if (plan.kind === 'single') {
      setStep('Confirm in your wallet (one signature)…');
      return done(await signAndSendVersioned(wallet, connection, plan.tx));
    }
    setStep(`Step 1 of 2: swap SOL to ${quoteSymbol}. Confirm in your wallet…`);
    const sig1 = await signAndSendVersioned(wallet, connection, plan.step1);
    toast.success(`Step 1 of 2 done: got ${quoteSymbol}`, { action: { label: 'View', onClick: () => window.open(explorerTxUrl(sig1), '_blank') } });
    setStep(`Step 2 of 2: buy ${baseSymbol} with ${quoteSymbol}. Confirm in your wallet…`);
    try {
      return done(await signAndSendVersioned(wallet, connection, await plan.step2()));
    } catch (e) {
      throw new Error(`Step 2 failed: ${errorText(e, 'buy failed')}. Your ${quoteSymbol} is in your wallet; turn off "Pay with SOL" to buy with it.`);
    }
  };

  const submit = async () => {
    if (!wallet.publicKey) return setShowModal(true);
    if (!isValidAmount(amount)) return toast.error('Enter an amount');
    if (inBalance && inBalance.lt(amount)) return toast.error(`Not enough ${inSymbol}`);
    setSubmitting(true);
    try {
      if (usingSol) await submitWithSol();
      else {
        const connection = getConnection();
        const { tx } = await buildSwap({ connection, owner: wallet.publicKey, pool: pool.address, side, amountUi: amount, slippageBps });
        await done(await signAndSend(wallet, connection, tx));
      }
    } catch (e) {
      toast.error(errorText(e, 'Swap failed'));
    } finally {
      setSubmitting(false);
      setStep(null);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-750 p-4">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-neutral-900 p-1">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSide(s);
              setAmount('');
            }}
            className={cn(
              'rounded-full py-1.5 text-sm font-semibold capitalize transition-colors',
              side === s ? (s === 'buy' ? 'bg-emerald/20 text-emerald' : 'bg-rose/20 text-rose') : 'text-neutral-400'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {canPayWithSol && side === 'buy' && (
        <label className="mb-3 flex items-center justify-between gap-2 text-sm text-neutral-300">
          <span>
            Pay with SOL <span className="text-xs text-neutral-500">(swaps to {quoteSymbol} via Jupiter)</span>
          </span>
          <input
            type="checkbox"
            checked={payWithSol}
            onChange={(e) => {
              setPayTouched(true);
              setPayWithSol(e.target.checked);
              setAmount('');
            }}
          />
        </label>
      )}

      <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
        <span>You pay ({inSymbol})</span>
        <button type="button" onClick={setMax} className="hover:text-neutral-200" disabled={!inBalance}>
          Balance: {inBalance ? formatAmount(inBalance) : wallet.publicKey ? '…' : '-'}
        </button>
      </div>
      <input
        inputMode="decimal"
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
        className="w-full rounded-lg border border-neutral-750 bg-background p-3 text-lg focus:border-primary/60 focus:outline-none"
      />

      <div className="mt-3 space-y-1 text-xs text-neutral-400">
        {usingSol && (
          <div className="flex justify-between">
            <span>SOL cost</span>
            <span className="text-neutral-200">{isValidAmount(amount) ? `${amount} SOL + network fee` : '-'}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>You receive (est.)</span>
          <span className="text-neutral-200">
            {preview.data ? `${formatAmount(preview.data.out)} ${outSymbol}` : preview.isFetching ? '…' : '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Minimum received</span>
          <span>{preview.data ? `${formatAmount(preview.data.minOut)} ${outSymbol}` : '-'}</span>
        </div>
        {usingSol && preview.data?.via && <div className="text-neutral-500">Route: {preview.data.via}</div>}
        {preview.error ? <p className="text-rose">{errorText(preview.error, 'Could not get a quote')}</p> : null}
        <div className="flex items-center justify-between pt-1">
          <span>Slippage {usingSol ? '(each leg)' : ''}</span>
          <div className="flex gap-1">
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                className={cn('rounded px-2 py-0.5', slippageBps === bps ? 'bg-neutral-800 text-neutral-100' : 'hover:text-neutral-200')}
              >
                {formatPercent(bps / 10_000)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-between">
          <span>Your {baseSymbol}</span>
          <span>{baseBalance.data ? formatAmount(baseBalance.data) : '-'}</span>
        </div>
        {canPayWithSol && side === 'buy' && (
          <div className="flex justify-between">
            <span>Your {quoteSymbol}</span>
            <span>{quoteBalance.data ? formatAmount(quoteBalance.data) : '-'}</span>
          </div>
        )}
      </div>

      {step && <p className="mt-3 text-xs text-primary">{step}</p>}
      <Button className="mt-4 w-full" onClick={submit} disabled={submitting}>
        {!wallet.publicKey ? 'Connect wallet' : submitting ? 'Working…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${baseSymbol}${usingSol ? ' with SOL' : ''}`}
      </Button>
    </div>
  );
}
