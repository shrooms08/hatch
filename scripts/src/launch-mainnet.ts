// MAINNET: launch one test token on the STOCK (or MEME) config, mainnet-partner as creator + payer.
//   pnpm launch-mainnet --name "Hatch NVDA" --symbol HNVDA --uri https://.../metadata.json [--preset stock|meme] [--mainnet --live]
import { PublicKey } from '@solana/web3.js'
import { deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { StepError, loadOrCreateKeypair, runIfMain } from './lib.js'
import { dbc, execLegacy, header, partner, readState, solscanAccount, writeState } from './mainnet/net.js'
import { nvdaxBadge } from './mainnet/presets.js'

const STEP = 'launch-mainnet'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export async function launchMainnet() {
  header(STEP)
  const preset = (arg('preset') ?? 'stock') as 'stock' | 'meme'
  const name = arg('name')
  const symbol = arg('symbol')
  const uri = arg('uri')
  if (!name || name.length > 32) throw new StepError(STEP, '--name is required (max 32 chars)')
  if (!symbol || !/^[A-Z0-9]{1,10}$/.test(symbol)) throw new StepError(STEP, '--symbol is required (1-10 chars, A-Z0-9)')
  if (!uri || !/^https:\/\//.test(uri) || uri.length > 200) throw new StepError(STEP, '--uri is required (https metadata JSON, max 200 chars)')

  const st = readState()
  if (st.pools?.[preset]) throw new StepError(STEP, `A ${preset} test pool already exists: ${st.pools[preset]!.pool}`)
  const cfg = st.configs?.[preset]
  // In simulation before the config exists we can still show the plan, but the program needs the config on-chain.
  const configPk = cfg ? new PublicKey(cfg.config) : loadOrCreateKeypair(`mainnet-config-${preset}`).kp.publicKey
  const configOnChain = await dbc.state.getPoolConfig(configPk).catch(() => null)
  const { kp: baseMint } = loadOrCreateKeypair(`mainnet-base-${preset}`)
  const creator = partner()
  console.log(`  ${name} (${symbol}) on ${preset} config ${configPk.toBase58()}  base mint ${baseMint.publicKey.toBase58()}  creator ${creator.publicKey.toBase58()}`)
  if (!configOnChain) {
    console.log(`  - not simulated: the ${preset} config is not on mainnet yet (run create-config-mainnet ${preset} first).`)
    return
  }
  const tokenBadge = preset === 'stock' ? await nvdaxBadge() : undefined
  const tx = await dbc.creator.createPool({ name, symbol, uri, payer: creator.publicKey, poolCreator: creator.publicKey, config: configPk, baseMint: baseMint.publicKey, ...(tokenBadge ? { tokenBadge } : {}) })
  const r = await execLegacy(STEP, `launch ${symbol}`, tx, creator, [baseMint])
  if (!r.sig) return
  const pool = deriveDbcPoolAddress(configOnChain.quoteMint, baseMint.publicKey, configPk)
  writeState((s) => {
    s.pools = { ...s.pools, [preset]: { pool: pool.toBase58(), baseMint: baseMint.publicKey.toBase58(), name, symbol, uri, tx: r.sig! } }
  })
  const v = await dbc.state.getPool(pool)
  console.log(`  on-chain pool ${pool.toBase58()} quoteReserve ${v?.poolState.quoteReserve.toString()}  ${solscanAccount(pool)}`)
}

runIfMain(import.meta.url, launchMainnet)
