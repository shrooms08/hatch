// What the browser may ask the /api/rpc proxy to forward (pure; unit-tested in scripts/test-security.mts).
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';

/** Max calls in one JSON-RPC batch. */
export const MAX_BATCH = 5;

/**
 * Per-IP budget, charged per call (not per HTTP request). A token page with a wallet connected uses
 * about 57 calls a minute while polling (measured on production, 2026-10-08); 240 is ~4x that, so a
 * few people sharing one Wi-Fi (one IP) do not hit 429 during normal use.
 */
export const CALLS_PER_MINUTE = 240;

/** Methods the web app (web3.js Connection + DBC SDK + wallet sends) actually calls. */
export const ALLOWED_METHODS = new Set([
  'getAccountInfo',
  'getMultipleAccounts',
  'getBalance',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getProgramAccounts', // DBC program only, and only with filters (see below)
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

export type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

/** getProgramAccounts must be narrowed by a memcmp and/or dataSize filter: no full-program scans. */
function hasNarrowingFilter(config: unknown): boolean {
  const filters = (config as { filters?: unknown } | null)?.filters;
  if (!Array.isArray(filters) || filters.length === 0) return false;
  return filters.some((f) => f && typeof f === 'object' && ('memcmp' in f || 'dataSize' in f));
}

/** Why a call is refused, or null when it may be forwarded. */
export function refusal(call: RpcCall): string | null {
  if (!call || typeof call !== 'object' || typeof call.method !== 'string') return 'Invalid JSON-RPC request';
  if (!ALLOWED_METHODS.has(call.method)) return `Method ${call.method} is not allowed through Hatch's RPC proxy`;
  if (call.method === 'getProgramAccounts') {
    const params = Array.isArray(call.params) ? call.params : [];
    if (params[0] !== DBC_PROGRAM) return 'getProgramAccounts is only allowed for the Meteora DBC program';
    if (!hasNarrowingFilter(params[1])) return 'getProgramAccounts needs a memcmp or dataSize filter';
  }
  return null;
}

/** Checks a whole request body: batch size, then each call. */
export function checkBody(body: unknown): { ok: true; calls: RpcCall[]; batch: boolean } | { ok: false; status: number; error: string; perCall?: (string | null)[] } {
  const batch = Array.isArray(body);
  const calls = (batch ? body : [body]) as RpcCall[];
  if (calls.length === 0 || calls.length > MAX_BATCH) return { ok: false, status: 400, error: `Batch must have 1-${MAX_BATCH} calls` };
  const perCall = calls.map(refusal);
  if (perCall.some(Boolean)) return { ok: false, status: 400, error: 'Request contains a disallowed call', perCall };
  return { ok: true, calls, batch };
}
