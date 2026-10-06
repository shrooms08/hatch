// MAINNET: tiny buy on the STOCK test pool, paid in NVDAx (explicit slippage).
//   pnpm buy-mainnet [--nvdax all|<UI amount>] [--slippage-bps 100] [--close-nvdax-ata] [--mainnet --live]
// --nvdax all spends the whole NVDAx balance; with --close-nvdax-ata the then-empty NVDAx account is
// closed in the same transaction, refunding its rent (~0.0016 SOL).
import BN from 'bn.js'
import { PublicKey, Transaction } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, createCloseAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { StepError, fmtUnits, runIfMain } from './lib.js'
import { connection, dbc, execLegacy, header, partner, readState } from './mainnet/net.js'
import { NVDAX_DECIMALS, NVDAX_MINT, nvdaxMultiplier } from './mainnet/presets.js'

const STEP = 'buy-mainnet'

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export async function buyMainnet() {
  header(STEP)
  const st = readState()
  const p = st.pools?.stock
  if (!p) {
    console.log('  - not simulated: no STOCK test pool on mainnet yet (run launch-mainnet first).')
    return
  }
  const slippageBps = Number(arg('slippage-bps') ?? 100)
  if (!(slippageBps > 0 && slippageBps <= 300)) throw new StepError(STEP, '--slippage-bps must be in (0, 300]')
  const user = partner()
  const multiplier = await nvdaxMultiplier()
  const ata = getAssociatedTokenAddressSync(NVDAX_MINT, user.publicKey, false, TOKEN_2022_PROGRAM_ID)
  const bal = await connection.getTokenAccountBalance(ata).then((b) => new BN(b.value.amount)).catch(() => new BN(0))
  const want = arg('nvdax') ?? 'all'
  const amountIn = want === 'all' ? bal : new BN(Math.floor((Number(want) / multiplier) * 10 ** NVDAX_DECIMALS))
  if (amountIn.lten(0)) throw new StepError(STEP, `No NVDAx to spend (balance raw ${bal}). Run swap-sol-to-nvdax first.`)
  if (amountIn.gt(bal)) throw new StepError(STEP, `Wants raw ${amountIn} NVDAx but balance is raw ${bal}`)

  const pool = await dbc.state.getPool(p.pool)
  const config = pool && (await dbc.state.getPoolConfig(pool.poolState.config))
  if (!pool || !config) throw new StepError(STEP, `Pool ${p.pool} not readable`)
  const slot = await connection.getSlot()
  const point = config.activationType === 0 ? new BN(slot) : new BN((await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000))
  const quote = dbc.pool.swapQuote2({ virtualPool: pool, config, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: point, slippageBps, swapMode: SwapMode.ExactIn, amountIn })
  console.log(`  spend raw ${amountIn} NVDAx (UI ${(Number(fmtUnits(amountIn, NVDAX_DECIMALS)) * multiplier).toFixed(8)}) -> ~${quote.outputAmount.toString()} raw ${p.symbol}, min ${quote.minimumAmountOut!.toString()} (${slippageBps} bps)`)
  const tx = await dbc.pool.swap2({ owner: user.publicKey, pool: new PublicKey(p.pool), swapBaseForQuote: false, referralTokenAccount: null, swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: quote.minimumAmountOut! })
  const closing = process.argv.includes('--close-nvdax-ata') && amountIn.eq(bal)
  if (closing) tx.add(createCloseAccountInstruction(ata, user.publicKey, user.publicKey, [], TOKEN_2022_PROGRAM_ID))
  await execLegacy(STEP, `buy ${p.symbol} with NVDAx${closing ? ' + close empty NVDAx account' : ''}`, new Transaction().add(...tx.instructions), user)
}

runIfMain(import.meta.url, buyMainnet)
