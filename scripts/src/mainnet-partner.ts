// Creates (once) the MAINNET partner keypair in scripts/keys/mainnet-partner.json (gitignored, mode 600)
// and prints ONLY its public address. It owns the mainnet configs and receives partner fees.
import { runIfMain } from './lib.js'
import { PARTNER_KEY, connection, sol } from './mainnet/net.js'
import { loadOrCreateKeypair } from './lib.js'

runIfMain(import.meta.url, async () => {
  const { kp, created } = loadOrCreateKeypair(PARTNER_KEY)
  const bal = await connection.getBalance(kp.publicKey)
  console.log(`mainnet-partner ${created ? '(new)' : '(existing)'}: ${kp.publicKey.toBase58()}  balance ${sol(bal)} SOL`)
})
