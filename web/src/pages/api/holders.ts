// GET /api/holders?mint=<base mint>: number of wallets holding the token (non-zero balances, SPL or
// Token-2022 accounts), excluding the bonding curve's own vaults. Read from chain, cached 60s per mint;
// a zero for a pool that has traded is never cached (it is either real and cheap, or a lagging read).
// Only for tokens launched with Hatch (a pool under one of Hatch's configs); anything else is 404,
// so this cannot be used to scan arbitrary mints.
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { deriveDbcPoolAuthority } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { serverRpcUrl } from '@/lib/config/network';
import { rateLimited } from '@/lib/server/rateLimit';
import { fetchHatchPoolByMint, type HatchPool } from '@/lib/dbc/pool';
import { countHolders, hasTraded } from '@/lib/server/holders';
import { loadHatchConfigs } from '@/lib/server/presets';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; holders: number }>();
const POOL_AUTHORITY = deriveDbcPoolAuthority();

async function readHolders(mint: PublicKey, pool: HatchPool): Promise<number> {
  const connection = new Connection(serverRpcUrl(), 'confirmed');
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error('Mint not found');
  const program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  // Token account layout: mint (0..32), owner (32..64), amount (64..72). Token-2022 accounts carry
  // extensions (no fixed size), so only the mint filter applies there.
  const accounts = await connection.getProgramAccounts(program, {
    commitment: 'confirmed',
    dataSlice: { offset: 32, length: 40 },
    filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }, ...(program.equals(TOKEN_PROGRAM_ID) ? [{ dataSize: 165 }] : [])],
  });
  return countHolders(
    accounts.map(({ pubkey, account }) => ({ address: pubkey.toBase58(), owner: new PublicKey(account.data.subarray(0, 32)).toBase58(), amount: account.data.readBigUInt64LE(32) })),
    { owners: [POOL_AUTHORITY.toBase58()], accounts: [pool.baseVault, pool.quoteVault] }
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<{ holders: number } | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let mint: PublicKey;
  try {
    mint = new PublicKey(String(req.query.mint ?? ''));
  } catch {
    return res.status(400).json({ error: 'Invalid mint' });
  }
  const key = mint.toBase58();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return res.status(200).json({ holders: hit.holders });
  if (rateLimited(req, res, 'holders', 60, 60_000)) return;
  try {
    const pool = await fetchHatchPoolByMint(new Connection(serverRpcUrl(), 'confirmed'), key, loadHatchConfigs());
    if (!pool || pool.presetId === null) return res.status(404).json({ error: 'Not a Hatch launch' });
    const holders = await readHolders(mint, pool);
    const traded = hasTraded({ quoteReserveRaw: pool.quoteReserveUi.isZero() ? '0' : '1', feesRaw: [pool.fees.creatorQuoteRaw, pool.fees.creatorBaseRaw] });
    if (holders === 0 && traded) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      cache.set(key, { at: Date.now(), holders });
      if (cache.size > 2000) cache.clear();
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }
    return res.status(200).json({ holders });
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error && e.message === 'Mint not found' ? e.message : 'Could not count holders right now' });
  }
}
