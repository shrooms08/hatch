// SOL cost estimates for a launch and a buy (network fee, priority fee, rent for new accounts, plus the
// SOL being spent). Sizes come from a real mainnet launch (HGTEST: fee 10,090 + mint 452 B + base vault
// 165 B + pool 424 B + NVDAx quote vault 175 B = 0.00878833 SOL). Rent is read live (one RPC call).
import { PRIORITY_FEE_MICROLAMPORTS } from '@/lib/config/network';

export const LAMPORTS_PER_SOL = 1_000_000_000;
const SIGNATURE_FEE = 5_000;
const RENT_OVERHEAD_BYTES = 128;

export const ACCOUNT_SIZE = {
  /** Token-2022 base mint without metadata; the metadata adds name + symbol + uri bytes. */
  mintBase: 318,
  /** R2 metadata URL: https://<bucket>.r2.dev/metadata/<mint>.json */
  metadataUri: 110,
  pool: 424,
  /** SPL / Token-2022 token account (vaults, wSOL). */
  tokenAccount: 165,
  /** Token-2022 ATA with the immutable-owner extension (the base token). */
  token2022Ata: 170,
  /** xStock token account (Token-2022 with its extensions). */
  xstockAccount: 175,
} as const;

/** Compute-unit limits the transactions set (lib/dbc/transactions, lib/server/createPool, payWithSol). */
export const CU_LIMIT = { launch: 400_000, swap: 400_000, payWithSol: 700_000 } as const;

/** Rent-exempt minimum for `bytes`, from the lamports-per-byte the cluster reports (rent(0) / 128). */
export const rentFor = (perByte: number, bytes: number) => (RENT_OVERHEAD_BYTES + bytes) * perByte;
export const perByteFromRent0 = (rent0: number) => rent0 / RENT_OVERHEAD_BYTES;

const priorityFee = (cuLimit: number) => Math.ceil((PRIORITY_FEE_MICROLAMPORTS * cuLimit) / 1_000_000);

/** A launch: two signatures (wallet + mint), the mint with metadata, pool, two vaults. */
export function launchCostLamports(p: { perByte: number; name: string; symbol: string; stockQuote: boolean }): number {
  const enc = new TextEncoder();
  const mint = ACCOUNT_SIZE.mintBase + enc.encode(p.name).length + enc.encode(p.symbol).length + ACCOUNT_SIZE.metadataUri;
  const rent =
    rentFor(p.perByte, mint) +
    rentFor(p.perByte, ACCOUNT_SIZE.pool) +
    rentFor(p.perByte, ACCOUNT_SIZE.tokenAccount) +
    rentFor(p.perByte, p.stockQuote ? ACCOUNT_SIZE.xstockAccount : ACCOUNT_SIZE.tokenAccount);
  return 2 * SIGNATURE_FEE + priorityFee(CU_LIMIT.launch) + rent;
}

/**
 * A buy. `solIn`: SOL being spent (SOL-quoted pools, or Pay with SOL), in lamports. New accounts: the
 * base token account if the wallet has none, a temporary wSOL account when spending SOL, and for Pay with
 * SOL the xStock account if missing.
 */
export function buyCostLamports(p: { perByte: number; solIn: number; needsBaseAccount: boolean; spendsSol: boolean; payWithSol: boolean; needsQuoteAccount: boolean }): number {
  let rent = 0;
  if (p.needsBaseAccount) rent += rentFor(p.perByte, ACCOUNT_SIZE.token2022Ata);
  if (p.spendsSol) rent += rentFor(p.perByte, ACCOUNT_SIZE.tokenAccount);
  if (p.payWithSol && p.needsQuoteAccount) rent += rentFor(p.perByte, ACCOUNT_SIZE.xstockAccount);
  return p.solIn + SIGNATURE_FEE + priorityFee(p.payWithSol ? CU_LIMIT.payWithSol : CU_LIMIT.swap) + rent;
}

/** "0.0092", "0.0025", "1.2", never exponent notation; small amounts keep 2 significant digits. */
export function formatSol(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  if (sol === 0) return '0';
  const digits = sol >= 1 ? 3 : Math.max(4, 1 - Math.floor(Math.log10(sol)) + 1);
  return Number(sol.toFixed(Math.min(digits, 9))).toString();
}

/** An amount someone needs: rounded UP to 2 significant digits ("0.0098", "0.012", "1.2"). */
export function formatSolNeed(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  if (sol <= 0) return '0';
  const exp = Math.floor(Math.log10(sol)) - 1; // keep 2 significant digits
  const step = Math.pow(10, exp);
  const up = Math.ceil(sol / step - 1e-9) * step;
  return Number(up.toFixed(Math.max(0, -exp))).toString();
}
