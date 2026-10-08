// Server-only: fetch an untrusted http(s) URL with SSRF guards. The hostname is resolved here, every
// resolved address must be public (no private, loopback, link-local, ULA, IPv4-mapped IPv6, NAT64 or
// CGNAT ranges), and the socket connects to the address that was checked (no second DNS lookup, so
// DNS rebinding cannot swap in a private IP). Redirects are followed by hand and re-checked, with a
// timeout and a streamed size cap.
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export class SafeFetchError extends Error {}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

// Separate lists: a single BlockList also matches IPv4 addresses against IPv6 rules (as ::ffff:a.b.c.d).
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const)
  blocked4.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local (includes fd00::/8)
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const)
  blocked6.addSubnet(net, prefix, 'ipv6');

/** True when `address` (an IP literal) is not a public unicast address. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked4.check(address, 'ipv4');
  // IPv4-mapped / -compatible IPv6 (::ffff:a.b.c.d, ::a.b.c.d) would bypass the IPv4 rules: refuse.
  if (family === 6) return /^::(ffff:)?(\d+\.\d+\.\d+\.\d+|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/i.test(address) || blocked6.check(address, 'ipv6');
  return true; // not an IP at all
}

/** DNS lookup that only ever hands the socket a checked, public address. */
const checkedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new SafeFetchError('URL host is not allowed'), { code: 'EBLOCKED' }), '', 4);
    }
    const pick = addresses[0];
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof addresses) => void)(null, [pick]);
    callback(null, pick.address, pick.family);
  });
};

function checkedUrl(url: string, base?: URL): URL {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    throw new SafeFetchError('URL is invalid');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new SafeFetchError('URL must be http(s)');
  if (parsed.username || parsed.password) throw new SafeFetchError('URL must not contain credentials');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new SafeFetchError('URL host is not allowed');
  }
  if (isIP(host) && isBlockedAddress(host)) throw new SafeFetchError('URL host is not allowed');
  return parsed;
}

type Head = { status: number; location: string | null; contentLength: number; res: http.IncomingMessage };

function request(target: URL): Promise<Head> {
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(target, { lookup: checkedLookup, timeout: FETCH_TIMEOUT_MS, headers: { 'user-agent': 'HatchBot/1.0 (+https://hatchfun.vercel.app)' } }, (res) =>
      resolve({
        status: res.statusCode ?? 0,
        location: typeof res.headers.location === 'string' ? res.headers.location : null,
        contentLength: Number(res.headers['content-length'] ?? 0),
        res,
      })
    );
    req.on('timeout', () => req.destroy(new SafeFetchError('Download timed out')));
    req.on('error', (e) => reject(e instanceof SafeFetchError ? e : new SafeFetchError((e as { code?: string }).code === 'EBLOCKED' ? 'URL host is not allowed' : 'Could not download the URL')));
  });
}

/** Downloads `url` and returns its bytes; throws SafeFetchError (message safe to show users). */
export async function safeFetchBytes(url: string, maxBytes: number): Promise<Buffer> {
  let target = checkedUrl(url);
  let head: Head | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    head = await request(target);
    if (head.status >= 300 && head.status < 400 && head.location) {
      head.res.resume();
      target = checkedUrl(head.location, target);
      continue;
    }
    break;
  }
  if (!head || (head.status >= 300 && head.status < 400)) throw new SafeFetchError('URL redirects too many times');
  if (head.status < 200 || head.status >= 300) {
    head.res.resume();
    throw new SafeFetchError(`URL returned HTTP ${head.status}`);
  }
  const tooLarge = `File is larger than ${Math.round(maxBytes / 1024 / 1024) || 1} MB`;
  if (head.contentLength > maxBytes) {
    head.res.destroy();
    throw new SafeFetchError(tooLarge);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of head.res as AsyncIterable<Buffer>) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      head.res.destroy();
      throw new SafeFetchError(tooLarge);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
