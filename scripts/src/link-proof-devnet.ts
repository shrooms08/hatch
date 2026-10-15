// DEVNET PROOF (P1) for "one official coin per link".
//   - No standing key: each launch is signed by a fresh one-time keypair, and the SAME transaction transfers the
//     pool creator role to the Hatch Squads v4 vault PDA. The one-time key is dropped after signing.
//   - The vault (link-squads.ts): SERVER = Initiate + Execute, APPROVER = Vote, BACKUP = Vote, threshold 1.
//   - LINK-v1 config (link-preset.ts): sniper shield, 50/50 trading fees, liquidity 100% permanently locked.
// Devnet only; throwaway test keys in scripts/keys (gitignored), never printed. Every stage needs --live.
//   pnpm link-proof-devnet vault --live      # 1: create the multisig; the server cannot approve, can propose/execute
//   pnpm link-proof-devnet claim --live      # 2-4: launch into the vault, swaps, proposal -> owner, owner claims
//   pnpm link-proof-devnet graduate --live   # 5-6: graduate under the vault, locked positions, hand over role + NFT
import BN from 'bn.js'
import * as multisig from '@sqds/multisig'
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionMessage, type TransactionInstruction } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { CpAmm, derivePositionAddress, derivePositionNftAccount } from '@meteora-ag/cp-amm-sdk'
import { DAMM_V2_MIGRATION_FEE_ADDRESS, SwapMode, deriveDammV2PoolAddress, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DRY_RUN, RPC_URL, WSOL_MINT, accountExists, connection, currentPoint, dbc, execute, hostOf, loadKeypair, loadOrCreateKeypair, runIfMain } from './lib.js'
import { assertLinkV1Spec, linkCurveV1 } from './link-preset.js'
import { VAULT_INDEX, VAULT_THRESHOLD, VAULT_TIME_LOCK, assertVaultSpec, describePermissions, vaultAddresses, vaultMembers } from './link-squads.js'

const STEP = 'link-proof'
const GRADUATE_THRESHOLD_SOL = 0.5 // devnet-sized so test wallets can fill the curve
const sol = (l: BN | number | bigint) => (Number(l.toString()) / 1e9).toFixed(9)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const short = (k: PublicKey) => `${k.toBase58().slice(0, 4)}…`

// ---------- actors ----------
const hatcher = () => loadKeypair('creator') // the person hatching a link: pays and does the first buy; also "Hatch pays the fee" payer
const partnerKp = () => loadKeypair('partner') // devnet partner / config fee claimer; second trader; pays migration
const keys = () => ({
  server: loadOrCreateKeypair('devnet-squads-server').kp,
  approver: loadOrCreateKeypair('devnet-squads-approver').kp, // devnet stand-in for HATCH_APPROVER_PUBKEY
  backup: loadOrCreateKeypair('devnet-squads-backup').kp,
  createKey: loadOrCreateKeypair('devnet-squads-create-key').kp,
})
function vault() {
  const k = keys()
  return { ...k, ...vaultAddresses(k.createKey.publicKey) }
}

async function fund(to: PublicKey, lamports: number, from: Keypair) {
  if ((await connection.getBalance(to)) >= lamports) return
  await execute(STEP, `fund ${short(to)} with ${sol(lamports)} SOL for fees`, new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports })), from)
}

/** Runs a Squads SDK call, confirms it, prints the signature. */
async function sq(label: string, send: () => Promise<string>): Promise<string> {
  const sig = await send()
  const bh = await connection.getLatestBlockhash('confirmed')
  const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
  if (res.value.err) throw new Error(`${label} failed on chain: ${JSON.stringify(res.value.err)}`)
  console.log(`  ✓ ${label}: ${sig}`)
  return sig
}

