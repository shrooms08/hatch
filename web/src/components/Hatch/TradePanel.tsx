import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
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
import { WSOL } from '@/lib/jupiter';
import { friendlyTxError, reportTxError, type FriendlyError } from '@/lib/txErrors';
import { LAMPORTS_PER_SOL, buyCostLamports, formatSol, formatSolNeed } from '@/lib/costs';
import { SolShortNote, TxErrorNote } from './TxErrorNote';
import { useHasTokenAccount, useLiveBaseFee, useQuoteSymbol, useRentPerByte, useSolLamports, useTokenBalance, useTokenMetadata, usePresetConfigs } from '@/hooks/useHatch';
import { isLinkConfig } from '@/lib/presets';
import { OpenInWallet } from './OpenInWallet';
import { SNIPER_SHIELD_LINE, feeSentence, formatFeePercent } from '@/lib/dbc/feeSchedule';

const SLIPPAGE_OPTIONS = [50, 100, 200];
const SOL_FEE_BUFFER = 0.01; // keep some SOL for fees (and new token-account rent) when paying with SOL

function isValidAmount(v: string) {
  return /^\d*\.?\d+$/.test(v) && Number(v) > 0;
}

const pctLabel = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export function TradePanel({ pool, baseSymbol }: { pool: HatchPool; baseSymbol: string }) {
  const wallet = useWallet();
  const { setShowModal } = useUnifiedWalletContext();
  const queryClient = useQueryClient();
  const quoteSymbol = useQuoteSymbol(pool.quote);
  const fee = useLiveBaseFee(pool);
  const { data: baseMd } = useTokenMetadata(pool.baseMint);

  const router = useRouter();
  const [side, setSide] = useState<TradeSide>('buy');
  // /token/<mint>?tab=sell (links from My Hatches → Holdings) opens on Sell.
  useEffect(() => {
    if (router.isReady && router.query.tab === 'sell') setSide('sell');
  }, [router.isReady, router.query.tab]);
  const [boughtTip, setBoughtTip] = useState(false);
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

  // Balance preflight: SOL this buy needs (fees, new accounts, SOL spent) vs the wallet's SOL.
  const solLamports = useSolLamports(wallet.publicKey);
  const rent = useRentPerByte();
  const spendsSol = usingSol || pool.quote.isNativeSol;
  const hasBaseAccount = useHasTokenAccount(side === 'buy' ? wallet.publicKey : null, pool.baseMint);
  const hasQuoteAccount = useHasTokenAccount(usingSol ? wallet.publicKey : null, pool.quote);
  const solIn = side === 'buy' && spendsSol && isValidAmount(amount) ? Math.round(Number(amount) * LAMPORTS_PER_SOL) : 0;
  const buyNeed =
    side === 'buy' && rent.data != null && hasBaseAccount.data !== undefined && (!usingSol || hasQuoteAccount.data !== undefined)
      ? buyCostLamports({ perByte: rent.data, solIn, needsBaseAccount: !hasBaseAccount.data, spendsSol, payWithSol: usingSol, needsQuoteAccount: usingSol && hasQuoteAccount.data === false })
      : null;
  const solShort = !!wallet.publicKey && side === 'buy' && buyNeed != null && solLamports.data != null && solLamports.data < buyNeed;

  const [txError, setTxError] = useState<FriendlyError | null>(null);
  const noteRef = useRef<string | undefined>(undefined);
  useEffect(() => setTxError(null), [amount, side, usingSol]);

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

  useEffect(() => {
    if (preview.error) console.error('[hatch] quote failed:', preview.error);
  }, [preview.error]);
  const { data: hc } = usePresetConfigs();

  if (pool.isMigrated) return null; // the page shows "Trade on Meteora" instead
  // Not a Hatch launch: no trading here. Link coins (their own config, see /link) are Hatch launches too.
  if (pool.presetId === null && !(hc && isLinkConfig(hc, pool.configKey))) return null;

  const maxAmount = () => {
    if (!inBalance) return null;
    const max = side === 'buy' && (usingSol || pool.quote.isNativeSol) ? inBalance.minus(SOL_FEE_BUFFER) : inBalance;
    return max.gt(0) ? max.toFixed() : '0'; // toFixed: never exponent notation in the input
  };

  const done = async (sig: string, out: string | null) => {
    const view = { label: `View on ${EXPLORER_NAME}`, href: explorerTxUrl(sig) };
    if (side === 'buy') setBoughtTip(true);
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
    // If step 2 fails, the swapped tokens are already in the wallet: say so with the error.
    noteRef.current = `Your ${quoteSymbol} from step 1 is in your wallet; turn off "Pay with SOL" to buy with it.`;
    return done(await signAndSendVersioned(wallet, connection, await plan.step2()), out);
  };

  const submit = async () => {
    if (!wallet.publicKey) return setShowModal(true);
    if (!isValidAmount(amount)) return notify.error('Enter an amount');
    if (inBalance && inBalance.lt(amount)) return notify.error(`Not enough ${inSymbol}`);
    const out = preview.data ? formatAmount(preview.data.out) : null;
    setTxError(null);
    noteRef.current = undefined;
    setSubmitting(true);
    try {
      if (usingSol) await submitWithSol(out);
      else {
        const connection = getConnection();
        const { tx } = await buildSwap({ connection, owner: wallet.publicKey, pool: pool.address, side, amountUi: amount, slippageBps });
        await done(await signAndSend(wallet, connection, tx), out);
      }
    } catch (e) {
      const f = reportTxError(e, { balanceLamports: solLamports.data, neededLamports: buyNeed, symbol: inSymbol, note: noteRef.current }, side);
      setTxError(f);
      notify.error({ title: "Transaction didn't go through", body: f.message, action: { label: 'Try again', onClick: () => void submit() } });
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
          {fee?.decaying ? (
            <span className="text-success" title={SNIPER_SHIELD_LINE}>
              {formatFeePercent(fee.percent)} now · {formatFeePercent(fee.shield!.end)} in {fee.secondsLeft}s
            </span>
          ) : (
            formatFeePercent(fee?.percent ?? 1)
          )}
        </DefRow>
        {fee && (
          <p className="text-xs text-ink-muted">
            {feeSentence({
              shield: !!fee.shield,
              start: fee.shield ? formatFeePercent(fee.shield.start) : undefined,
              end: fee.shield ? formatFeePercent(fee.shield.end) : undefined,
              creatorPct: pool.creatorFeePct,
            })}
          </p>
        )}
        {preview.error ? <TxErrorNote error={friendlyTxError(preview.error, { symbol: inSymbol })} /> : null}
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
      {solShort && <SolShortNote need={formatSolNeed(buyNeed!)} have={formatSol(solLamports.data!)} />}
      <Button size="lg" block glow onClick={submit} loading={submitting} disabled={solShort} className="h-[60px] text-lg">
        {!wallet.publicKey ? 'Connect wallet' : submitting ? 'Working…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${baseSymbol}`}
      </Button>
      <TxErrorNote error={txError} onDismiss={() => setTxError(null)} />
      {boughtTip && (
        <div role="note" className="flex items-start gap-2.5 rounded-[14px] border border-success/35 bg-success/[0.07] px-3.5 py-3">
          <span className="min-w-0 flex-1 text-[13px] leading-normal text-ink-2">
            Find it anytime in{' '}
            <Link href="/my-hatches?view=holdings" className="font-semibold text-ink-accent underline-offset-4 hover:underline">
              My Hatches → Holdings
            </Link>
            . In Phantom, new tokens may sit under hidden tokens.
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => setBoughtTip(false)} className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink">
            ×
          </button>
        </div>
      )}
      <OpenInWallet />
    </Card>
  );
}
