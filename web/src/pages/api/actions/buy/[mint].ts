// Solana Action (Blink) to buy a Hatch token with SOL.
//   GET:  metadata (icon, title, description, 0.01 / 0.05 / 0.1 SOL buttons + a custom amount, max 1 SOL)
//   POST: { account } -> an UNSIGNED v0 transaction for that wallet to sign: the DBC buy for SOL-quoted pools,
//         Pay with SOL (Jupiter SOL -> quote token + DBC buy in one transaction) for stock pools. Both carry
//         min-out slippage protection. The server never signs and never sends.
// Only mints whose pool sits under one of Hatch's configs. Errors never include RPC URLs or upstream text.
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { ActionPostRequest, ActionPostResponse } from '@solana/actions';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { serverRpcUrl } from '@/lib/config/network';
import { cachedMintInfo, fetchHatchPoolByMint, type HatchPool } from '@/lib/dbc/pool';
import { LAMPORTS_PER_SOL, buyCostLamports, formatSol, formatSolNeed, perByteFromRent0 } from '@/lib/costs';
import { buildSwap } from '@/lib/dbc/transactions';
import { buildPayWithSol, quotePayWithSol } from '@/lib/dbc/payWithSol';
import { JupiterBusyError } from '@/lib/jupiter';
import { UserError } from '@/lib/txErrors';
import { stockForConfig } from '@/lib/presets';
import { BLINK_SLIPPAGE_BPS, actionError, actionHeaders, blinkMetadata, parseBlinkSol } from '@/lib/server/actions';
import { allHatchPools } from '@/lib/server/pools';
import { loadHatchConfigs } from '@/lib/server/presets';
import { rateLimited } from '@/lib/server/rateLimit';
import { getTokenCard } from '@/lib/server/tokenCard';

const SITE_ORIGIN = process.env.HATCH_SITE_ORIGIN || '';

/** Absolute origin for hrefs and icons: the production site, or this dev server. */
function originOf(req: NextApiRequest) {
  if (SITE_ORIGIN) return SITE_ORIGIN;
  const host = String(req.headers.host ?? '');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : 'https://hatchfun.vercel.app';
}

/** The token's Hatch pool (shared 30 s list, else a direct read). null: no pool or not under a Hatch config. */
async function hatchPoolForMint(mint: string, fresh = false): Promise<HatchPool | null> {
  if (!fresh) {
    const listed = (await allHatchPools().catch((): null => null))?.value.find((p) => p.baseMint === mint);
    if (listed) return listed;
  }
  const pool = await fetchHatchPoolByMint(new Connection(serverRpcUrl(), 'confirmed'), mint, loadHatchConfigs());
  return pool && pool.presetId !== null ? pool : null;
}

const send = (res: NextApiResponse, status: number, body: object) => res.status(status).json(body);

let rent0: Promise<number> | null = null;
/**
 * The token page's SOL preflight, server-side: amount + fees + rent for any token account the buy creates
 * (base token, temporary wSOL, and the xStock account for Pay with SOL). One batched account read.
 * Returns a friendly message when the wallet is short, else null.
 */
async function solShortMessage(connection: Connection, owner: PublicKey, pool: HatchPool, solUi: string): Promise<string | null> {
  const payWithSol = !pool.quote.isNativeSol;
  const base = await cachedMintInfo(connection, pool.baseMint);
  const baseAta = getAssociatedTokenAddressSync(new PublicKey(pool.baseMint), owner, true, new PublicKey(base.programId));
  const quoteAta = payWithSol ? getAssociatedTokenAddressSync(new PublicKey(pool.quote.address), owner, true, new PublicKey(pool.quote.programId)) : null;
  rent0 ??= connection.getMinimumBalanceForRentExemption(0).catch((e) => {
    rent0 = null;
    throw e;
  });
  const [infos, r0] = await Promise.all([connection.getMultipleAccountsInfo([owner, baseAta, ...(quoteAta ? [quoteAta] : [])]), rent0]);
  const need = buyCostLamports({
    perByte: perByteFromRent0(r0),
    solIn: Math.round(Number(solUi) * LAMPORTS_PER_SOL),
    needsBaseAccount: !infos[1],
    spendsSol: true,
    payWithSol,
    needsQuoteAccount: payWithSol && !infos[2],
  });
  const have = infos[0]?.lamports ?? 0;
  return have < need ? `You need about ${formatSolNeed(need)} SOL for this buy (amount, network fee and token account rent). This wallet has ${formatSol(have)} SOL.` : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  for (const [k, v] of Object.entries(actionHeaders())) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, actionError('Method not allowed'));

  let mint: string;
  try {
    mint = new PublicKey(String(req.query.mint ?? '')).toBase58();
  } catch {
    return send(res, 400, actionError('Invalid token address'));
  }
  return req.method === 'GET' ? get(req, res, mint) : post(req, res, mint);
}