/** Runs something that must be refused, and prints the exact error. */
async function mustFail(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
    console.log(`  [negative check] ${label}: ACCEPTED (unexpected)`)
  } catch (e) {
    const err = e as { message?: string; logs?: string[]; transactionLogs?: string[] }
    const logs = err.logs ?? err.transactionLogs ?? []
    const line = [...logs].reverse().find((l) => /AnchorError|Error Code|custom program error/.test(l)) ?? ''
    const anchor = logs.find((l) => /Error Code: /.test(l))?.replace(/^.*Error Code: /, 'Error Code: ') ?? ''
    console.log(`  [negative check] ${label}: REJECTED ${(anchor || line || err.message || String(e)).replace(/\s+/g, ' ').slice(0, 230)}`)
  }
}

async function nextIndex(multisigPda: PublicKey): Promise<bigint> {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  return BigInt(ms.transactionIndex.toString()) + 1n
}

/** SERVER proposes a vault transaction (create the transaction + its proposal). */
async function propose(v: ReturnType<typeof vault>, instructions: TransactionInstruction[], what: string): Promise<bigint> {
  const transactionIndex = await nextIndex(v.multisigPda)
  const message = new TransactionMessage({ payerKey: v.vaultPda, recentBlockhash: (await connection.getLatestBlockhash()).blockhash, instructions })
  await sq(`server proposes #${transactionIndex} (${what}): vault transaction`, () =>
    multisig.rpc.vaultTransactionCreate({ connection, feePayer: v.server, multisigPda: v.multisigPda, transactionIndex, creator: v.server.publicKey, vaultIndex: VAULT_INDEX, ephemeralSigners: 0, transactionMessage: message })
  )
  await sq(`server proposes #${transactionIndex}: proposal`, () => multisig.rpc.proposalCreate({ connection, feePayer: v.server, creator: v.server, multisigPda: v.multisigPda, transactionIndex }))
  return transactionIndex
}
const approve = (v: ReturnType<typeof vault>, i: bigint, member: Keypair, who: string) =>
  sq(`${who} approves #${i}`, () => multisig.rpc.proposalApprove({ connection, feePayer: member, member, multisigPda: v.multisigPda, transactionIndex: i }))
const run = (v: ReturnType<typeof vault>, i: bigint) =>
  sq(`server executes #${i}`, () => multisig.rpc.vaultTransactionExecute({ connection, feePayer: v.server, multisigPda: v.multisigPda, transactionIndex: i, member: v.server.publicKey, signers: [v.server] }))

// ---------- DBC helpers ----------
async function poolAndConfig(pool: PublicKey) {
  const vp = await dbc.state.getPool(pool)
  if (!vp) throw new Error('pool not found')
  const cfg = await dbc.state.getPoolConfig(vp.poolState.config)
  if (!cfg) throw new Error('config not found')
  return [vp, cfg] as const
}

async function show(pool: PublicKey, label: string) {
  const s = (await poolAndConfig(pool))[0].poolState
  console.log(`  [state] ${label}: creator ${s.creator.toBase58()} | unclaimed creator fee ${sol(s.creatorQuoteFee)} SOL | unclaimed partner fee ${sol(s.partnerQuoteFee)} SOL | quote reserve ${sol(s.quoteReserve)} | migrated ${s.isMigrated}`)
  return s
}

async function ensureConfig(name: string, thresholdSol: number, partner: Keypair): Promise<PublicKey> {
  const { kp: config } = loadOrCreateKeypair(name)
  const curve = linkCurveV1(thresholdSol)
  assertLinkV1Spec(curve, thresholdSol)
  if (!(await accountExists(config.publicKey))) {
    const tx = await dbc.partner.createConfig({ config: config.publicKey, feeClaimer: partner.publicKey, leftoverReceiver: partner.publicKey, quoteMint: WSOL_MINT, payer: partner.publicKey, ...curve })
    await execute(STEP, `create devnet LINK-v1 config ${name} (threshold ${thresholdSol} SOL, liquidity 100% locked)`, tx, partner, [config])
  }
  const c = await dbc.state.getPoolConfig(config.publicKey)
  console.log(`  config ${config.publicKey.toBase58()}: creator fee share ${c?.creatorTradingFeePercentage}% | LP partner ${c?.partnerLiquidityPercentage}% + ${c?.partnerPermanentLockedLiquidityPercentage}% locked, creator ${c?.creatorLiquidityPercentage}% + ${c?.creatorPermanentLockedLiquidityPercentage}% locked`)
  return config.publicKey
}

