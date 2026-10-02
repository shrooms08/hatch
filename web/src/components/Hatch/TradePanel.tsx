import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildSwap, signAndSend, type TradeSide } from '@/lib/dbc/transactions';
import { formatUi, rawToUi } from '@/lib/solana/mint';
import { getConnection } from '@/lib/solana/connection';
import { explorerAddressUrl, explorerTxUrl } from '@/lib/config/network';
import { useQuoteSymbol, useTokenBalance } from '@/hooks/useHatch';

const SLIPPAGE_OPTIONS = [50, 100, 200];
const SOL_FEE_BUFFER = 0.01; // keep some SOL for fees when buying with SOL

function isValidAmount(v: string) {
  return /^\d*\.?\d+$/.test(v) && Number(v) > 0;
}

export function TradePanel({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const queryClient = useQueryClient();
  const quoteSymbol = useQuoteSymbol(pool.quote);

  const [side, setSide] = useState<TradeSide>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100);
  const [submitting, setSubmitting] = useState(false);

  const quoteBalance = useTokenBalance(wallet.publicKey, pool.quote.address);
  const baseBalance = useTokenBalance(wallet.publicKey, pool.baseMint);
  const inSymbol = side === 'buy' ? quoteSymbol : baseSymbol;
  const outSymbol = side === 'buy' ? baseSymbol : quoteSymbol;
  const inBalance = side === 'buy' ? quoteBalance.data : baseBalance.data;

  const preview = useQuery({
    queryKey: ['hatch', 'swap-preview', pool.address, side, amount, slippageBps, wallet.publicKey?.toBase58()],
    queryFn: async () => {
      const { quote } = await buildSwap({
        connection: getConnection(),
        owner: wallet.publicKey!,
        pool: pool.address,
        side,
        amountUi: amount,
        slippageBps,
      });
      return {
        out: rawToUi(quote.outRaw, quote.outMint),
        minOut: rawToUi(quote.minOutRaw, quote.outMint),
      };
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
    const max = side === 'buy' && pool.quote.isNativeSol ? inBalance.minus(SOL_FEE_BUFFER) : inBalance;
    setAmount(max.gt(0) ? max.toString() : '0');
  };

  const submit = async () => {
    if (!wallet.publicKey) return setShowModal(true);
    if (!isValidAmount(amount)) return toast.error('Enter an amount');
    if (inBalance && inBalance.lt(amount)) return toast.error(`Not enough ${inSymbol}`);
    setSubmitting(true);
    try {
      const connection = getConnection();
      const { tx } = await buildSwap({ connection, owner: wallet.publicKey, pool: pool.address, side, amountUi: amount, slippageBps });
      const sig = await signAndSend(wallet, connection, tx);
      toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${baseSymbol}`, {
        action: { label: 'View', onClick: () => window.open(explorerTxUrl(sig), '_blank') },
      });
      setAmount('');
      await queryClient.invalidateQueries(['hatch']);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Swap failed');
    } finally {
      setSubmitting(false);
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

      <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
        <span>You pay ({inSymbol})</span>
        <button type="button" onClick={setMax} className="hover:text-neutral-200" disabled={!inBalance}>
          Balance: {inBalance ? formatUi(inBalance) : wallet.publicKey ? '…' : '-'}
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
        <div className="flex justify-between">
          <span>You receive (est.)</span>
          <span className="text-neutral-200">
            {preview.data ? `${formatUi(preview.data.out)} ${outSymbol}` : preview.isFetching ? '…' : '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Minimum after slippage</span>
          <span>{preview.data ? `${formatUi(preview.data.minOut)} ${outSymbol}` : '-'}</span>
        </div>
        {preview.error instanceof Error && <p className="text-rose">{preview.error.message}</p>}
        <div className="flex items-center justify-between pt-1">
          <span>Slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                className={cn('rounded px-2 py-0.5', slippageBps === bps ? 'bg-neutral-800 text-neutral-100' : 'hover:text-neutral-200')}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-between">
          <span>Your {baseSymbol}</span>
          <span>{baseBalance.data ? formatUi(baseBalance.data) : '-'}</span>
        </div>
      </div>

      <Button className="mt-4 w-full" onClick={submit} disabled={submitting}>
        {!wallet.publicKey ? 'Connect wallet' : submitting ? 'Confirm in your wallet…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${baseSymbol}`}
      </Button>
    </div>
  );
}
