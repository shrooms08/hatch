// Canonical link IDs: every link on the internet maps to ONE id, so it can have one official coin.
// Shared by the web app and the extension (extension/lib/linkCanonical.ts is a byte-for-byte copy, checked by a
// test). No imports, no I/O: hashing uses Web Crypto, available in browsers, extensions and Node.
//   x.com / twitter.com posts            -> x:status:<tweetId>
//   YouTube videos (watch, youtu.be, shorts, live, embed) -> yt:video:<videoId>
//   github.com/<owner>/<repo>[/...]      -> gh:repo:<owner>/<repo>   (lowercased)
//   any other http(s) page               -> web:<host without www>/<path>[?<non-tracking params, sorted>]

export type LinkKind = 'x_post' | 'youtube_video' | 'github_repo' | 'web_page';
export type LinkPlatform = 'x' | 'youtube' | 'github' | 'web';

export type CanonicalLink = {
  canonicalId: string;
  kind: LinkKind;
  platform: LinkPlatform;
  /** A clean URL for the link, shown to people and used to fetch its metadata. */
  displayUrl: string;
  /** Host without www (web pages: the owner is this domain). */
  host: string;
};

export class LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkError';
  }
}

export const MAX_LINK_LENGTH = 2048;

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com', 'm.twitter.com']);
const YT_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com']);
const GH_HOSTS = new Set(['github.com']);

/** First path segments on X that are app pages, never a post. */
const X_RESERVED = new Set(['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'login', 'logout', 'signup', 'i', 'compose', 'hashtag', 'account', 'tos', 'privacy', 'intent', 'share', 'jobs', 'premium']);
/** First path segments on GitHub that are not repositories. */
const GH_RESERVED = new Set(['login', 'logout', 'join', 'signup', 'session', 'sessions', 'settings', 'search', 'marketplace', 'explore', 'topics', 'trending', 'collections', 'notifications', 'orgs', 'organizations', 'sponsors', 'about', 'pricing', 'features', 'enterprise', 'new', 'codespaces', 'issues', 'pulls', 'events', 'apps', 'site', 'security', 'customer-stories', 'readme', 'team', 'contact', 'dashboard', 'watching', 'stars', 'account', 'password_reset', 'users', 'copilot', 'discussions']);

/** Query parameters that only track where a click came from (never ones that change the page, like ?s= or ?t=). */
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|li_fat_id|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|igshid|igsh|ref|ref_src|ref_url|si|spm|scid|ocid|cmpid|_ga|_gl|ns_.*|at_medium|at_campaign|rb_clickid|vero_id|wickedid|oly_anon_id|oly_enc_id|sr_share)$/i;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TWEET_ID = /^\d{1,20}$/;
const GH_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GH_REPO = /^[A-Za-z0-9._-]{1,100}$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function parse(input: string): URL {
  const raw = String(input ?? '').trim();
  if (!raw) throw new LinkError('Paste a link');
  if (raw.length > MAX_LINK_LENGTH) throw new LinkError('That link is too long');
  // "x.com/jack/status/20" without a scheme: assume https.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new LinkError('That is not a valid link');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new LinkError('Only http(s) links can be hatched');
  if (url.username || url.password) throw new LinkError('Links with a username or password cannot be hatched');
  if (url.href.length > MAX_LINK_LENGTH) throw new LinkError('That link is too long');
  return url;
}

function hostOf(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('[') || IPV4.test(host) || /^[0-9a-f:]+$/i.test(host)) throw new LinkError('Links to IP addresses cannot be hatched');
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa|test|invalid|example)$/.test(host) || !host.includes('.')) {
    throw new LinkError('That link points to a private or local address');
  }
  return host.replace(/^www\./, '');
}

const segments = (url: URL) => url.pathname.split('/').filter(Boolean);