/**
 * One transaction: a fresh one-time key creates the pool (the hatcher pays and does the first buy) and hands the
 * creator role to the vault PDA. The one-time key only ever exists in this function.
 */
async function launchIntoVault(config: PublicKey, payer: Keypair, vaultPda: PublicKey, firstBuyLamports: number, tag: string) {
  const oneTime = Keypair.generate()
  const baseMint = Keypair.generate()
  const pool = deriveDbcPoolAddress(WSOL_MINT, baseMint.publicKey, config)
  const tx = await dbc.creator.createPoolWithFirstBuy({
    createPoolParam: { name: `Link Proof ${tag}`, symbol: `LINK${tag}`, uri: 'https://example.com/hatch/link-proof.json', payer: payer.publicKey, poolCreator: oneTime.publicKey, config, baseMint: baseMint.publicKey },
    firstBuyParam: { buyer: payer.publicKey, buyAmount: new BN(firstBuyLamports), minimumAmountOut: new BN(1), referralTokenAccount: null },
  })
  // The pool does not exist yet, so the SDK helper (which reads it) cannot build this; same instruction, built directly.
  const program = (dbc.creator as unknown as { program: { methods: { transferPoolCreator(): { accountsPartial(a: object): { instruction(): Promise<TransactionInstruction> } } } } }).program
  tx.add(await program.methods.transferPoolCreator().accountsPartial({ virtualPool: pool, newCreator: vaultPda, config, creator: oneTime.publicKey }).instruction())
  const sig = await execute(STEP, `launch ${tag}: one-time key ${short(oneTime.publicKey)} creates the pool, ${short(payer.publicKey)} pays + first buy ${sol(firstBuyLamports)} SOL, creator -> vault, ONE transaction`, tx, payer, [oneTime, baseMint], { computeUnits: 600_000 })
  console.log(`  pool ${pool.toBase58()} | base mint ${baseMint.publicKey.toBase58()} | one-time creator key ${oneTime.publicKey.toBase58()} (discarded)`)
  return { pool, baseMint: baseMint.publicKey, sig }
}

async function buy(pool: PublicKey, who: Keypair, lamports: number, mode: SwapMode.ExactIn | SwapMode.PartialFill = SwapMode.ExactIn) {
  const [vp, cfg] = await poolAndConfig(pool)
  const quote = dbc.pool.swapQuote2({ virtualPool: vp, config: cfg, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: await currentPoint(cfg.activationType), slippageBps: 300, swapMode: mode, amountIn: new BN(lamports) })
  const tx = await dbc.pool.swap2({ owner: who.publicKey, pool, swapBaseForQuote: false, referralTokenAccount: null, swapMode: mode, amountIn: new BN(lamports), minimumAmountOut: quote.minimumAmountOut! })
  return execute(STEP, `buy ${sol(lamports)} SOL by ${short(who.publicKey)}`, tx, who)
}

async function sellHalf(pool: PublicKey, baseMint: PublicKey, who: Keypair) {
  const ata = getAssociatedTokenAddressSync(baseMint, who.publicKey, false, TOKEN_2022_PROGRAM_ID)
  const bal = new BN((await connection.getTokenAccountBalance(ata)).value.amount).divn(2)
  const [vp, cfg] = await poolAndConfig(pool)
  const quote = dbc.pool.swapQuote2({ virtualPool: vp, config: cfg, swapBaseForQuote: true, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: await currentPoint(cfg.activationType), slippageBps: 300, swapMode: SwapMode.ExactIn, amountIn: bal })
  const tx = await dbc.pool.swap2({ owner: who.publicKey, pool, swapBaseForQuote: true, referralTokenAccount: null, swapMode: SwapMode.ExactIn, amountIn: bal, minimumAmountOut: quote.minimumAmountOut! })
  return execute(STEP, `sell half of ${short(who.publicKey)}'s tokens`, tx, who)
}

