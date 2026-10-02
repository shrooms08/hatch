// Runs the whole sequence in order. Without --live every transaction is only simulated;
// steps whose prerequisites are not on-chain yet report that they were skipped.
import { DRY_RUN, reportError } from './lib.js'
import { setupWallets } from './setup-wallets.js'
import { mockStock } from './mock-stock.js'
import { createConfigs } from './create-configs.js'
import { launch } from './launch.js'
import { buy } from './buy.js'
import { graduate } from './graduate.js'
import { status } from './status.js'

const steps = [setupWallets, mockStock, createConfigs, launch, buy, graduate, status]

console.log(`Hatch devnet DBC loop: ${DRY_RUN ? 'DRY RUN (simulate only)' : 'LIVE on devnet'}`)
try {
  for (const step of steps) await step()
  console.log('\nDone.')
} catch (e) {
  reportError(e)
  process.exit(1)
}
