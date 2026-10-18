// Server-only: "Verify with X" by post-a-code, using ONLY X's free public oEmbed (publish.x.com/oembed; the old
// publish.twitter.com host redirects there). No X API, no X OAuth, no keys.
//   1. issueXCode: a one-time "hatch-XXXX-XX" for this coin and this browser session (30 minutes, single use).
//   2. The owner posts the code from the X account that posted the original, and pastes the link to that post.
//   3. verifyXClaim: both fetched NOW from oEmbed: the original tweet's author, and the code post's author + text.
//      Pass only if the handles match, the text has the exact code, and the code post is newer than the code.
// Identity: the X handle at claim time (+ the code post URL as evidence). oEmbed gives no account details, so X
// claims always carry the amber label.
import { createHash, randomBytes } from 'node:crypto';
import { canonicalize } from '@/lib/links/canonical';
import { X_CODE_TTL_MS, X_REFUSAL, isXCode, xCodeFrom, xOwnerCheck, type OwnerTrust } from '@/lib/links/claimRules';
import { safeFetchBytes } from '@/lib/server/safeFetch';
import { decodeEntities } from './metadata';
import { LinkApiError } from './service';
import { claimNetwork, linkForClaim, parseMint } from './claims';
import { consumeXCode, getXCode, insertXCode } from './store';
import type { VerifiedId } from './claimCookie';

export const NOT_PUBLIC = "This post isn't public anymore, so it can't be verified right now";
const RETRY = "X isn't answering right now. Try again in a minute.";

export const sessionHash = (sessionId: string) => createHash('sha256').update(`hatch-x-session:${sessionId}`).digest('hex');

/** Fetches oEmbed JSON for a status. Returns null on 404 / 403 (deleted, private, protected). Throws on other failures. */
export type OembedFetch = (statusUrl: string) => Promise<{ author_url?: string; html?: string } | null>;

export const realOembed: OembedFetch = async (statusUrl) => {
  try {
    const buf = await safeFetchBytes(`https://publish.x.com/oembed?url=${encodeURIComponent(statusUrl)}&omit_script=true&dnt=true&hide_thread=true`, 256 * 1024);
    return JSON.parse(buf.toString('utf8')) as { author_url?: string; html?: string };
  } catch (e) {
    const status = Number((e instanceof Error ? e.message : '').match(/HTTP (\d{3})/)?.[1] ?? 0);
    if (status === 404 || status === 403 || status === 401) return null;
    throw new LinkApiError(503, RETRY);
  }
};

export const handleOf = (authorUrl: string | undefined) => authorUrl?.match(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?$/)?.[1] ?? null;
/** The post's text: the <p> inside the oEmbed blockquote, tags stripped, entities decoded. */
export const textOf = (html: string | undefined) => decodeEntities((html ?? '').match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]*>/g, ' ') ?? '');

export async function issueXCode(mintRaw: unknown, sessionId: string) {
  const network = claimNetwork();
  const mint = parseMint(mintRaw);
  const link = await linkForClaim(network, mint);
  if (link.kind !== 'x_post') throw new LinkApiError(400, 'This coin is not for an X post');
  if (link.status !== 'hatched') throw new LinkApiError(409, 'This coin was already claimed or disowned');
  const row = await insertXCode({ code: xCodeFrom(randomBytes(6)), network, mint, session_hash: sessionHash(sessionId), expires_at: new Date(Date.now() + X_CODE_TTL_MS).toISOString() });
  return { code: row.code, issuedAt: row.issued_at, expiresAt: row.expires_at };
}

export async function verifyXClaim(p: { mint: unknown; code: unknown; postUrl: unknown; sessionId: string }, oembed: OembedFetch = realOembed): Promise<VerifiedId> {
  const network = claimNetwork();
  const mint = parseMint(p.mint);
  const link = await linkForClaim(network, mint);
  if (link.kind !== 'x_post') throw new LinkApiError(400, 'This coin is not for an X post');
  if (link.status !== 'hatched') throw new LinkApiError(409, 'This coin was already claimed or disowned');
  if (!isXCode(p.code)) throw new LinkApiError(400, 'Get a code first, then post it');
  const code = p.code;
  const row = await getXCode(code);
  const sh = sessionHash(p.sessionId);
  if (!row || row.network !== network || row.mint !== mint || row.session_hash !== sh) throw new LinkApiError(400, 'That code is not for this coin or this browser. Get a new code.');
  if (row.used_at) throw new LinkApiError(400, 'That code was already used. Get a new code.');
  if (Date.parse(row.expires_at) <= Date.now()) throw new LinkApiError(400, 'That code expired. Get a new code.');

  let codePost;
  try {
    codePost = canonicalize(String(p.postUrl ?? ''));
  } catch {
    throw new LinkApiError(400, 'Paste the link to your X post (x.com/<you>/status/...)');
  }
  if (codePost.kind !== 'x_post') throw new LinkApiError(400, 'Paste the link to your X post (x.com/<you>/status/...)');
  const codePostId = codePost.canonicalId.slice('x:status:'.length);
  const originalId = link.canonical_id.slice('x:status:'.length);
  if (codePostId === originalId) throw new LinkApiError(400, 'Paste the link to the NEW post with your code, not the original.');

  // Both fetched now: never trust the handle stored at hatch time.
  const original = await oembed(`https://twitter.com/i/status/${originalId}`);
  if (!original) throw new LinkApiError(409, NOT_PUBLIC);
  const post = await oembed(`https://twitter.com/i/status/${codePostId}`);
  if (!post) throw new LinkApiError(400, "Couldn't open your post. Make sure it is public and the link is right, then try again.");
  const check = xOwnerCheck({ originalHandle: handleOf(original.author_url), codeHandle: handleOf(post.author_url), codeText: textOf(post.html), code, codePostId, issuedAtMs: Date.parse(row.issued_at) });
  if ('reason' in check) throw new LinkApiError(400, X_REFUSAL[check.reason]);

  const evidence = `https://x.com/${check.handle}/status/${codePostId}`;
  if (!(await consumeXCode({ code, network, mint, sessionHash: sh, postUrl: evidence }))) throw new LinkApiError(400, 'That code was already used or expired. Get a new code.');
  const trust: OwnerTrust = { platform: 'x', accountCreatedAt: null, followers: null, stars: null, platformVerified: null, renamedOrTransferred: false, checkedAt: new Date().toISOString() };
  return { mint, canonicalId: link.canonical_id, platform: 'x', accountId: check.handle.toLowerCase(), login: `@${check.handle}`, verifiedAt: new Date().toISOString(), exp: Date.now() + 30 * 60_000, trust, evidence };
}