async function get(req: NextApiRequest, res: NextApiResponse, mint: string) {
  if (rateLimited(req, res, 'actions-get', 120, 60_000, 1, actionError)) return;
  try {
    const pool = await hatchPoolForMint(mint);
    if (!pool) return send(res, 404, actionError('This token was not launched on Hatch'));
    const card = await getTokenCard(mint);
    const origin = originOf(req);
    const stock = pool.presetId === 'STOCK' ? stockForConfig(loadHatchConfigs(), pool.configKey) : null;
    const image = card?.image ?? null;
    const icon = image && /^https:\/\//.test(image) ? image : `${origin}/api/og/${mint}`;
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return send(
      res,
      200,
      blinkMetadata(
        {
          mint,
          name: card?.name || 'Hatch token',
          symbol: card?.symbol || '',
          icon,
          stockName: stock?.name ?? null,
          progressPct: pool.progress * 100,
          hatched: pool.isMigrated,
          dammV2Pool: pool.dammV2Pool,
        },
        origin
      )
    );
  } catch (e) {
    console.warn('actions GET failed:', e instanceof Error ? e.message : e);
    return send(res, 502, actionError('Could not load this token right now. Try again in a moment.'));
  }
}

async function post(req: NextApiRequest, res: NextApiResponse, mint: string) {
  if (rateLimited(req, res, 'actions-post', 30, 60_000, 1, actionError)) return;
  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) as Partial<ActionPostRequest> | null;
  let owner: PublicKey;
  try {
    owner = new PublicKey(String(body?.account ?? ''));
    if (!PublicKey.isOnCurve(owner.toBytes())) throw new Error('off curve');
  } catch {
    return send(res, 400, actionError('Invalid wallet account'));
  }
  let solUi: string;
  try {
    solUi = parseBlinkSol(req.query.amount ?? (body?.data as Record<string, unknown> | undefined)?.amount);
  } catch (e) {
    return send(res, 400, actionError((e as Error).message));
  }
  try {
    // Fresh pool read for a transaction (the list may be 30 s old: graduation, reserves).
    const pool = await hatchPoolForMint(mint, true);
    if (!pool) return send(res, 404, actionError('This token was not launched on Hatch'));
    if (pool.isMigrated) return send(res, 400, actionError('Graduated: this token now trades on Meteora'));
    const connection = new Connection(serverRpcUrl(), 'confirmed');
    const short = await solShortMessage(connection, owner, pool, solUi);
    if (short) return send(res, 400, actionError(short));
    let tx: VersionedTransaction;
    if (pool.quote.isNativeSol) {
      const { tx: legacy } = await buildSwap({ connection, owner, pool: pool.address, side: 'buy', amountUi: solUi, slippageBps: BLINK_SLIPPAGE_BPS });
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx = new VersionedTransaction(new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: legacy.instructions }).compileToV0Message());
    } else {
      const q = await quotePayWithSol({ connection, pool: pool.address, solUi, slippageBps: BLINK_SLIPPAGE_BPS });
      const plan = await buildPayWithSol(connection, owner, q);
      if (plan.kind !== 'single') {
        return send(res, 400, actionError(`This route is too large for one transaction right now. Buy on hatchfun.vercel.app/token/${mint}`));
      }
      tx = plan.tx;
    }
    // Serialized unsigned (no createPostResponse: it would auto-sign with an ACTION_IDENTITY_SECRET if one were ever set).
    const response: ActionPostResponse = {
      type: 'transaction',
      transaction: Buffer.from(tx.serialize()).toString('base64'),
      message: `Buying with ${solUi} SOL. Your wallet shows the tokens you get before you sign.`,
    };
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, response);
  } catch (e) {
    if (e instanceof UserError || e instanceof JupiterBusyError) return send(res, 400, actionError(e.message));
    console.warn('actions POST failed:', e instanceof Error ? e.message : e);
    return send(res, 502, actionError('Could not build the buy right now. Try again in a moment.'));
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
