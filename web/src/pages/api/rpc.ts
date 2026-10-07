// POST /api/rpc: the browser's Solana RPC. Forwards allowlisted JSON-RPC calls (single or batch) to the
// server-side RPC (HATCH_SERVER_RPC_URL), so the provider key never reaches the browser.
// Same-origin only; per-IP rate limit; bodies over 200 KB are rejected. HTTP only (no websocket):
// the app confirms transactions by polling getSignatureStatuses.
import type { NextApiRequest, NextApiResponse } from 'next';
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { serverRpcUrl } from '@/lib/config/network';
import { ownOrigin } from '@/lib/server/cors';
import { rateLimited } from '@/lib/server/rateLimit';

export const config = { api: { bodyParser: { sizeLimit: '200kb' } } };

const REQUESTS_PER_MINUTE = 120;
const MAX_BATCH = 25;

/** Methods the web app (web3.js Connection + DBC SDK + wallet sends) actually calls. */
const ALLOWED = new Set([
  'getAccountInfo',
  'getMultipleAccounts',
  'getBalance',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getProgramAccounts', // DBC program only (see below)
  'getLatestBlockhash',
  'getBlockHeight',
  'getSlot',
  'getBlockTime',
  'getSignatureStatuses',
  'getFeeForMessage',
  'getRecentPrioritizationFees',
  'getMinimumBalanceForRentExemption',
  'simulateTransaction',
  'sendTransaction',
]);

const DBC_PROGRAM = DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58();

type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

/** Why a call is refused, or null when it may be forwarded. */
function refusal(call: RpcCall): string | null {
  if (!call || typeof call !== 'object' || typeof call.method !== 'string') return 'Invalid JSON-RPC request';
  if (!ALLOWED.has(call.method)) return `Method ${call.method} is not allowed through Hatch's RPC proxy`;
  if (call.method === 'getProgramAccounts') {
    const program = Array.isArray(call.params) ? call.params[0] : null;
    if (program !== DBC_PROGRAM) return 'getProgramAccounts is only allowed for the Meteora DBC program';
  }
  return null;
}

const rpcError = (id: unknown, message: string, code = -32601) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(rpcError(null, 'Method not allowed', -32600));
  }
  // Same origin only: browsers always send Origin on POST. No CORS headers are ever set here.
  const origin = req.headers.origin;
  if (!origin || origin !== ownOrigin(req)) return res.status(403).json(rpcError(null, 'Origin not allowed', -32600));
  if (rateLimited(req, res, 'rpc', REQUESTS_PER_MINUTE, 60_000)) return;

  const body = req.body as RpcCall | RpcCall[];
  const batch = Array.isArray(body);
  const calls = batch ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) return res.status(400).json(rpcError(null, `Batch must have 1-${MAX_BATCH} calls`, -32600));

  const refused = calls.map(refusal);
  if (refused.some(Boolean)) {
    for (const r of refused) if (r) console.warn('rpc proxy refused:', r);
    const errors = calls.map((c, i) => (refused[i] ? rpcError(c?.id, refused[i]!) : rpcError(c?.id, 'Batch rejected: it contains a disallowed call', -32600)));
    return res.status(400).json(batch ? errors : errors[0]);
  }

  try {
    const upstream = await fetch(serverRpcUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    res.status(upstream.status).setHeader('content-type', 'application/json');
    return res.send(await upstream.text());
  } catch (e) {
    console.error('rpc proxy upstream failed:', e instanceof Error ? e.name : 'unknown'); // never log the URL
    return res.status(502).json(rpcError(batch ? null : (body as RpcCall).id, 'RPC upstream unavailable, try again', -32603));
  }
}
