// Server-only: every pool under Hatch's configs, read from chain once per 30 s per instance
// (getProgramAccounts per config), shared by /api/pools (home list) and the home stats.
import { Connection } from '@solana/web3.js';
import { serverRpcUrl } from '@/lib/config/network';
import { fetchHatchPools, type HatchPool } from '@/lib/dbc/pool';
import { loadHatchConfigs } from '@/lib/server/presets';
import { swr, type Cached } from '@/lib/server/swrCache';

export const POOLS_TTL_MS = 30_000;
let seenPools = false;

/** All Hatch pools (hidden test mints included; callers filter for public lists). */
export function allHatchPools(): Promise<Cached<HatchPool[]>> {
  return swr('pools:all', POOLS_TTL_MS, async () => {
    const pools = await fetchHatchPools(new Connection(serverRpcUrl(), 'confirmed'), loadHatchConfigs());
    // A scan that suddenly returns nothing (after pools were seen) is an RPC hiccup, not every pool vanishing.
    if (pools.length === 0 && seenPools) throw new Error('empty pool scan');
    if (pools.length) seenPools = true;
    return pools;
  });
}