/** The instruction that moves the creator role vault -> owner (the vault PDA signs through Squads). */
async function handoverIx(pool: PublicKey, vaultPda: PublicKey, owner: PublicKey): Promise<TransactionInstruction> {
  return (await dbc.creator.transferPoolCreator({ pool, creator: vaultPda, newCreator: owner })).instructions[0]
}

/** The owner claims from their own wallet; a separate fee payer covers the network fee ("Hatch pays the fee"). */
async function ownerClaims(pool: PublicKey, owner: Keypair, feePayer: Keypair, label: string) {
  const s = (await poolAndConfig(pool))[0].poolState
  const before = await connection.getBalance(owner.publicKey)
  const tx = await dbc.creator.claimCreatorTradingFee({ creator: owner.publicKey, payer: feePayer.publicKey, pool, maxBaseAmount: s.creatorBaseFee, maxQuoteAmount: s.creatorQuoteFee })
  await execute(STEP, label, tx, feePayer, [owner])
  const after = await connection.getBalance(owner.publicKey)
  console.log(`  [claim] pool counter showed ${sol(s.creatorQuoteFee)} SOL; owner ${owner.publicKey.toBase58()} balance ${sol(before)} -> ${sol(after)} (+${sol(after - before)} SOL; fee payer ${short(feePayer.publicKey)})`)
}

// ---------- stage 1: the vault ----------
async function stageVault() {
  const v = vault()
  const payer = hatcher()
  console.log(`  server ${v.server.publicKey.toBase58()} | approver (devnet stand-in) ${v.approver.publicKey.toBase58()} | backup ${v.backup.publicKey.toBase58()}`)
  console.log(`  multisig ${v.multisigPda.toBase58()} | vault PDA (index ${VAULT_INDEX}) ${v.vaultPda.toBase58()}`)
  if (!(await accountExists(v.multisigPda))) {
    const [programConfigPda] = multisig.getProgramConfigPda({})
    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)
    await sq('create Squads v4 multisig (threshold 1; server Initiate+Execute, approver Vote, backup Vote; no config authority)', () =>
      multisig.rpc.multisigCreateV2({
        connection,
        treasury: programConfig.treasury,
        createKey: v.createKey,
        creator: payer,
        multisigPda: v.multisigPda,
        configAuthority: null,
        threshold: VAULT_THRESHOLD,
        members: vaultMembers({ server: v.server.publicKey, approver: v.approver.publicKey, backup: v.backup.publicKey }),
        timeLock: VAULT_TIME_LOCK,
        rentCollector: null,
      })
    )
  }
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, v.multisigPda)
  assertVaultSpec(ms, { server: v.server.publicKey, approver: v.approver.publicKey, backup: v.backup.publicKey })
  console.log(`  on chain: threshold ${ms.threshold}, time lock ${ms.timeLock}, config authority ${ms.configAuthority.equals(PublicKey.default) ? 'none' : ms.configAuthority.toBase58()}`)
  for (const m of ms.members) console.log(`    member ${m.key.toBase58()}: ${describePermissions(m.permissions.mask)}`)

  await fund(v.server.publicKey, 60_000_000, payer)
  await fund(v.approver.publicKey, 10_000_000, payer)
  await fund(v.backup.publicKey, 5_000_000, payer)

  // A harmless vault transaction (a memo signed by the vault) to exercise the roles.
  const memo = { programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), keys: [{ pubkey: v.vaultPda, isSigner: true, isWritable: false }], data: Buffer.from('hatch link vault check') }
  const i = await propose(v, [memo], 'memo signed by the vault')
  await mustFail('server (no Vote) approves its own proposal', () => multisig.rpc.proposalApprove({ connection, feePayer: v.server, member: v.server, multisigPda: v.multisigPda, transactionIndex: i }))
  await mustFail('server executes before any approval', () => multisig.rpc.vaultTransactionExecute({ connection, feePayer: v.server, multisigPda: v.multisigPda, transactionIndex: i, member: v.server.publicKey, signers: [v.server] }))
  await mustFail('approver (no Initiate) creates a proposal', async () => {
    const idx = await nextIndex(v.multisigPda)
    const message = new TransactionMessage({ payerKey: v.vaultPda, recentBlockhash: (await connection.getLatestBlockhash()).blockhash, instructions: [memo] })
    return multisig.rpc.vaultTransactionCreate({ connection, feePayer: v.approver, multisigPda: v.multisigPda, transactionIndex: idx, creator: v.approver.publicKey, vaultIndex: VAULT_INDEX, ephemeralSigners: 0, transactionMessage: message })
  })
  await approve(v, i, v.approver, 'approver')
  await mustFail('approver (no Execute) executes the approved proposal', () => multisig.rpc.vaultTransactionExecute({ connection, feePayer: v.approver, multisigPda: v.multisigPda, transactionIndex: i, member: v.approver.publicKey, signers: [v.approver] }))
  await run(v, i)
  // The backup key can also approve on its own (threshold 1).
  const j = await propose(v, [memo], 'memo, approved by the backup key')
  await approve(v, j, v.backup, 'backup')
  await run(v, j)
}

