// The browser Connection's fetch: resilient against rate limits without ever double-sending.
//  - Reads (and getLatestBlockhash, simulateTransaction, status polls): on HTTP 429 / 502 / 503 / 504 or a network
//    error, retried up to 3 times after 0.5 s, 1 s and 2 s. Still failing: RpcBusyError ("Network busy, ...").
//  - sendTransaction: ONE attempt, never retried (a request that errored may still have been broadcast).
//  - Identical single read calls in flight at the same time share one request (each caller gets its own id back).
// web3.js's own 429 retry is turned off on the Connection (disableRetryOnRateLimit) so this is the only policy.

export const RETRY_DELAYS_MS = [500, 1000, 2000] as const;
export const NEVER_RETRY = new Set(['sendTransaction']);
const RETRY_STATUS = new Set([429, 502, 503, 504]);

export const BUSY_MESSAGE = 'Network busy, try again in a few seconds';

export class RpcBusyError extends Error {
  constructor(readonly status: number | null) {
    super(BUSY_MESSAGE);
    this.name = 'RpcBusyError';
  }
}

type Call = { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function parse(body: RequestInit['body']): Call | Call[] | null {
  if (typeof body !== 'string') return null;
  try {
    return JSON.parse(body) as Call | Call[];
  } catch {
    return null;
  }
}

export function createRpcFetch(base: FetchLike, opts: { sleep?: (ms: number) => Promise<void>; delays?: readonly number[] } = {}): FetchLike {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  const inflight = new Map<string, Promise<{ status: number; text: string }>>();

  /** One request with retries (reads only). Resolves with a non-retryable response, or throws RpcBusyError. */
  async function withRetry(input: string, init: RequestInit | undefined, retry: boolean): Promise<{ status: number; text: string }> {
    let lastStatus: number | null = null;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await base(input, init);
        if (!retry || !RETRY_STATUS.has(res.status)) return { status: res.status, text: await res.text() };
        lastStatus = res.status;
        await res.body?.cancel().catch((): undefined => undefined);
      } catch (e) {
        if (!retry) throw e; // a send that errored may have been broadcast: never resend, let the caller decide
        lastStatus = null;
      }
      if (attempt >= delays.length) throw new RpcBusyError(lastStatus);
      await sleep(delays[attempt]!);
    }
  }

  return async (input, init) => {
    const body = parse(init?.body);
    const calls = body == null ? [] : Array.isArray(body) ? body : [body];
    const retry = calls.length > 0 && !calls.some((c) => NEVER_RETRY.has(String(c.method)));
    // Share identical single reads that are already in flight.
    if (retry && body && !Array.isArray(body)) {
      const key = `${body.method}:${JSON.stringify(body.params ?? null)}`;
      let p = inflight.get(key);
      if (!p) {
        p = withRetry(input, init, true).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      const { status, text } = await p;
      let out = text;
      try {
        const json = JSON.parse(text) as { id?: unknown };
        if (json && typeof json === 'object' && !Array.isArray(json)) out = JSON.stringify({ ...json, id: body.id });
      } catch {
        /* not JSON: pass through */
      }
      return new Response(out, { status, headers: { 'content-type': 'application/json' } });
    }
    const { status, text } = await withRetry(input, init, retry);
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  };
}
