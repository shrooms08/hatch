// Phase 1: create the third devnet DBC config, AI AGENT preset (SOL quote, ~1 SOL threshold,
// DAMM v2 migration, gentler curve, creator-favoring fees). Partner wallet owns it.
import { header, loadKeypair, runIfMain } from './lib.js'
import { createConfig } from './create-configs.js'

export async function createAgentConfig() {
  header('create-agent-config')
  await createConfig('agent', loadKeypair('partner'))
}

runIfMain(import.meta.url, createAgentConfig)
