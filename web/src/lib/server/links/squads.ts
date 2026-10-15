// Server-only: the Hatch link vault (Squads v4) for claims and disowns.
// The SERVER member key can only Initiate and Execute: it creates ONE vault transaction + proposal per claim and,
// once a human approver has voted, executes it. It never votes (no code path here calls proposalApprove/Reject).
// Hatch pays every fee and every account's rent (the server key is the fee payer); the owner pays nothing.
//
// The vault transaction (all signed by the vault PDA through Squads):
//   1. claimCreatorTradingFee: every creator fee accrued so far -> the vault's WSOL account (cap = u64 max, so fees
//      that accrue between proposal and execution are included)
//   2. closeAccount(vault WSOL account -> destination): the fees arrive as plain SOL (plus that account's rent)
//   3. transferPoolCreator: vault -> destination (future fees are theirs to claim)
//   4. graduated pools only: transferChecked of the creator's locked position NFT -> destination
// Refused while the curve is complete but the pool has not migrated yet (DBC error 6022 would fail the handover).
import BN from 'bn.js';
import * as multisig from '@sqds/multisig';
import { Connection, Keypair, PublicKey, Transaction, TransactionMessage, type TransactionInstruction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DynamicBondingCurveClient, deriveDammV2PoolAddress, DAMM_V2_MIGRATION_FEE_ADDRESS } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { addPriorityFee } from '@/lib/solana/priorityFee';

export const U64_MAX = new BN('18446744073709551615');
export const VAULT_INDEX = 0;

export type VaultEnv = { multisigPda: PublicKey; vaultPda: PublicKey; approver: PublicKey; server: Keypair };

/** The devnet vault from env (LINK_SQUADS_MULTISIG, LINK_APPROVER, LINK_SQUADS_SERVER_KEY). Never logs the key. */
export function vaultEnv(): VaultEnv {
  const ms = process.env.LINK_SQUADS_MULTISIG?.trim();
  const approver = process.env.LINK_APPROVER?.trim();
  const rawKey = process.env.LINK_SQUADS_SERVER_KEY?.trim();
  if (!ms || !approver || !rawKey) throw new Error('LINK_SQUADS_MULTISIG / LINK_APPROVER / LINK_SQUADS_SERVER_KEY are not set');
  let server: Keypair;
  try {
    server = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(rawKey) as number[]));
  } catch {
    throw new Error('LINK_SQUADS_SERVER_KEY is not a keypair JSON array');
  }
  const multisigPda = new PublicKey(ms);
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: VAULT_INDEX });
  return { multisigPda, vaultPda, approver: new PublicKey(approver), server };
}

export const isVaultConfigured = () => {
  try {
    vaultEnv();
    return true;
  } catch {
    return false;
  }
};

const dbc = (c: Connection) => new DynamicBondingCurveClient(c, 'confirmed');

export type PoolPhase = 'curve' | 'gap' | 'migrated';
/** curve: trading on the bonding curve; gap: curve complete, not migrated yet; migrated: on DAMM v2. */
export function poolPhase(s: { isMigrated: number; quoteReserve: BN }, threshold: BN): PoolPhase {
  if (s.isMigrated === 1) return 'migrated';
  return s.quoteReserve.gte(threshold) ? 'gap' : 'curve';
}

export class GapError extends Error {
  constructor() {
    super('This coin is moving to its new pool, try again in a few minutes');
  }
}

