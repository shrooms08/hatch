// Server-only: link coins on chain.
// One transaction per hatch: a fresh ONE-TIME keypair is the pool creator that creates the DBC pool under the
// LINK config, the hatcher pays (rent + fees) and makes the first buy, and the same transaction transfers the
// pool creator role to the Hatch Squads vault PDA. The server partially signs with the one-time key and the
// base-mint key, then drops both: neither has any lasting power (the creator role already moved to the vault,
// and the mint's authorities belong to the pool). The server never sends.
import BN from 'bn.js';
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NETWORK } from '@/lib/config/network';
import { addPriorityFee } from '@/lib/solana/priorityFee';
import { loadHatchConfigs } from '@/lib/server/presets';
import { isSupabaseConfigured } from '@/lib/server/supabase';
import type { LinkNetwork } from './store';

export const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
/** Most a hatcher may spend on the first buy, in SOL. LINK_MAX_FIRST_BUY_SOL overrides (0 < x <= 100). */
export const LINK_MAX_FIRST_BUY_SOL = 1;
export function maxFirstBuySol(): number {
  const v = Number(process.env.LINK_MAX_FIRST_BUY_SOL);
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : LINK_MAX_FIRST_BUY_SOL;
}
export const maxFirstBuyLamports = () => Math.round(maxFirstBuySol() * 1e9);
const CU_LIMIT = 300_000;

/** The network link coins run on here, or null when they are off. P2: devnet only. */
export function linkNetwork(): LinkNetwork | null {
  if (NETWORK !== 'devnet') return null;
  if (!loadHatchConfigs().link || !isSupabaseConfigured()) return null;
  return 'devnet';
}

export function linkKeys(): { config: PublicKey; vault: PublicKey } {
  const link = loadHatchConfigs().link;
  if (!link) throw new Error('LINK_CONFIG / LINK_VAULT are not set');
  return { config: new PublicKey(link.config), vault: new PublicKey(link.vault) };
}

const dbc = (connection: Connection) => new DynamicBondingCurveClient(connection, 'confirmed');

let configChecked: Promise<void> | null = null;
/**
 * Once per server: the on-chain LINK config must be the LINK-v1 spec where it matters for owners (SOL quote,
 * fees in the quote token, 50/50 trading fees, liquidity 100% permanently locked, DAMM v2).
 */
export function assertLinkConfig(connection: Connection, config: PublicKey): Promise<void> {
  configChecked ??= (async () => {
    const c = await dbc(connection).state.getPoolConfig(config);
    const bad: string[] = [];
    if (!c) bad.push('config account not found');
    else {
      if (!c.quoteMint.equals(WSOL)) bad.push('quote is not SOL');
      if (c.collectFeeMode !== 0) bad.push('fees not collected in the quote token');
      if (c.creatorTradingFeePercentage !== 50) bad.push('creator trading fee share is not 50%');
      if (c.creatorLiquidityPercentage !== 0 || c.partnerLiquidityPercentage !== 0) bad.push('some liquidity is withdrawable');
      if (c.creatorPermanentLockedLiquidityPercentage !== 50 || c.partnerPermanentLockedLiquidityPercentage !== 50) bad.push('liquidity is not 50/50 permanently locked');
      if (c.migrationOption !== 1) bad.push('does not migrate to DAMM v2');
      // The hatcher's buy in the creation transaction pays the minimum fee, not the sniper shield.
      if ((c as unknown as { enableFirstSwapWithMinFee?: number }).enableFirstSwapWithMinFee !== 1) bad.push('first swap with min fee is off');
    }
    if (bad.length) throw new Error(`LINK_CONFIG does not match LINK-v1: ${bad.join(', ')}`);
  })().catch((e) => {
    configChecked = null;
    throw e;
  });
  return configChecked;
}

export type BuiltHatch = { transaction: string; mint: string; pool: string; lastValidBlockHeight: number };

