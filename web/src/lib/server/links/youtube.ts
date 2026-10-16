// Server-only: "Verify with YouTube" for link coin claims (Google OAuth, state + PKCE S256, scope youtube.readonly).
//   1. videos.list (API key, 1 quota unit): the video's channel id. Not found: the video is private or deleted.
//   2. channels.list mine=true (the user's token, 1 unit): the channels this Google identity manages.
//   3. Owner if any of them is the video's channel. Identity = the channel id (permanent).
// The access token is used for step 2 and then dropped: never stored or logged.
import { b64url, newPkce } from './github';
import { youtubeOwnsVideo, YOUTUBE_REFUSAL } from '@/lib/links/ownerRule';
import type { OwnerTrust } from '@/lib/links/claimRules';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export { newPkce, b64url };

export function googleOAuthConfig(): { clientId: string; clientSecret: string; apiKey: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  return clientId && clientSecret && apiKey ? { clientId, clientSecret, apiKey } : null;
}

export function googleAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', YOUTUBE_SCOPE);
  u.searchParams.set('state', p.state);
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('access_type', 'online'); // no refresh token
  u.searchParams.set('prompt', 'select_account'); // lets the user pick a Brand Account
  u.searchParams.set('include_granted_scopes', 'false');
  return u.toString();
}

export class YoutubeVerifyError extends Error {}

type Fetch = typeof fetch;

/** YouTube API errors -> user-facing messages (quota, keys, outages). */
export function youtubeApiError(status: number, body: unknown): YoutubeVerifyError {
  const reason = (body as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason ?? '';
  if (status === 403 && /quotaExceeded|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded/.test(reason)) return new YoutubeVerifyError("YouTube's API limit is used up for now. Try again later (it resets daily).");
  if (status === 400 || status === 403) return new YoutubeVerifyError('YouTube verification is not set up correctly on this server.');
  if (status === 401) return new YoutubeVerifyError('Google sign-in expired. Try again.');
  return new YoutubeVerifyError('YouTube is not answering right now. Try again in a few minutes.');
}

/** videos.list: the channel that posted the video, or a refusal when it is private / deleted. */
export async function videoChannelId(videoId: string, apiKey: string, f: Fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await f(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new YoutubeVerifyError('YouTube is not answering right now. Try again in a few minutes.');
  }
  const body = (await res.json().catch((): null => null)) as { items?: { snippet?: { channelId?: string } }[] } | null;
  if (!res.ok) throw youtubeApiError(res.status, body);
  const channelId = body?.items?.[0]?.snippet?.channelId;
  if (!channelId) throw new YoutubeVerifyError("This video isn't public anymore, so it can't be verified right now");
  return channelId;
}

type Channel = { id: string; snippet?: { title?: string; customUrl?: string; publishedAt?: string }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } };

/** channels.list mine=true with the user's token. */
export async function myChannels(token: string, f: Fetch = fetch): Promise<Channel[]> {
  let res: Response;
  try {
    res = await f('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true&maxResults=50', { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new YoutubeVerifyError('YouTube is not answering right now. Try again in a few minutes.');
  }
  const body = (await res.json().catch((): null => null)) as { items?: Channel[] } | null;
  if (!res.ok) throw youtubeApiError(res.status, body);
  return body?.items ?? [];
}

export function channelTrust(c: Channel): OwnerTrust {
  const hidden = c.statistics?.hiddenSubscriberCount === true;
  const subs = Number(c.statistics?.subscriberCount);
  return {
    platform: 'youtube',
    accountCreatedAt: c.snippet?.publishedAt ?? null,
    followers: hidden || !Number.isFinite(subs) ? null : subs,
    followersHidden: hidden,
    stars: null,
    platformVerified: null, // the API has no verified-channel flag
    renamedOrTransferred: false,
    checkedAt: new Date().toISOString(),
  };
}

/** The whole check. Returns the channel identity + trust, or throws YoutubeVerifyError. */
export async function verifyYoutubeOwner(p: { code: string; verifier: string; redirectUri: string; videoId: string }, f: Fetch = fetch): Promise<{ accountId: string; login: string; trust: OwnerTrust }> {
  const cfg = googleOAuthConfig();
  if (!cfg) throw new YoutubeVerifyError('YouTube sign-in is not set up on this server yet');
  // The video's channel first (API key): a private or deleted video is refused before any sign-in data is used.
  const videoChannel = await videoChannelId(p.videoId, cfg.apiKey, f);
  const tokenRes = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code: p.code, code_verifier: p.verifier, grant_type: 'authorization_code', redirect_uri: p.redirectUri }).toString(),
    signal: AbortSignal.timeout(10_000),
  }).catch((): null => null);
  const tok = tokenRes ? ((await tokenRes.json().catch(() => ({}))) as { access_token?: string; scope?: string }) : {};
  let token: string | null = tok.access_token ?? null;
  if (!token) throw new YoutubeVerifyError('Google sign-in did not complete. Try again.');
  try {
    const channels = await myChannels(token, f);
    const rule = youtubeOwnsVideo({ videoChannelId: videoChannel, myChannels: channels });
    if ('reason' in rule) throw new YoutubeVerifyError(YOUTUBE_REFUSAL[rule.reason]);
    const ch = channels.find((c) => c.id === rule.channelId)!;
    return { accountId: ch.id, login: ch.snippet?.customUrl ?? ch.snippet?.title ?? ch.id, trust: channelTrust(ch) };
  } finally {
    token = null; // used for channels.list only; dropped here
  }
}
