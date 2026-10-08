import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import { Amount, Button, Card, ChipGroup, DefRow, Segmented, SubscriptNumber, Toggle, TokenBadge, inputShell, notify } from '@/components/ds';
import { cn } from '@/lib/utils';
import type { HatchPool } from '@/lib/dbc/pool';
import { buildSwap, signAndSend, signAndSendVersioned, type TradeSide } from '@/lib/dbc/transactions';
import { buildPayWithSol, quotePayWithSol } from '@/lib/dbc/payWithSol';
import { rawToUi } from '@/lib/solana/mint';
import { formatAmount } from '@/lib/format/amount';
import { getConnection } from '@/lib/solana/connection';
import { NETWORK, explorerTxUrl, EXPLORER_NAME } from '@/lib/config/network';
import { JupiterBusyError, WSOL } from '@/lib/jupiter';
import { useQuoteSymbol, useTokenBalance, useTokenMetadata } from '@/hooks/useHatch';

const SLIPPAGE_OPTIONS = [50, 100, 200];
const SOL_FEE_BUFFER = 0.01; // keep some SOL for fees (and new token-account rent) when paying with SOL

function isValidAmount(v: string) {
  return /^\d*\.?\d+$/.test(v) && Number(v) > 0;
}

const errorText = (e: unknown, fallback: string) =>
  e instanceof JupiterBusyError ? e.message : e instanceof Error ? e.message : fallback;

