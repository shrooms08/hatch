// Server-only: fetch an untrusted http(s) URL with SSRF guards — private/local hosts refused,
// redirects followed by hand (each hop re-checked), timeout, and a streamed size cap.

export class SafeFetchError extends Error {}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function isPrivateHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === '[::1]'
  );
}

function checkedUrl(url: string, base?: URL): URL {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    throw new SafeFetchError('URL is invalid');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new SafeFetchError('URL must be http(s)');
  if (isPrivateHost(parsed.hostname)) throw new SafeFetchError('URL host is not allowed');
  return parsed;
}

/** Downloads `url` and returns its bytes; throws SafeFetchError (message safe to show users). */
export async function safeFetchBytes(url: string, maxBytes: number): Promise<Buffer> {
  let target = checkedUrl(url);
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(() => {
      throw new SafeFetchError('Could not download the URL');
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      target = checkedUrl(location, target);
      continue;
    }
    break;
  }
  if (!res || (res.status >= 300 && res.status < 400)) throw new SafeFetchError('URL redirects too many times');
  if (!res.ok || !res.body) throw new SafeFetchError(`URL returned HTTP ${res.status}`);
  const tooLarge = `File is larger than ${Math.round(maxBytes / 1024 / 1024) || 1} MB`;
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new SafeFetchError(tooLarge);

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError(tooLarge);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