export async function buildLinkHatchTx(p: {
  connection: Connection;
  config: PublicKey;
  vault: PublicKey;
  payer: PublicKey;
  baseMint: Keypair;
  name: string;
  symbol: string;
  uri: string;
  firstBuyLamports: number;
}): Promise<BuiltHatch> {
  const client = dbc(p.connection);
  const oneTime = Keypair.generate(); // the pool creator for the length of one instruction
  const pool = deriveDbcPoolAddress(WSOL, p.baseMint.publicKey, p.config);
  const createPoolParam = { name: p.name, symbol: p.symbol, uri: p.uri, payer: p.payer, poolCreator: oneTime.publicKey, config: p.config, baseMint: p.baseMint.publicKey };
  const tx =
    p.firstBuyLamports > 0
      ? await client.creator.createPoolWithFirstBuy({
          createPoolParam,
          // Created and bought in the same transaction: nobody can trade in between, so no price risk.
          firstBuyParam: { buyer: p.payer, buyAmount: new BN(p.firstBuyLamports), minimumAmountOut: new BN(1), referralTokenAccount: null },
        })
      : await client.creator.createPool(createPoolParam);
  // The pool does not exist yet, so the SDK's transferPoolCreator helper (which reads it) cannot build this.
  const program = (client.creator as unknown as { program: { methods: { transferPoolCreator(): { accountsPartial(a: object): { instruction(): Promise<TransactionInstruction> } } } } }).program;
  tx.add(await program.methods.transferPoolCreator().accountsPartial({ virtualPool: pool, newCreator: p.vault, config: p.config, creator: oneTime.publicKey }).instruction());
  addPriorityFee(tx, CU_LIMIT);
  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.feePayer = p.payer;
  tx.recentBlockhash = blockhash;
  tx.partialSign(oneTime, p.baseMint);
  return {
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    mint: p.baseMint.publicKey.toBase58(),
    pool: pool.toBase58(),
    lastValidBlockHeight,
  };
}

export type PoolCheck = { exists: boolean; ok: boolean; reason?: string; progress?: number };

/** The link configs pools may sit under: the current one and earlier ones (their coins keep working). */
export function linkConfigKeys(): string[] {
  const link = loadHatchConfigs().link;
  return link ? [link.config, ...(link.legacyConfigs ?? [])] : [];
}

/**
 * The pool for a link: under `config` (the config recorded when it was hatched, which must be one of ours), for this
 * mint, and its creator is the vault (or, once claimed, the owner).
 */
export async function checkLinkPool(connection: Connection, p: { pool: string; mint: string; config: PublicKey; vault: PublicKey; claimedWallet?: string | null }): Promise<PoolCheck> {
  if (!linkConfigKeys().includes(p.config.toBase58())) return { exists: false, ok: false, reason: 'not a link config' };
  const client = dbc(connection);
  const vp = await client.state.getPool(new PublicKey(p.pool)).catch((): null => null);
  if (!vp) return { exists: false, ok: false, reason: 'pool not found on chain' };
  const s = vp.poolState;
  if (!s.config.equals(p.config)) return { exists: true, ok: false, reason: 'pool is not under the LINK config' };
  if (s.baseMint.toBase58() !== p.mint) return { exists: true, ok: false, reason: 'pool is for another mint' };
  const creatorOk = s.creator.equals(p.vault) || (!!p.claimedWallet && s.creator.toBase58() === p.claimedWallet);
  if (!creatorOk) return { exists: true, ok: false, reason: 'pool creator is not the Hatch vault' };
  const cfg = await client.state.getPoolConfig(s.config);
  const progress = cfg && !cfg.migrationQuoteThreshold.isZero() ? Math.min(1, Number(s.quoteReserve.toString()) / Number(cfg.migrationQuoteThreshold.toString())) : 0;
  return { exists: true, ok: true, progress: s.isMigrated === 1 ? 1 : progress };
}