// ---------- stages 2-4: launch into the vault, swaps, handover by proposal, owner claims ----------
async function stageClaim() {
  const v = vault()
  const payer = hatcher()
  const trader = partnerKp()
  const owner = Keypair.generate() // the link owner's wallet (fresh, empty: proves the fee-payer path)
  console.log(`  vault PDA ${v.vaultPda.toBase58()} | link owner (test) ${owner.publicKey.toBase58()}`)
  const config = await ensureConfig('devnet-config-link-v1-locked', 10, trader)

  const { pool, baseMint } = await launchIntoVault(config, payer, v.vaultPda, 20_000_000, 'P1A')
  await show(pool, 'after launch (creator must be the vault)')
  await buy(pool, trader, 30_000_000)
  await sellHalf(pool, baseMint, payer)
  await buy(pool, payer, 20_000_000)
  const accrued = (await show(pool, 'after 4 swaps, creator = vault, nothing claimed')).creatorQuoteFee

  const i = await propose(v, [await handoverIx(pool, v.vaultPda, owner.publicKey)], `transferPoolCreator ${short(pool)} -> owner ${short(owner.publicKey)}`)
  await mustFail('server executes the handover before the approver votes', () => multisig.rpc.vaultTransactionExecute({ connection, feePayer: v.server, multisigPda: v.multisigPda, transactionIndex: i, member: v.server.publicKey, signers: [v.server] }))
  await approve(v, i, v.approver, 'approver')
  await run(v, i)
  await show(pool, 'after the vault handed over the creator role')

  console.log(`  creator fees accrued while the vault was creator: ${sol(accrued)} SOL`)
  await ownerClaims(pool, owner, payer, 'owner claims the pre-transfer creator fees (fee paid by a separate payer)')
  await show(pool, 'end of claim flow')
}