/** The vault's handover instructions for one pool (see the header). Pure apart from reads. */
export async function handoverInstructions(
  connection: Connection,
  p: { pool: PublicKey; vaultPda: PublicKey; destination: PublicKey; payer: PublicKey }
): Promise<{ instructions: TransactionInstruction[]; setup: TransactionInstruction[]; heldLamports: bigint; phase: PoolPhase; positionNft: PublicKey | null }> {
  const client = dbc(connection);
  const vp = await client.state.getPool(p.pool);
  if (!vp) throw new Error('pool not found on chain');
  const s = vp.poolState;
  const config = await client.state.getPoolConfig(s.config);
  if (!config) throw new Error('pool config not found');
  if (!s.creator.equals(p.vaultPda)) throw new Error('the Hatch vault is not this pool’s creator');
  if (!config.quoteMint.equals(NATIVE_MINT)) throw new Error('link coins are SOL-quoted');
  const phase = poolPhase(s, config.migrationQuoteThreshold);
  if (phase === 'gap') throw new GapError();

  const baseProgram = config.tokenType === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const vaultBase = getAssociatedTokenAddressSync(s.baseMint, p.vaultPda, true, baseProgram);
  const vaultWsol = getAssociatedTokenAddressSync(NATIVE_MINT, p.vaultPda, true, TOKEN_PROGRAM_ID);
  // Created by Hatch (`payer`) before the proposal: the vault PDA holds no SOL to pay rent itself.
  const setup = [
    createAssociatedTokenAccountIdempotentInstruction(p.payer, vaultBase, p.vaultPda, s.baseMint, baseProgram),
    createAssociatedTokenAccountIdempotentInstruction(p.payer, vaultWsol, p.vaultPda, NATIVE_MINT, TOKEN_PROGRAM_ID),
  ];

  const program = (client.creator as unknown as {
    program: { methods: { claimCreatorTradingFee(a: BN, b: BN): { accountsPartial(x: object): { instruction(): Promise<TransactionInstruction> } } } };
  }).program;
  const claimIx = await program.methods
    .claimCreatorTradingFee(U64_MAX, U64_MAX)
    .accountsPartial({
      poolAuthority: (client.creator as unknown as { poolAuthority: PublicKey }).poolAuthority,
      pool: p.pool,
      tokenAAccount: vaultBase,
      tokenBAccount: vaultWsol,
      baseVault: s.baseVault,
      quoteVault: s.quoteVault,
      baseMint: s.baseMint,
      quoteMint: config.quoteMint,
      creator: p.vaultPda,
      tokenBaseProgram: baseProgram,
      tokenQuoteProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  const closeIx = createCloseAccountInstruction(vaultWsol, p.destination, p.vaultPda, [], TOKEN_PROGRAM_ID);
  const transferIx = (await client.creator.transferPoolCreator({ pool: p.pool, creator: p.vaultPda, newCreator: p.destination })).instructions[0]!;

  const instructions = [claimIx, closeIx, transferIx];
  const extraSetup: TransactionInstruction[] = [];
  let positionNft: PublicKey | null = null;
  if (phase === 'migrated') {
    positionNft = await creatorPositionNft(connection, { baseMint: s.baseMint, quoteMint: config.quoteMint, migrationFeeOption: config.migrationFeeOption, vaultPda: p.vaultPda });
    if (positionNft) {
      const destAta = getAssociatedTokenAddressSync(positionNft, p.destination, true, TOKEN_2022_PROGRAM_ID);
      extraSetup.push(createAssociatedTokenAccountIdempotentInstruction(p.payer, destAta, p.destination, positionNft, TOKEN_2022_PROGRAM_ID));
      const vaultNftAta = getAssociatedTokenAddressSync(positionNft, p.vaultPda, true, TOKEN_2022_PROGRAM_ID);
      instructions.push(createTransferCheckedInstruction(vaultNftAta, positionNft, destAta, p.vaultPda, 1, 0, [], TOKEN_2022_PROGRAM_ID));
    }
  }
  return {
    instructions,
    setup: [...setup, ...extraSetup],
    heldLamports: BigInt(s.creatorQuoteFee.toString()),
    phase,
    positionNft,
  };
}

/** The creator's locked DAMM v2 position NFT held by the vault (the NFT whose token account the vault owns). */
async function creatorPositionNft(connection: Connection, p: { baseMint: PublicKey; quoteMint: PublicKey; migrationFeeOption: number; vaultPda: PublicKey }): Promise<PublicKey | null> {
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[p.migrationFeeOption];
  if (!dammConfig) return null;
  const accounts = await connection.getParsedTokenAccountsByOwner(p.vaultPda, { programId: TOKEN_2022_PROGRAM_ID });
  // Position NFTs: decimals 0, amount 1. The vault holds one per graduated link coin; match by the position's pool.
  const { CpAmm, derivePositionAddress } = await import('@meteora-ag/cp-amm-sdk');
  const cp = new CpAmm(connection);
  const dammPool = deriveDammV2PoolAddress(dammConfig, p.baseMint, p.quoteMint);
  for (const a of accounts.value) {
    const info = (a.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } } }).parsed?.info;
    if (!info?.mint || info.tokenAmount?.amount !== '1' || info.tokenAmount.decimals !== 0) continue;
    const nft = new PublicKey(info.mint);
    const pos = await cp.fetchPositionState(derivePositionAddress(nft)).catch((): null => null);
    if (pos && (pos as { pool: PublicKey }).pool.equals(dammPool)) return nft;
  }
  return null;
}

