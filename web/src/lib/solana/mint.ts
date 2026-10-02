// Mint info that works for SPL Token and Token-2022, including the Token-2022
// scaledUiAmount extension (UI amount = raw amount / 10^decimals * multiplier).
import { Connection, PublicKey } from '@solana/web3.js';
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getScaledUiAmountConfig,
  unpackMint,
} from '@solana/spl-token';
import BN from 'bn.js';
import Decimal from 'decimal.js';

export type MintInfo = {
  address: string;
  programId: string;
  isToken2022: boolean;
  isNativeSol: boolean;
  decimals: number;
  /** Effective scaledUiAmount multiplier (1 when the extension is absent). */
  multiplier: number;
};

export async function fetchMintInfo(connection: Connection, mint: PublicKey | string): Promise<MintInfo> {
  const pk = new PublicKey(mint);
  const account = await connection.getAccountInfo(pk, 'confirmed');
  if (!account) throw new Error(`Mint ${pk.toBase58()} not found`);
  const programId = account.owner;
  if (!programId.equals(TOKEN_PROGRAM_ID) && !programId.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`${pk.toBase58()} is not a token mint`);
  }
  const parsed = unpackMint(pk, account, programId);
  let multiplier = 1;
  if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
    const scaled = getScaledUiAmountConfig(parsed);
    if (scaled) {
      const now = BigInt(Math.floor(Date.now() / 1000));
      multiplier = now >= scaled.newMultiplierEffectiveTimestamp ? scaled.newMultiplier : scaled.multiplier;
    }
  }
  return {
    address: pk.toBase58(),
    programId: programId.toBase58(),
    isToken2022: programId.equals(TOKEN_2022_PROGRAM_ID),
    isNativeSol: pk.equals(NATIVE_MINT),
    decimals: parsed.decimals,
    multiplier,
  };
}

/** Raw base units -> UI amount (Decimal), applying the scaled multiplier. */
export function rawToUi(raw: BN | bigint | string | number, info: Pick<MintInfo, 'decimals' | 'multiplier'>) {
  return new Decimal(raw.toString()).div(new Decimal(10).pow(info.decimals)).mul(info.multiplier);
}

/** UI amount -> raw base units (floored), reversing the scaled multiplier. */
export function uiToRaw(ui: string | number, info: Pick<MintInfo, 'decimals' | 'multiplier'>): BN {
  const d = new Decimal(ui).div(info.multiplier).mul(new Decimal(10).pow(info.decimals)).floor();
  if (d.isNeg() || !d.isFinite()) throw new Error('Invalid amount');
  return new BN(d.toFixed(0));
}

/** Wallet balance of a mint in raw units. Native SOL returns lamports. */
export async function fetchRawBalance(connection: Connection, owner: PublicKey, info: MintInfo): Promise<BN> {
  if (info.isNativeSol) return new BN(await connection.getBalance(owner, 'confirmed'));
  const ata = getAssociatedTokenAddressSync(
    new PublicKey(info.address),
    owner,
    true,
    new PublicKey(info.programId)
  );
  try {
    const bal = await connection.getTokenAccountBalance(ata, 'confirmed');
    return new BN(bal.value.amount);
  } catch {
    return new BN(0); // no token account yet
  }
}
