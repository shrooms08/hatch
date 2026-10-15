// The Hatch link vault: a Squads v4 multisig whose vault PDA is the pool creator of every unclaimed link coin.
// Network-neutral (no RPC, no keys). Official SDK @sqds/multisig; program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf.
//   SERVER   = Initiate + Execute (no Vote): can propose a handover and run it once approved, nothing else.
//   APPROVER = Vote: the human approval (HATCH_APPROVER_PUBKEY on mainnet).
//   BACKUP   = Vote: a second approver kept offline.
//   Threshold 1, no time lock, no config authority (membership can only change through an approved proposal).
import * as multisig from '@sqds/multisig'
import { PublicKey } from '@solana/web3.js'

const { Permission, Permissions } = multisig.types
export const SQUADS_PROGRAM_ID = multisig.PROGRAM_ID
export const VAULT_INDEX = 0
export const VAULT_THRESHOLD = 1
export const VAULT_TIME_LOCK = 0

/** Permission bit masks as stored on chain: Initiate 1, Vote 2, Execute 4. */
export const MASK = { server: 1 | 4, voter: 2 } as const

export type VaultKeys = { server: PublicKey; approver: PublicKey; backup: PublicKey }

export function vaultMembers(k: VaultKeys): multisig.types.Member[] {
  const all = [k.server, k.approver, k.backup].map((p) => p.toBase58())
  if (new Set(all).size !== 3) throw new Error('server, approver and backup must be three different keys')
  return [
    { key: k.server, permissions: Permissions.fromPermissions([Permission.Initiate, Permission.Execute]) },
    { key: k.approver, permissions: Permissions.fromPermissions([Permission.Vote]) },
    { key: k.backup, permissions: Permissions.fromPermissions([Permission.Vote]) },
  ]
}

export function vaultAddresses(createKey: PublicKey): { multisigPda: PublicKey; vaultPda: PublicKey } {
  const [multisigPda] = multisig.getMultisigPda({ createKey })
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: VAULT_INDEX })
  return { multisigPda, vaultPda }
}

/** Throws unless the on-chain multisig has exactly the members, permissions and settings above. */
export function assertVaultSpec(ms: multisig.accounts.Multisig, k: VaultKeys): void {
  const bad: string[] = []
  const want = new Map([
    [k.server.toBase58(), MASK.server],
    [k.approver.toBase58(), MASK.voter],
    [k.backup.toBase58(), MASK.voter],
  ])
  if (ms.members.length !== 3) bad.push(`members: expected 3, got ${ms.members.length}`)
  for (const m of ms.members) {
    const w = want.get(m.key.toBase58())
    if (w === undefined) bad.push(`unexpected member ${m.key.toBase58()}`)
    else if (m.permissions.mask !== w) bad.push(`member ${m.key.toBase58()}: permission mask expected ${w}, got ${m.permissions.mask}`)
  }
  if (ms.threshold !== VAULT_THRESHOLD) bad.push(`threshold: expected ${VAULT_THRESHOLD}, got ${ms.threshold}`)
  if (ms.timeLock !== VAULT_TIME_LOCK) bad.push(`timeLock: expected ${VAULT_TIME_LOCK}, got ${ms.timeLock}`)
  if (!ms.configAuthority.equals(PublicKey.default)) bad.push(`configAuthority: expected none, got ${ms.configAuthority.toBase58()}`)
  if (bad.length) throw new Error(`Multisig does not match the Hatch vault spec:\n  ${bad.join('\n  ')}`)
}

export const describePermissions = (mask: number) => ['Initiate', 'Vote', 'Execute'].filter((_, i) => mask & (1 << i)).join('+') || 'none'
