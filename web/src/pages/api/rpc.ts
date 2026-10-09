// POST /api/rpc: the browser's Solana RPC. Forwards allowlisted JSON-RPC calls (single or a batch of
// up to 5) to the server-side RPC (HATCH_SERVER_RPC_URL), so the provider key never reaches the browser.
// Policy (lib/server/rpcPolicy.ts): method allowlist, getProgramAccounts only on the DBC program and
// only with filters, per-IP budget charged per call, bodies over 200 KB rejected. HTTP only (no
// websocket): the app confirms transactions by polling getSignatureStatuses. An upstream 429 is retried once
// after 200-500 ms (jittered) before it reaches the browser.
import type { NextApiRequest, NextApiResponse } from 'next';
import { serverRpcUrl } from '@/lib/config/network';
import { ownOrigin } from '@/lib/server/cors';
import { rateLimited } from '@/lib/server/rateLimit';
import { CALLS_PER_MINUTE, checkBody, type RpcCall } from '@/lib/server/rpcPolicy';

export const config = { api: { bodyParser: { sizeLimit: '200kb' } } };

const rpcError = (id: unknown, message: string, code = -32601) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(rpcError(null, 'Method not allowed', -32600));
  }
  // Same origin only. This is NOT authentication: any non-browser client can send a matching Origin
  // header. It only stops other websites from using this proxy from their visitors' browsers; the
  // real limits are the method allowlist, the filters rule and the per-IP budget below.
  const origin = req.headers.origin;
  if (!origin || origin !== ownOrigin(req)) return res.status(403).json(rpcError(null, 'Origin not allowed', -32600));

  const body = req.body as RpcCall | RpcCall[];
  const checked = checkBody(body);
  if (checked.ok === false) {
    if (!checked.perCall) return res.status(checked.status).json(rpcError(null, checked.error, -32600));
    for (const r of checked.perCall) if (r) console.warn('rpc proxy refused:', r);
    const calls = (Array.isArray(body) ? body : [body]) as RpcCall[];
    const errors = calls.map((c, i) => (checked.perCall![i] ? rpcError(c?.id, checked.perCall![i]!) : rpcError(c?.id, 'Batch rejected: it contains a disallowed call', -32600)));
    return res.status(400).json(Array.isArray(body) ? errors : errors[0]);
  }
  if (rateLimited(req, res, 'rpc', CALLS_PER_MINUTE, 60_000, checked.calls.length)) return;

  try {
    const send = () =>
      fetch(serverRpcUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    let upstream = await send();
    // The provider rate-limited us: retry once after a short jittered pause before passing the 429 on.
    if (upstream.status === 429) {
      await upstream.body?.cancel().catch((): undefined => undefined);
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 300)));
      upstream = await send();
    }
    res.status(upstream.status).setHeader('content-type', 'application/json');
    return res.send(await upstream.text());
  } catch (e) {
    console.error('rpc proxy upstream failed:', e instanceof Error ? e.name : 'unknown'); // never log the URL
    return res.status(502).json(rpcError(checked.batch ? null : (body as RpcCall).id, 'RPC upstream unavailable, try again', -32603));
  }
}