// ---------- stages 5-6: graduate under the vault, locked positions, gap refusal, hand over role + NFT ----------
async function stageGraduate() {
  const v = vault()
  const payer = hatcher()
  const trader = partnerKp()
  const owner = Keypair.generate()
  console.log(`  vault PDA ${v.vaultPda.toBase58()} | link owner (test) ${owner.publicKey.toBase58()}`)
  const config = await ensureConfig('devnet-config-link-v1-locked-small', GRADUATE_THRESHOLD_SOL, trader)

  const { pool } = await launchIntoVault(config, payer, v.vaultPda, 10_000_000, 'P1B')
  console.log('  waiting 65 s for the sniper shield to end before filling the curve…')
  await sleep(65_000)
  const [vp, cfg] = await poolAndConfig(pool)
  await buy(pool, trader, cfg.migrationQuoteThreshold.sub(vp.poolState.quoteReserve).muln(115).divn(100).toNumber(), SwapMode.PartialFill)
  const filled = await show(pool, 'curve complete, NOT migrated yet, creator = vault')

  // 6) The gap: a handover proposed and approved now cannot execute until the pool has migrated.
  const gap = await propose(v, [await handoverIx(pool, v.vaultPda, owner.publicKey)], 'handover during the curve-complete gap')
  await approve(v, gap, v.approver, 'approver')
  await mustFail('server executes the approved handover in the gap (curve complete, not migrated)', () => multisig.rpc.vaultTransactionExecute({ connection, feePayer: v.server, multisigPda: v.multisigPda, transactionIndex: gap, member: v.server.publicKey, signers: [v.server] }))

  // 5) Migrate while the vault is the creator.
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[cfg.migrationFeeOption]
  const dammPool = deriveDammV2PoolAddress(dammConfig, vp.poolState.baseMint, cfg.quoteMint)
  const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await dbc.migration.migrateToDammV2({ payer: trader.publicKey, pool, dammConfig })
  await execute(STEP, 'migrate to DAMM v2 (creator is the vault)', transaction, trader, [firstPositionNftKeypair, secondPositionNftKeypair], { computeUnits: 1_000_000 })
  await show(pool, 'after migration')
  console.log(`  DAMM v2 pool ${dammPool.toBase58()}`)

  const cp = new CpAmm(connection)
  let creatorNft: PublicKey | null = null
  for (const nft of [firstPositionNftKeypair.publicKey, secondPositionNftKeypair.publicKey]) {
    const acct = await connection.getParsedAccountInfo(derivePositionNftAccount(nft))
    const holder = (acct.value?.data as { parsed?: { info?: { owner?: string } } })?.parsed?.info?.owner ?? '?'
    const pos = await cp.fetchPositionState(derivePositionAddress(nft))
    const role = holder === v.vaultPda.toBase58() ? 'CREATOR position, held by the vault' : holder === trader.publicKey.toBase58() ? 'PARTNER position, held by the config fee claimer' : `held by ${holder}`
    if (holder === v.vaultPda.toBase58()) creatorNft = nft
    console.log(`  [position] NFT ${nft.toBase58()} (${role}): withdrawable (unlocked) ${pos.unlockedLiquidity.toString()} | vesting ${pos.vestedLiquidity.toString()} | permanently locked ${pos.permanentLockedLiquidity.toString()}`)
  }
  if (!creatorNft) throw new Error('creator position not found in the vault')

  // The gap proposal now works unchanged (the app's "retry"): but the owner also needs the position NFT, so
  // propose ONE vault transaction with both instructions instead.
  const ownerNftAta = getAssociatedTokenAddressSync(creatorNft, owner.publicKey, false, TOKEN_2022_PROGRAM_ID)
  await execute(STEP, "create the owner's token account for the position NFT (paid by Hatch)", new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ownerNftAta, owner.publicKey, creatorNft, TOKEN_2022_PROGRAM_ID)), payer)
  const both = await propose(
    v,
    [await handoverIx(pool, v.vaultPda, owner.publicKey), createTransferCheckedInstruction(derivePositionNftAccount(creatorNft), creatorNft, ownerNftAta, v.vaultPda, 1, 0, [], TOKEN_2022_PROGRAM_ID)],
    'creator role + position NFT -> owner, two instructions'
  )
  await approve(v, both, v.approver, 'approver')
  await run(v, both)
  await show(pool, 'after the vault handed over role + NFT')
  const held = await connection.getParsedAccountInfo(ownerNftAta)
  console.log(`  position NFT now held by ${(held.value?.data as { parsed?: { info?: { owner?: string; tokenAmount?: { amount?: string } } } })?.parsed?.info?.owner} (amount ${(held.value?.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } })?.parsed?.info?.tokenAmount?.amount})`)
  await mustFail('server re-executes the stale gap proposal after the handover', () => multisig.rpc.vaultTransactionExecute({ connection, feePayer: v.server, multisigPda: v.multisigPda, transactionIndex: gap, member: v.server.publicKey, signers: [v.server] }))

  // Pre-migration curve fees: claimable by the owner after migration.
  console.log(`  curve creator fees accrued before migration: ${sol(filled.creatorQuoteFee)} SOL`)
  await ownerClaims(pool, owner, payer, 'owner claims the pre-migration curve fees')

  // Post-migration: trade on the DAMM v2 pool, then the owner claims the locked position's fees.
  const d = await cp.fetchPoolState(dammPool)
  const progOf = (mint: PublicKey) => (mint.equals(WSOL_MINT) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID)
  const common = { pool: dammPool, tokenAMint: d.tokenAMint, tokenBMint: d.tokenBMint, tokenAVault: d.tokenAVault, tokenBVault: d.tokenBVault, tokenAProgram: progOf(d.tokenAMint), tokenBProgram: progOf(d.tokenBMint) }
  const baseMintOnDamm = d.tokenAMint.equals(WSOL_MINT) ? d.tokenBMint : d.tokenAMint
  await execute(STEP, 'trade on the DAMM v2 pool: buy with 0.05 SOL', await cp.swap({ payer: payer.publicKey, inputTokenMint: WSOL_MINT, outputTokenMint: baseMintOnDamm, amountIn: new BN(50_000_000), minimumAmountOut: new BN(0), referralTokenAccount: null, ...common }), payer)
  const position = derivePositionAddress(creatorNft)
  const solBefore = await connection.getBalance(owner.publicKey)
  await execute(STEP, 'owner claims DAMM v2 fees from the permanently locked creator position (fee paid by a separate payer)', await cp.claimPositionFee({ owner: owner.publicKey, position, positionNftAccount: ownerNftAta, feePayer: payer.publicKey, ...common }), payer, [owner])
  const solAfter = await connection.getBalance(owner.publicKey)
  const baseAta = getAssociatedTokenAddressSync(baseMintOnDamm, owner.publicKey, false, TOKEN_2022_PROGRAM_ID)
  const baseBal = (await accountExists(baseAta)) ? (await connection.getTokenAccountBalance(baseAta)).value.uiAmountString : '0'
  console.log(`  [post-migration claim] owner SOL ${sol(solBefore)} -> ${sol(solAfter)} (+${sol(solAfter - solBefore)}); owner base-token balance ${baseBal}`)
  const pos = await cp.fetchPositionState(position)
  console.log(`  creator position after claim: withdrawable ${pos.unlockedLiquidity.toString()} | permanently locked ${pos.permanentLockedLiquidity.toString()}`)
  // Nothing is withdrawable: removing liquidity must be refused.
  await mustFail('owner tries to withdraw liquidity from the locked position', async () => {
    const tx = await cp.removeAllLiquidity({ owner: owner.publicKey, position, positionNftAccount: ownerNftAta, tokenAAmountThreshold: new BN(0), tokenBAmountThreshold: new BN(0), vestings: [], currentPoint: new BN(Math.floor(Date.now() / 1000)), ...common } as unknown as Parameters<CpAmm['removeAllLiquidity']>[0])
    tx.feePayer = payer.publicKey
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    const sim = await connection.simulateTransaction(tx)
    if (sim.value.err) throw Object.assign(new Error(JSON.stringify(sim.value.err)), { logs: sim.value.logs ?? [] })
  })
}

runIfMain(import.meta.url, async () => {
  if (!/devnet/.test(hostOf(RPC_URL))) throw new Error(`link-proof runs on devnet only (rpc is ${hostOf(RPC_URL)})`)
  const stage = process.argv[2]
  console.log(`\n=== link proof: ${stage} [devnet ${DRY_RUN ? 'DRY RUN' : 'LIVE'}] | Squads v4 ${multisig.PROGRAM_ID.toBase58()} ===`)
  if (DRY_RUN) throw new Error('This proof sends devnet transactions; pass --live.')
  if (stage === 'vault') await stageVault()
  else if (stage === 'claim') await stageClaim()
  else if (stage === 'graduate') await stageGraduate()
  else throw new Error('Usage: pnpm link-proof-devnet <vault|claim|graduate> --live')
})