/** Sends a server-signed transaction (server = fee payer), confirmed. */
async function sendAsServer(connection: Connection, server: Keypair, ixs: TransactionInstruction[], cu = 200_000): Promise<string> {
  const tx = new Transaction().add(...ixs);
  addPriorityFee(tx, cu);
  const bh = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = server.publicKey;
  tx.recentBlockhash = bh.blockhash;
  tx.sign(server);
  const sig = await connection.sendRawTransaction(tx.serialize());
  const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (res.value.err) throw new Error(`transaction failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

export type Proposed = { transactionIndex: bigint; proposal: PublicKey; signatures: string[]; heldLamports: bigint; phase: PoolPhase };

/**
 * SERVER: one vault transaction + its proposal for this handover. Setup accounts are created first (Hatch pays).
 * Index collisions (two proposals racing) are retried with the next index.
 */
export async function proposeHandover(connection: Connection, v: VaultEnv, p: { pool: PublicKey; destination: PublicKey; memo: string }): Promise<Proposed> {
  const built = await handoverInstructions(connection, { pool: p.pool, vaultPda: v.vaultPda, destination: p.destination, payer: v.server.publicKey });
  const signatures: string[] = [await sendAsServer(connection, v.server, built.setup, 120_000)];
  for (let attempt = 0; attempt < 3; attempt++) {
    const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, v.multisigPda);
    const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
    const message = new TransactionMessage({ payerKey: v.vaultPda, recentBlockhash: (await connection.getLatestBlockhash()).blockhash, instructions: built.instructions });
    try {
      const create = multisig.instructions.vaultTransactionCreate({ multisigPda: v.multisigPda, transactionIndex, creator: v.server.publicKey, rentPayer: v.server.publicKey, vaultIndex: VAULT_INDEX, ephemeralSigners: 0, transactionMessage: message, memo: p.memo.slice(0, 100) });
      const proposal = multisig.instructions.proposalCreate({ multisigPda: v.multisigPda, transactionIndex, creator: v.server.publicKey, rentPayer: v.server.publicKey });
      signatures.push(await sendAsServer(connection, v.server, [create, proposal], 300_000));
      const [proposalPda] = multisig.getProposalPda({ multisigPda: v.multisigPda, transactionIndex });
      return { transactionIndex, proposal: proposalPda, signatures, heldLamports: built.heldLamports, phase: built.phase };
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new Error('unreachable');
}

export type ProposalState = 'none' | 'Draft' | 'Active' | 'Rejected' | 'Approved' | 'Executing' | 'Executed' | 'Cancelled';
export async function proposalState(connection: Connection, v: VaultEnv, transactionIndex: bigint): Promise<{ state: ProposalState; approved: string[]; rejected: string[] }> {
  const [pda] = multisig.getProposalPda({ multisigPda: v.multisigPda, transactionIndex });
  const p = await multisig.accounts.Proposal.fromAccountAddress(connection, pda).catch((): null => null);
  if (!p) return { state: 'none', approved: [], rejected: [] };
  return { state: p.status.__kind as ProposalState, approved: p.approved.map((k) => k.toBase58()), rejected: p.rejected.map((k) => k.toBase58()) };
}

/** SERVER: execute an approved proposal. */
export async function executeHandover(connection: Connection, v: VaultEnv, transactionIndex: bigint): Promise<string> {
  const { instruction, lookupTableAccounts } = await multisig.instructions.vaultTransactionExecute({ connection, multisigPda: v.multisigPda, transactionIndex, member: v.server.publicKey });
  if (lookupTableAccounts.length) throw new Error('unexpected lookup tables');
  return sendAsServer(connection, v.server, [instruction], 600_000);
}

/** The approver's vote (built for their wallet to sign; the server never signs it). */
export function approveInstruction(v: Pick<VaultEnv, 'multisigPda'>, member: PublicKey, transactionIndex: bigint) {
  return multisig.instructions.proposalApprove({ multisigPda: v.multisigPda, transactionIndex, member });
}
export function rejectInstruction(v: Pick<VaultEnv, 'multisigPda'>, member: PublicKey, transactionIndex: bigint) {
  return multisig.instructions.proposalReject({ multisigPda: v.multisigPda, transactionIndex, member });
}

/** The instructions a vault transaction will run (for verifying a proposal's contents). */
export async function vaultTransactionInstructions(connection: Connection, v: VaultEnv, transactionIndex: bigint) {
  const [pda] = multisig.getTransactionPda({ multisigPda: v.multisigPda, index: transactionIndex });
  const t = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, pda);
  const keys = t.message.accountKeys;
  return t.message.instructions.map((ix) => ({ programId: keys[ix.programIdIndex]!, accounts: Array.from(ix.accountIndexes).map((i) => keys[i]!), data: Buffer.from(ix.data) }));
}
