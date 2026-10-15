// MAINNET: create the Hatch link vault, a Squads v4 multisig (link-squads.ts), paid by mainnet-partner.
//   HATCH_APPROVER_PUBKEY=<your wallet> pnpm create-squads-vault-mainnet                     # simulate only (default)
//   HATCH_APPROVER_PUBKEY=<your wallet> pnpm create-squads-vault-mainnet --mainnet --live    # send (asks for YES MAINNET)
// Members: SERVER = Initiate + Execute (no Vote), APPROVER (HATCH_APPROVER_PUBKEY) = Vote, BACKUP = Vote.
// Threshold 1, no time lock, no config authority. The server alone cannot approve or move anything.
// The SERVER and BACKUP keypairs are generated into scripts/keys/ (gitignored); only public keys are printed.
import * as multisig from '@sqds/multisig'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { runIfMain, StepError, loadOrCreateKeypair } from './lib.js'
import { ARMED, connection, execLegacy, header, partner, readState, solscanAccount, writeState } from './mainnet/net.js'
import { SQUADS_PROGRAM_ID, VAULT_INDEX, VAULT_THRESHOLD, VAULT_TIME_LOCK, assertVaultSpec, describePermissions, vaultAddresses, vaultMembers } from './link-squads.js'

const STEP = 'create-squads-vault-mainnet'

function approverFromEnv(): { key: PublicKey; placeholder: boolean } {
  const raw = (process.env.HATCH_APPROVER_PUBKEY ?? '').trim()
  if (raw) {
    try {
      const key = new PublicKey(raw)
      if (!PublicKey.isOnCurve(key.toBytes())) throw new Error('not a wallet address')
      return { key, placeholder: false }
    } catch {
      throw new StepError(STEP, 'HATCH_APPROVER_PUBKEY is not a valid wallet address.')
    }
  }
  if (ARMED) throw new StepError(STEP, 'Set HATCH_APPROVER_PUBKEY to your wallet address before creating the vault on mainnet.')
  // Simulation only: a throwaway address so the cost can be estimated. Never used for a real vault.
  return { key: Keypair.generate().publicKey, placeholder: true }
}

export async function createLinkVault() {
  header(STEP)
  const payer = partner()
  const existing = readState().linkVault
  if (existing) throw new StepError(STEP, `The link vault already exists on mainnet: multisig ${existing.multisig}, vault ${existing.vault}. Not creating another.`)

  const server = loadOrCreateKeypair('mainnet-squads-server').kp
  const backup = loadOrCreateKeypair('mainnet-squads-backup').kp
  const createKey = loadOrCreateKeypair('mainnet-squads-create-key').kp
  const approver = approverFromEnv()
  const keys = { server: server.publicKey, approver: approver.key, backup: backup.publicKey }
  const members = vaultMembers(keys)
  const { multisigPda, vaultPda } = vaultAddresses(createKey.publicKey)

  console.log(`  Squads v4 program ${SQUADS_PROGRAM_ID.toBase58()} (@sqds/multisig)`)
  console.log(`  server   ${server.publicKey.toBase58()}  (${describePermissions(members[0].permissions.mask)}; key in scripts/keys/mainnet-squads-server.json)`)
  console.log(`  approver ${approver.key.toBase58()}  (${describePermissions(members[1].permissions.mask)}; ${approver.placeholder ? 'PLACEHOLDER for simulation, set HATCH_APPROVER_PUBKEY' : 'HATCH_APPROVER_PUBKEY'})`)
  console.log(`  backup   ${backup.publicKey.toBase58()}  (${describePermissions(members[2].permissions.mask)}; key in scripts/keys/mainnet-squads-backup.json)`)
  console.log(`  multisig ${multisigPda.toBase58()} | vault PDA (index ${VAULT_INDEX}) ${vaultPda.toBase58()} | threshold ${VAULT_THRESHOLD}, time lock ${VAULT_TIME_LOCK}, no config authority`)

  if (await connection.getAccountInfo(multisigPda)) throw new StepError(STEP, `Multisig ${multisigPda.toBase58()} already exists on chain.`)
  const [programConfigPda] = multisig.getProgramConfigPda({})
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)
  console.log(`  Squads creation fee: ${(Number(programConfig.multisigCreationFee.toString()) / 1e9).toFixed(6)} SOL (to treasury ${programConfig.treasury.toBase58()})`)

  const ix = multisig.instructions.multisigCreateV2({ treasury: programConfig.treasury, createKey: createKey.publicKey, creator: payer.publicKey, multisigPda, configAuthority: null, threshold: VAULT_THRESHOLD, members, timeLock: VAULT_TIME_LOCK, rentCollector: null })
  const r = await execLegacy(STEP, 'create the link vault multisig', new Transaction().add(ix), payer, [createKey])
  if (!r.sig) {
    if (!approver.placeholder) console.log('  (simulation only: nothing was sent)')
    return
  }
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  assertVaultSpec(ms, keys)
  writeState((s) => {
    s.linkVault = { multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(), server: server.publicKey.toBase58(), approver: approver.key.toBase58(), backup: backup.publicKey.toBase58(), tx: r.sig! }
  })
  console.log(`  on-chain members verified. Vault PDA (the pool creator for unclaimed links): ${vaultPda.toBase58()}  ${solscanAccount(multisigPda)}`)
}

runIfMain(import.meta.url, createLinkVault)