const pctLabel = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export function TradePanel({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const queryClient = useQueryClient();
  const quoteSymbol = useQuoteSymbol(pool.quote);
  const { data: baseMd } = useTokenMetadata(pool.baseMint);

  const [side, setSide] = useState<TradeSide>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(100);
  const [customSlippage, setCustomSlippage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  // "Pay with SOL": mainnet only (Jupiter has no devnet), for pools not quoted in SOL.
  const canPayWithSol = NETWORK === 'mainnet-beta' && !pool.quote.isNativeSol;
  const [payWithSol, setPayWithSol] = useState(false);
  const [payTouched, setPayTouched] = useState(false);

  const quoteBalance = useTokenBalance(wallet.publicKey, pool.quote.address);
  const baseBalance = useTokenBalance(wallet.publicKey, pool.baseMint);
  const solBalance = useTokenBalance(canPayWithSol || pool.quote.isNativeSol ? wallet.publicKey : null, WSOL.toBase58());
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
          via: q.jup.routePlan.map((r) => r.swapInfo.label).join(' → '),
        };
      }
      const { quote } = await buildSwap({ connection: getConnection(), owner: wallet.publicKey!, pool: pool.address, side, amountUi: amount, slippageBps });
      return { out: rawToUi(quote.outRaw, quote.outMint), minOut: rawToUi(quote.minOutRaw, quote.outMint), via: null as string | null };
    },
    enabled: !!wallet.publicKey && isValidAmount(amount) && !pool.isMigrated,
    staleTime: 5_000,
    retry: false,
  });

  if (pool.isMigrated) return null; // the page shows "Trade on Meteora" instead

  const maxAmount = () => {
    if (!inBalance) return null;
    const max = side === 'buy' && (usingSol || pool.quote.isNativeSol) ? inBalance.minus(SOL_FEE_BUFFER) : inBalance;
    return max.gt(0) ? max.toFixed() : '0'; // toFixed: never exponent notation in the input
  };

  const done = async (sig: string, out: string | null) => {
    const view = { label: `View on ${EXPLORER_NAME}`, href: explorerTxUrl(sig) };
    if (side === 'buy')
      notify.success({
        title: `Bought ${out ? `≈${out} ` : ''}${baseSymbol}`,
        body: usingSol ? `Paid ${amount} SOL, swapped to ${quoteSymbol} for you.` : `Paid ${amount} ${quoteSymbol}.`,
        action: view,
      });
    else notify.success({ title: `Sold ${amount} ${baseSymbol}`, body: out ? `Received ≈${out} ${quoteSymbol}.` : undefined, action: view });
    setAmount('');
    await queryClient.invalidateQueries(['hatch']);
  };

  const submitWithSol = async (out: string | null) => {
    const connection = getConnection();
    const q = await quotePayWithSol({ connection, pool: pool.address, solUi: amount, slippageBps });
    const plan = await buildPayWithSol(connection, wallet.publicKey!, q);
    if (plan.kind === 'single') {
      setStep('Confirm in your wallet (one signature)…');
      return done(await signAndSendVersioned(wallet, connection, plan.tx), out);
    }
    setStep(`Step 1 of 2: swap SOL to ${quoteSymbol}. Confirm in your wallet…`);
    const sig1 = await signAndSendVersioned(wallet, connection, plan.step1);
    notify.success({ title: `Step 1 of 2 done: got ${quoteSymbol}`, action: { label: `View on ${EXPLORER_NAME}`, href: explorerTxUrl(sig1) } });
    setStep(`Step 2 of 2: buy ${baseSymbol} with ${quoteSymbol}. Confirm in your wallet…`);
    try {
      return done(await signAndSendVersioned(wallet, connection, await plan.step2()), out);
    } catch (e) {
      throw new Error(`Step 2 failed: ${errorText(e, 'buy failed')}. Your ${quoteSymbol} is in your wallet; turn off "Pay with SOL" to buy with it.`);
    }
  };

  const submit = async () => {
    if (!wallet.publicKey) return setShowModal(true);
    if (!isValidAmount(amount)) return notify.error('Enter an amount');
    if (inBalance && inBalance.lt(amount)) return notify.error(`Not enough ${inSymbol}`);
    const out = preview.data ? formatAmount(preview.data.out) : null;
    setSubmitting(true);
    try {
      if (usingSol) await submitWithSol(out);
      else {
        const connection = getConnection();
        const { tx } = await buildSwap({ connection, owner: wallet.publicKey, pool: pool.address, side, amountUi: amount, slippageBps });
        await done(await signAndSend(wallet, connection, tx), out);
      }
    } catch (e) {
      notify.error({ title: "Transaction didn't go through", body: errorText(e, 'Swap failed'), action: { label: 'Try again', onClick: () => void submit() } });
    } finally {
      setSubmitting(false);
      setStep(null);
    }
  };

  // Quick amounts: fixed sizes for buys, fractions of the balance for sells.
  const quick =
    side === 'buy'
      ? [
          { value: '0.1', label: '0.1' },
          { value: '0.5', label: '0.5' },
          { value: '1', label: '1' },
          { value: 'max', label: 'Max' },
        ]
      : [
          { value: '0.25', label: '25%' },
          { value: '0.5', label: '50%' },
          { value: '0.75', label: '75%' },
          { value: 'max', label: 'Max' },
        ];
  const pickQuick = (v: string) => {
    if (v === 'max') return setAmount(maxAmount() ?? '');
    if (side === 'sell') return setAmount(baseBalance.data ? baseBalance.data.mul(v).toDecimalPlaces(pool.baseDecimals).toFixed() : '');
    setAmount(v);
  };
  const route = side === 'buy' ? [...(usingSol ? ['SOL'] : []), quoteSymbol, baseSymbol] : [baseSymbol, quoteSymbol];

  return (
    <Card className="flex flex-col gap-[18px] rounded-[24px] p-5 md:p-6">
      <Segmented
        label="Trade side"
        size="lg"
        value={side}
        onChange={(s) => {
          setSide(s);
          setAmount('');
        }}
        options={[
          { value: 'buy', label: 'Buy' },
          { value: 'sell', label: 'Sell' },
        ]}
      />

      {canPayWithSol && side === 'buy' && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-ink">Pay with SOL</span>
            <span className="text-xs text-ink-muted">We swap it to {quoteSymbol} for you</span>
          </div>
          <Toggle
            label="Pay with SOL"
            checked={payWithSol}
            onChange={(v) => {
              setPayTouched(true);
              setPayWithSol(v);
              setAmount('');
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[13px] text-ink-2">
          <label htmlFor="trade-amount">You pay</label>
          <button
            type="button"
            onClick={() => pickQuick('max')}
            disabled={!inBalance}
            className="font-mono text-ink-muted transition-colors hover:text-ink disabled:hover:text-ink-muted"
          >
            Balance {inBalance ? <SubscriptNumber text={formatAmount(inBalance)} /> : wallet.publicKey ? '…' : '-'} {inSymbol}
          </button>
        </div>
        <div className={cn(inputShell(), 'h-16 rounded-[16px] pl-[18px] pr-2.5')}>
          <input
            id="trade-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="h-full min-w-0 flex-1 bg-transparent font-mono text-[26px] font-medium text-ink outline-none placeholder:text-ink-disabled"
          />
          <TokenBadge symbol={inSymbol} className="h-10 px-3 text-sm" />
        </div>
        <ChipGroup
          label="Quick amount"
          value={null}
          onChange={pickQuick}
          options={quick}
          className="flex-nowrap gap-1.5"
          chipClassName="h-8 flex-1 px-0 text-xs"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-ink-2">You receive</span>
        <div className="flex h-16 items-center gap-2 rounded-[16px] bg-surface-2 pl-[18px] pr-2.5" aria-live="polite">
          <span className={cn('min-w-0 flex-1 truncate font-mono text-[26px] font-medium', preview.data ? 'text-ink' : 'text-ink-disabled')}>
            {preview.data ? <SubscriptNumber text={formatAmount(preview.data.out)} /> : preview.isFetching ? '…' : '0'}
          </span>
          <TokenBadge
            symbol={outSymbol}
            image={side === 'buy' ? baseMd?.json?.image : null}
            className="h-10 bg-surface-3 pl-[5px] pr-3 text-sm [&>img]:h-7 [&>img]:w-7"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 text-[13px]">
        <DefRow label="Minimum received" className="text-[13px]">
          {preview.data ? <Amount value={preview.data.minOut} /> : '-'}
        </DefRow>
        <DefRow label="Route" className="text-[13px]">
          <span title={preview.data?.via ? `Jupiter: ${preview.data.via}` : undefined}>{route.join(' → ')}</span>
        </DefRow>
        <DefRow label="Fee" className="text-[13px]">
          1%
        </DefRow>
        {preview.error ? (
          <p className="text-[13px] text-danger" role="alert">
            {errorText(preview.error, 'Could not get a quote')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-ink-2">Slippage{usingSol ? ' (each leg)' : ''}</span>
        <div className="flex items-center gap-1.5">
          <ChipGroup
            label="Slippage"
            value={customSlippage ? null : slippageBps}
            onChange={(v) => {
              setCustomSlippage(false);
              setSlippageBps(v);
            }}
            options={SLIPPAGE_OPTIONS.map((bps) => ({ value: bps, label: pctLabel(bps) }))}
            className="gap-1.5"
            chipClassName="h-[30px] px-3 text-xs"
          />
          {customSlippage ? (
            <label className="flex h-[30px] w-[74px] items-center rounded-pill border border-yolk bg-yolk/[0.12] px-2.5 font-mono text-xs text-ink-accent">
              <span className="sr-only">Custom slippage percent</span>
              <input
                autoFocus
                inputMode="decimal"
                defaultValue={(slippageBps / 100).toString()}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v > 0 && v <= 50) setSlippageBps(Math.round(v * 100));
                }}
                className="w-full bg-transparent outline-none"
              />
              %
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setCustomSlippage(true)}
              className="h-[30px] rounded-pill border border-dashed border-line-strong px-3 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Custom
            </button>
          )}
        </div>
      </div>

      {wallet.publicKey && (
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-md bg-inset px-3.5 py-3 font-mono text-xs font-medium text-ink-muted">
          {(canPayWithSol || pool.quote.isNativeSol) && (
            <span>
              <SubscriptNumber text={solBalance.data ? formatAmount(solBalance.data) : '…'} /> SOL
            </span>
          )}
          {!pool.quote.isNativeSol && (
            <span>
              <SubscriptNumber text={quoteBalance.data ? formatAmount(quoteBalance.data) : '…'} /> {quoteSymbol}
            </span>
          )}
          <span>
            <SubscriptNumber text={baseBalance.data ? formatAmount(baseBalance.data) : '…'} /> {baseSymbol}
          </span>
        </div>
      )}

      {step && (
        <p className="text-[13px] text-ink-accent" role="status">
          {step}
        </p>
      )}
      <Button size="lg" block glow onClick={submit} loading={submitting} className="h-[60px] text-lg">
        {!wallet.publicKey ? 'Connect wallet' : submitting ? 'Working…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${baseSymbol}`}
      </Button>
    </Card>
  );
}