function xPost(url: URL): CanonicalLink {
  const seg = segments(url);
  let id: string | undefined;
  let user: string | undefined;
  // /<user>/status/<id>[/photo/1|/analytics|/video/1...], /<user>/statuses/<id>, /i/web/status/<id>, /i/status/<id>
  if (seg[0] === 'i' && seg[1] === 'web' && seg[2] === 'status') id = seg[3];
  else if (seg[0] === 'i' && seg[1] === 'status') id = seg[2];
  else if (seg.length >= 3 && (seg[1] === 'status' || seg[1] === 'statuses') && !X_RESERVED.has((seg[0] ?? '').toLowerCase())) {
    user = seg[0];
    id = seg[2];
  }
  if (!id || !TWEET_ID.test(id)) throw new LinkError('Only X posts can be hatched (a link with /status/ in it)');
  return {
    canonicalId: `x:status:${id}`,
    kind: 'x_post',
    platform: 'x',
    displayUrl: user && /^[A-Za-z0-9_]{1,15}$/.test(user) ? `https://x.com/${user}/status/${id}` : `https://x.com/i/status/${id}`,
    host: 'x.com',
  };
}

function ytVideo(url: URL, host: string): CanonicalLink {
  const seg = segments(url);
  let id: string | null = null;
  if (host === 'youtu.be') id = seg[0] ?? null;
  else if (seg[0] === 'watch') id = url.searchParams.get('v');
  else if (['shorts', 'live', 'embed', 'v', 'e'].includes(seg[0] ?? '')) id = seg[1] ?? null;
  if (!id || !YT_ID.test(id)) throw new LinkError('Only YouTube videos can be hatched (watch, youtu.be, shorts or live links)');
  return { canonicalId: `yt:video:${id}`, kind: 'youtube_video', platform: 'youtube', displayUrl: `https://www.youtube.com/watch?v=${id}`, host: 'youtube.com' };
}

function ghRepo(url: URL): CanonicalLink {
  const seg = segments(url);
  const owner = seg[0];
  const repo = (seg[1] ?? '').replace(/\.git$/i, '');
  if (!owner || GH_RESERVED.has(owner.toLowerCase()) || !GH_OWNER.test(owner)) throw new LinkError('Only GitHub repositories can be hatched (github.com/owner/repo)');
  if (!repo || !GH_REPO.test(repo) || repo === '.' || repo === '..') throw new LinkError('Only GitHub repositories can be hatched (github.com/owner/repo)');
  const id = `${owner}/${repo}`.toLowerCase();
  return { canonicalId: `gh:repo:${id}`, kind: 'github_repo', platform: 'github', displayUrl: `https://github.com/${owner}/${repo}`, host: 'github.com' };
}

function webPage(url: URL, host: string): CanonicalLink {
  const port = url.port ? `:${url.port}` : '';
  const path = url.pathname.replace(/\/+$/, '');
  const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  const canonicalId = `web:${host}${port}${path}${query}`;
  if (canonicalId.length > 600) throw new LinkError('That link is too long');
  return { canonicalId, kind: 'web_page', platform: 'web', displayUrl: `https://${url.hostname.toLowerCase()}${port}${path || '/'}${query}`, host };
}

/** Throws LinkError (message safe to show) for links that cannot be hatched. */
export function canonicalize(input: string): CanonicalLink {
  const url = parse(input);
  const host = hostOf(url);
  // Any page on X or YouTube (including subdomains like accounts.youtube.com or help.x.com) must be a post /
  // a video; other pages there (login, settings, search, profiles) cannot be hatched.
  if (X_HOSTS.has(host) || /\.(x|twitter)\.com$/.test(host)) return xPost(url);
  if (YT_HOSTS.has(host) || host === 'youtu.be' || host.endsWith('.youtube.com')) return ytVideo(url, host);
  if (GH_HOSTS.has(host)) return ghRepo(url);
  return webPage(url, host);
}

/** sha256(canonicalId) as lowercase hex. */
export async function linkIdHash(canonicalId: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalId);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** What the lookup API is asked for: the first 8 hex chars of the hash, never the link itself. */
export const LOOKUP_PREFIX_LENGTH = 8;
export const lookupPrefix = (idHash: string) => idHash.slice(0, LOOKUP_PREFIX_LENGTH);
export const isLookupPrefix = (p: unknown): p is string => typeof p === 'string' && /^[0-9a-f]{8}$/.test(p);

/** The lookup API returns every link sharing the prefix; the client keeps only its exact hash. */
export function matchLookup<T extends { h: string }>(entries: readonly T[], idHash: string): T | null {
  return entries.find((e) => e.h === idHash) ?? null;
}
