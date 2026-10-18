// Browser RPC resilience (lib/solana/rpcFetch) and the friendly "network busy" message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSY_MESSAGE, RETRY_DELAYS_MS, RpcBusyError, createRpcFetch } from '../src/lib/solana/rpcFetch.ts';
import { friendlyTxError, reportTxError } from '../src/lib/txErrors.ts';

const call = (method: string, id = 1, params: unknown = []) => ({ method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
const ok = (result: unknown, id = 1) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200 });
const status = (s: number) => new Response('{"jsonrpc":"2.0","error":{"code":429,"message":"Connection rate limits exceeded"}}', { status: s });

function harness(responses: (() => Response | Promise<Response>)[]) {
  const slept: number[] = [];
  let calls = 0;
  const f = createRpcFetch(
    async () => {
      const r = responses[Math.min(calls, responses.length - 1)]!;
      calls++;
      return r();
    },
    { sleep: async (ms) => void slept.push(ms) }
  );
  return { f, slept, calls: () => calls };
}

test('reads: 429 / 5xx / network errors are retried 3 times after 0.5 s, 1 s, 2 s', async () => {
  assert.deepEqual([...RETRY_DELAYS_MS], [500, 1000, 2000]);
  const h = harness([() => status(429), () => status(503), () => Promise.reject(new TypeError('Failed to fetch')), () => ok({ value: { blockhash: 'abc' } })]);
  const res = await h.f('/api/rpc', call('getLatestBlockhash'));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { result: { value: { blockhash: string } } }).result.value.blockhash, 'abc');
  assert.deepEqual(h.slept, [500, 1000, 2000]);
  assert.equal(h.calls(), 4);
});

test('reads: still failing after 3 retries -> RpcBusyError with the friendly message', async () => {
  const h = harness([() => status(429)]);
  await assert.rejects(() => h.f('/api/rpc', call('getAccountInfo')), (e: unknown) => e instanceof RpcBusyError && (e as Error).message === BUSY_MESSAGE);
  assert.equal(h.calls(), 4);
  // Other statuses (e.g. a 400 policy refusal) are passed through untouched, no retry.
  const g = harness([() => new Response('{"error":"no"}', { status: 400 })]);
  assert.equal((await g.f('/api/rpc', call('getAccountInfo'))).status, 400);
  assert.equal(g.calls(), 1);
});

test('sends are never retried: not after a 429, not after a network error (it may have been broadcast)', async () => {
  const h = harness([() => status(429), () => ok('sig')]);
  const res = await h.f('/api/rpc', call('sendTransaction'));
  assert.equal(res.status, 429);
  assert.equal(h.calls(), 1);
  assert.deepEqual(h.slept, []);
  const n = harness([() => Promise.reject(new TypeError('Failed to fetch')), () => ok('sig')]);
  await assert.rejects(() => n.f('/api/rpc', call('sendTransaction')), /Failed to fetch/);
  assert.equal(n.calls(), 1);
  // A batch that contains a send is not retried either.
  const b = harness([() => status(429)]);
  await b.f('/api/rpc', { method: 'POST', body: JSON.stringify([{ id: 1, method: 'getSlot' }, { id: 2, method: 'sendTransaction' }]) });
  assert.equal(b.calls(), 1);
});

test('identical reads in flight share one request; each caller gets its own id', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const f = createRpcFetch(async () => {
    calls++;
    await gate;
    return ok({ value: 7 }, 99);
  });
  const a = f('/api/rpc', call('getBalance', 1, ['W']));
  const b = f('/api/rpc', call('getBalance', 2, ['W']));
  const c = f('/api/rpc', call('getBalance', 3, ['X'])); // different params: its own request
  release();
  const [ra, rb] = await Promise.all([a, b, c]).then((rs) => Promise.all(rs.slice(0, 2).map((r) => r.json() as Promise<{ id: number; result: { value: number } }>)));
  assert.equal(calls, 2);
  assert.deepEqual([ra.id, rb.id, ra.result.value, rb.result.value], [1, 2, 7, 7]);
  // After it settles, a new call goes out again (no stale caching).
  await f('/api/rpc', call('getBalance', 4, ['W']));
  assert.equal(calls, 3);
});

test('friendly message: rate limits and RpcBusyError read "Network busy, try again in a few seconds."', () => {
  const raw = new Error('failed to get recent blockhash: Error: 429 : Connection rate limits exceeded');
  assert.deepEqual([friendlyTxError(raw).kind, friendlyTxError(raw).message], ['busy', 'Network busy, try again in a few seconds.']);
  assert.equal(friendlyTxError(new RpcBusyError(429)).kind, 'busy');
  assert.equal(friendlyTxError(new Error('failed to get recent blockhash: RpcBusyError: Network busy, try again in a few seconds')).kind, 'busy');
});

test('busy errors are logged as warnings (no dev error overlay); real failures stay errors', () => {
  const seen: string[] = [];
  const { warn, error } = console;
  console.warn = () => void seen.push('warn');
  console.error = () => void seen.push('error');
  try {
    reportTxError(new RpcBusyError(429), {}, 'buy');
    reportTxError(new Error('something else broke'), {}, 'buy');
  } finally {
    console.warn = warn;
    console.error = error;
  }
  assert.deepEqual(seen, ['warn', 'error']);
});
