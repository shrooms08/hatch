// Step 2: create a devnet Token-2022 "Mock NVIDIA xStock" (NVDAx, 8 decimals) with ONLY the
// metadata extensions (MetadataPointer + TokenMetadata): no transfer fee, no transfer hook,
// so DBC accepts it as a quote mint without a token badge. Mints 10,000 NVDAx to the creator.
// The partner wallet acts as the mock issuer (mint + metadata authority).
import { SystemProgram, Transaction } from '@solana/web3.js'
import {
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getMintLen,
  getTokenMetadata,
} from '@solana/spl-token'
import { createInitializeInstruction, pack, type TokenMetadata } from '@solana/spl-token-metadata'
import {
  accountExists,
  addrUrl,
  connection,
  execute,
  fmtUnits,
  header,
  loadKeypair,
  loadOrCreateKeypair,
  runIfMain,
  toRaw,
  writeState,
} from './lib.js'

const STEP = 'mock-stock'
export const NVDAX_DECIMALS = 8
const MINT_AMOUNT = 10_000

export async function mockStock() {
  header(STEP)
  const partner = loadKeypair('partner')
  const creator = loadKeypair('creator')
  const { kp: mint } = loadOrCreateKeypair('mock-nvdax-mint')
  const creatorAta = getAssociatedTokenAddressSync(mint.publicKey, creator.publicKey, false, TOKEN_2022_PROGRAM_ID)
  console.log(`  mint: ${mint.publicKey.toBase58()}`)

  if (await accountExists(mint.publicKey)) {
    console.log('  mint already exists on devnet; not recreating.')
  } else {
    const metadata: TokenMetadata = {
      mint: mint.publicKey,
      updateAuthority: partner.publicKey,
      name: 'Mock NVIDIA xStock',
      symbol: 'NVDAx',
      uri: 'https://example.com/hatch/mock-nvdax.json',
      additionalMetadata: [],
    }
    const mintLen = getMintLen([ExtensionType.MetadataPointer])
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen)

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: partner.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMetadataPointerInstruction(mint.publicKey, partner.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey, NVDAX_DECIMALS, partner.publicKey, null, TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint.publicKey,
        updateAuthority: partner.publicKey,
        mint: mint.publicKey,
        mintAuthority: partner.publicKey,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
      }),
      createAssociatedTokenAccountIdempotentInstruction(
        partner.publicKey,
        creatorAta,
        creator.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createMintToCheckedInstruction(
        mint.publicKey,
        creatorAta,
        partner.publicKey,
        BigInt(toRaw(MINT_AMOUNT, NVDAX_DECIMALS).toString()),
        NVDAX_DECIMALS,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    )
    const sig = await execute(STEP, 'create NVDAx mint + mint 10,000 to creator', tx, partner, [mint])
    if (!sig) return
    writeState((s) => {
      s.mockStock = { mint: mint.publicKey.toBase58(), decimals: NVDAX_DECIMALS, tx: sig }
    })
  }

  // Re-read on-chain state.
  const m = await getMint(connection, mint.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID)
  const md = await getTokenMetadata(connection, mint.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID)
  const bal = await getAccount(connection, creatorAta, 'confirmed', TOKEN_2022_PROGRAM_ID)
  console.log(`  on-chain: ${md?.name} (${md?.symbol}), decimals ${m.decimals}, supply ${fmtUnits(m.supply, m.decimals)}`)
  console.log(`  creator NVDAx balance: ${fmtUnits(bal.amount, m.decimals)}  ${addrUrl(mint.publicKey)}`)
  writeState((s) => {
    s.mockStock = { ...s.mockStock, mint: mint.publicKey.toBase58(), decimals: m.decimals }
  })
}

runIfMain(import.meta.url, mockStock)
