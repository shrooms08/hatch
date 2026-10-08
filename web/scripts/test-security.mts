// Unit tests for the audit fixes. Run: pnpm test:security
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, Keypair } from '@solana/web3.js';
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { MintExistsError, assertMintIsNew } from '../src/lib/server/launchGuards.ts';
import { putObjectCommand } from '../src/lib/server/r2.ts';
import { MAX_BATCH, checkBody, refusal } from '../src/lib/server/rpcPolicy.ts';
import { memoAsync } from '../src/lib/cache/memoAsync.ts';
import { isBlockedAddress } from '../src/lib/server/safeFetch.ts';
import { rateLimited } from '../src/lib/server/rateLimit.ts';

const DBC = DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58();

// ---- /api/upload ----
test('upload: a mint that already exists on chain is refused (409 path)', async () => {
  const existing = { getAccountInfo: async () => ({ lamports: 1, data: Buffer.alloc(82), owner: PublicKey.default, executable: false }) };
  await assert.rejects(assertMintIsNew(existing as never, Keypair.generate().publicKey), MintExistsError);
});

test('upload: a brand-new mint passes', async () => {
  const fresh = { getAccountInfo: async () => null };
  await assertMintIsNew(fresh as never, Keypair.generate().publicKey);
});

test('upload: every R2 put is create-only (IfNoneMatch: *)', () => {
  const cmd = putObjectCommand('bucket', 'metadata/x.json', '{}', 'application/json');
  assert.equal(cmd.input.IfNoneMatch, '*');
});

// ---- /api/rpc ----
const call = (method: string, params?: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, params });

test(`rpc: batches are capped at ${MAX_BATCH} calls`, () => {
  assert.equal(checkBody(Array.from({ length: MAX_BATCH }, (_, i) => call('getSlot', [], i))).ok, true);
  const tooMany = checkBody(Array.from({ length: MAX_BATCH + 1 }, (_, i) => call('getSlot', [], i)));
  assert.equal(tooMany.ok, false);
  assert.equal(checkBody([]).ok, false);
});

test('rpc: getProgramAccounts without filters is rejected', () => {
  assert.match(refusal(call('getProgramAccounts', [DBC])) ?? '', /filter/);
  assert.match(refusal(call('getProgramAccounts', [DBC, { encoding: 'base64' }])) ?? '', /filter/);
  assert.match(refusal(call('getProgramAccounts', [DBC, { filters: [] }])) ?? '', /filter/);
});

test('rpc: getProgramAccounts is allowed on the DBC program with memcmp or dataSize', () => {
  assert.equal(refusal(call('getProgramAccounts', [DBC, { filters: [{ memcmp: { offset: 72, bytes: DBC } }] }])), null);
  assert.equal(refusal(call('getProgramAccounts', [DBC, { filters: [{ dataSize: 424 }] }])), null);
});

test('rpc: getProgramAccounts on other programs and unknown methods are rejected', () => {
  assert.match(refusal(call('getProgramAccounts', ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', { filters: [{ dataSize: 165 }] }])) ?? '', /DBC/);
  assert.match(refusal(call('requestAirdrop', [])) ?? '', /not allowed/);
  const mixed = checkBody([call('getSlot'), call('getTransaction', ['x'], 2)]);
  assert.equal(mixed.ok, false);
});

test('rpc: the rate limit is charged per call in a batch', () => {
  const req = { headers: { 'x-forwarded-for': '198.51.100.7' }, socket: {} } as never;
  const res = { setHeader() {}, status() { return this; }, json() { return this; } } as never;
  assert.equal(rateLimited(req, res, 'rpc-test', 10, 60_000, 5), false); // 5 of 10
  assert.equal(rateLimited(req, res, 'rpc-test', 10, 60_000, 5), false); // 10 of 10
  assert.equal(rateLimited(req, res, 'rpc-test', 10, 60_000, 1), true); // 11 > 10
});

// ---- quoteInfoCache ----
test('quote info cache: a failed lookup is not cached and is retried', async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  const load = async () => {
    calls++;
    if (calls === 1) throw new Error('RPC 503');
    return 'mint-info';
  };
  await assert.rejects(memoAsync(cache, 'NVDAx', load), /RPC 503/);
  assert.equal(cache.has('NVDAx'), false);
  assert.equal(await memoAsync(cache, 'NVDAx', load), 'mint-info');
  assert.equal(await memoAsync(cache, 'NVDAx', load), 'mint-info');
  assert.equal(calls, 2); // the success is cached
});

// ---- SSRF ----
test('safeFetch: private, loopback, link-local, ULA, mapped and CGNAT addresses are blocked', () => {
  for (const a of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fc12::5', 'fe80::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::7f00:1']) {
    assert.equal(isBlockedAddress(a), true, a);
  }
  for (const a of ['8.8.8.8', '1.1.1.1', '104.18.0.1', '2606:4700::1111']) assert.equal(isBlockedAddress(a), false, a);
});
