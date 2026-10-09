// GET /api/shield/<pool address>: the "sniper receipt" for a Hatch v2 pool (what buys in the anti-sniper window
// actually paid), computed from the pool's swap events with the server RPC. Once the window has closed and
// settled the receipt can never change, so it is written once to R2 (create-only, like uploads) and served from
// there forever; while the window is still open it is cached for 10 s only.
// Only Hatch pools whose config has the sniper shield; anything else is 404 (no arbitrary chain scans).
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { serverRpcUrl } from '@/lib/config/network';
import { dbcClient, describePool, type HatchPool } from '@/lib/dbc/pool';
import { hasSniperShield } from '@/lib/dbc/feeSchedule';
import { allConfigKeys } from '@/lib/presets';
import { rateLimited } from '@/lib/server/rateLimit';
import { allHatchPools } from '@/lib/server/pools';
import { loadHatchConfigs } from '@/lib/server/presets';
import { R2ObjectExistsError, isR2Configured, publicR2Url, uploadToR2 } from '@/lib/server/r2';
import { computeShieldReceipt, type ShieldReceipt } from '@/lib/server/shield';
import { swr } from '@/lib/server/swrCache';

const OPEN_TTL_MS = 10_000;
const r2Key = (pool: string) => `shield/v1/${pool}.json`;
/** Final receipts, per instance (they never change). */
const finals = new Map<string, ShieldReceipt>();

async function hatchPool(address: string): Promise<HatchPool | null> {
  const listed = (await allHatchPools().catch((): null => null))?.value.find((p) => p.address === address);
  if (listed) return listed;
  // A brand-new pool may not be in the 30 s list yet: read it directly, Hatch configs only.
  const connection = new Connection(serverRpcUrl(), 'confirmed');
  const client = dbcClient(connection);
  const hc = loadHatchConfigs();
  // Not a DBC pool account (wrong owner or layout) reads as "no pool", not as an error.
  const state = await client.state.getPool(new PublicKey(address)).catch((): null => null);
  if (!state) return null;
  const configKey = state.poolState.config.toBase58();
  if (!allConfigKeys(hc).includes(configKey)) return null;
  const config = await client.state.getPoolConfig(configKey);
  return config ? describePool(connection, new PublicKey(address), state, config, hc) : null;
}

async function readR2(pool: string): Promise<ShieldReceipt | null> {
  if (!isR2Configured()) return null;
  try {
    const res = await fetch(publicR2Url(r2Key(pool)), { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const r = (await res.json()) as ShieldReceipt;
    return r.final && r.pool === pool ? r : null;
  } catch {
    return null;
  }
}

async function writeR2(r: ShieldReceipt) {
  if (!isR2Configured()) return;
  try {
    await uploadToR2(r2Key(r.pool), JSON.stringify(r), 'application/json');
  } catch (e) {
    if (!(e instanceof R2ObjectExistsError)) console.warn('shield: R2 write failed:', e instanceof Error ? e.message : e);
  }
}

function sendFinal(res: NextApiResponse, r: ShieldReceipt) {
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=31536000, immutable');
  return res.status(200).json(r);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ShieldReceipt | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let pool: string;
  try {
    pool = new PublicKey(String(req.query.pool ?? '')).toBase58();
  } catch {
    return res.status(400).json({ error: 'Invalid pool' });
  }
  const done = finals.get(pool);
  if (done) return sendFinal(res, done);
  if (rateLimited(req, res, 'shield', 30, 60_000)) return;
  try {
    const stored = await readR2(pool);
    if (stored) {
      finals.set(pool, stored);
      return sendFinal(res, stored);
    }
    const { value, stale } = await swr<ShieldReceipt | null>(`shield:${pool}`, OPEN_TTL_MS, async () => {
      const p = await hatchPool(pool);
      if (!p || p.presetId === null || !hasSniperShield(p.feeSchedule) || p.feeSchedule.activationType !== 1 || Number(p.activationPoint) <= 0) return null;
      return computeShieldReceipt(serverRpcUrl(), { pool, quoteMint: p.quote.address, quoteDecimals: p.quote.decimals, activationPoint: p.activationPoint, schedule: p.feeSchedule });
    });
    if (!value) return res.status(404).json({ error: 'Not a Hatch pool with the sniper shield' });
    if (value.final) {
      finals.set(pool, value);
      if (finals.size > 5000) finals.delete(finals.keys().next().value!);
      await writeR2(value);
      return sendFinal(res, value);
    }
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
    if (stale) res.setHeader('X-Hatch-Stale', '1');
    return res.status(200).json(value);
  } catch (e) {
    console.warn('shield: compute failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not read the launch window right now' });
  }
}
