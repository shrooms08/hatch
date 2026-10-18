// Server-only: who owns a link and what it is, fetched through safeFetch (SSRF-guarded, size-capped).
//   x_post:        X oEmbed (publish.twitter.com/oembed): author name + handle, text snippet
//   youtube_video: YouTube oEmbed: title, channel name + url, thumbnail
//   github_repo:   GitHub REST /repos/{owner}/{repo} (unauthenticated): owner login + id, description, avatar
//   web_page:      the page's <title> / og:title and og:image; the owner is the domain
// Cached 1 hour per canonical id (failures are not cached).
import { safeFetchBytes, SafeFetchError } from '@/lib/server/safeFetch';
import { swr } from '@/lib/server/swrCache';
import type { CanonicalLink } from '@/lib/links/canonical';

export type LinkMetadata = {
  title: string | null;
  /** A short text snippet (X post text, repo description, page description). */
  snippet: string | null;
  imageUrl: string | null;
  owner: { platform: 'x' | 'youtube' | 'github' | 'web'; handle: string | null; name: string | null; id: string | null; url: string | null };
  /** GitHub only: the repository's numeric id, which survives renames and transfers. */
  githubRepoId?: number | null;
};

export class LinkMetadataError extends Error {
  constructor(
    message: string,
    /** True when trying again later may work (rate limits, timeouts, 5xx). */
    readonly retryable = false
  ) {
    super(message);
  }
}

/** How a failed metadata fetch is reported. GitHub's unauthenticated API answers 403/429 when rate limited. */
export function classifyFetchError(e: unknown, platform: 'x' | 'youtube' | 'github' | 'web'): LinkMetadataError {
  const msg = e instanceof Error ? e.message : '';
  const status = Number(msg.match(/HTTP (\d{3})/)?.[1] ?? 0);
  if (platform === 'github' && (status === 403 || status === 429)) return new LinkMetadataError('GitHub is limiting requests right now. Try again in a few minutes.', true);
  if (status === 404 || status === 401 || (status === 403 && platform !== 'github')) return new LinkMetadataError('That link is private, deleted, or not found');
  if (status >= 500 || /timed out|Could not download/i.test(msg)) return new LinkMetadataError(`${platform === 'github' ? 'GitHub' : 'The site'} is not answering right now. Try again in a few minutes.`, true);
  if (e instanceof SafeFetchError) return new LinkMetadataError(`Could not read the link (${msg})`);
  return new LinkMetadataError('Could not read the link', true);
}

const TTL_MS = 60 * 60_000;
const JSON_MAX = 512 * 1024;
const HTML_MAX = 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith('#')) return ENTITIES[k] ?? String.fromCodePoint(parseInt(k.slice(1), 10) || 32);
    return ENTITIES[k] ?? m;
  });
}
const clean = (s: string | null | undefined, max: number) => {
  if (!s) return null;
  const t = decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return t ? [...t].slice(0, max).join('') : null;
};

async function getJson(url: string, platform: 'x' | 'youtube' | 'github'): Promise<Record<string, unknown>> {
  try {
    return JSON.parse((await safeFetchBytes(url, JSON_MAX)).toString('utf8')) as Record<string, unknown>;
  } catch (e) {
    throw classifyFetchError(e, platform);
  }
}

async function xPost(link: CanonicalLink): Promise<LinkMetadata> {
  const id = link.canonicalId.split(':')[2];
  const j = await getJson(`https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/i/status/${id}`)}&omit_script=true&dnt=true&hide_thread=true`, 'x');
  const authorUrl = typeof j.author_url === 'string' ? j.author_url : null;
  const handle = authorUrl?.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?$/)?.[1] ?? null;
  // The oEmbed html is a <blockquote><p>text</p>— author (@handle) date</blockquote>: keep the <p> text.
  const html = typeof j.html === 'string' ? j.html : '';
  const text = clean(html.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '', 280);
  return {
    title: text ? clean(text, 120) : handle ? `Post by @${handle}` : 'X post',
    snippet: text,
    imageUrl: null,
    owner: { platform: 'x', handle: handle ? `@${handle}` : null, name: clean(typeof j.author_name === 'string' ? j.author_name : null, 80), id: null, url: authorUrl },
  };
}

async function ytVideo(link: CanonicalLink): Promise<LinkMetadata> {
  const j = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.displayUrl)}`, 'youtube');
  const authorUrl = typeof j.author_url === 'string' ? j.author_url : null;
  const handle = authorUrl?.match(/youtube\.com\/(@[A-Za-z0-9._-]{1,100})/)?.[1] ?? null;
  const channelId = authorUrl?.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1] ?? null;
  return {
    title: clean(typeof j.title === 'string' ? j.title : null, 150),
    snippet: null,
    imageUrl: typeof j.thumbnail_url === 'string' ? j.thumbnail_url : null,
    owner: { platform: 'youtube', handle, name: clean(typeof j.author_name === 'string' ? j.author_name : null, 80), id: channelId, url: authorUrl },
  };
}

async function ghRepo(link: CanonicalLink): Promise<LinkMetadata> {
  const [owner, repo] = link.canonicalId.slice('gh:repo:'.length).split('/');
  const j = await getJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, 'github');
  const o = (j.owner ?? {}) as Record<string, unknown>;
  const repoId = typeof j.id === 'number' && Number.isSafeInteger(j.id) && j.id > 0 ? j.id : null;
  if (!repoId) throw new LinkMetadataError('GitHub did not return the repository id. Try again in a few minutes.', true);
  const fullName = typeof j.full_name === 'string' ? j.full_name : `${owner}/${repo}`;
  return {
    title: fullName,
    snippet: clean(typeof j.description === 'string' ? j.description : null, 280),
    imageUrl: typeof o.avatar_url === 'string' ? o.avatar_url : null,
    owner: { platform: 'github', handle: typeof o.login === 'string' ? o.login : owner, name: null, id: o.id != null ? String(o.id) : null, url: typeof o.html_url === 'string' ? o.html_url : null },
    githubRepoId: repoId,
  };
}

const metaContent = (html: string, attr: 'property' | 'name', key: string) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0] ?? '';
  return tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
};

async function webPage(link: CanonicalLink): Promise<LinkMetadata> {
  let html: string;
  try {
    html = (await safeFetchBytes(link.displayUrl, HTML_MAX)).toString('utf8').slice(0, 400_000);
  } catch (e) {
    throw classifyFetchError(e, 'web');
  }
  const title = clean(metaContent(html, 'property', 'og:title') ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null, 150);
  const rawImage = metaContent(html, 'property', 'og:image') ?? metaContent(html, 'name', 'twitter:image');
  let imageUrl: string | null = null;
  try {
    imageUrl = rawImage ? new URL(decodeEntities(rawImage), link.displayUrl).toString() : null;
  } catch {
    imageUrl = null;
  }
  if (imageUrl && !/^https?:/.test(imageUrl)) imageUrl = null;
  return {
    title,
    snippet: clean(metaContent(html, 'property', 'og:description') ?? metaContent(html, 'name', 'description'), 280),
    imageUrl,
    owner: { platform: 'web', handle: link.host, name: clean(metaContent(html, 'property', 'og:site_name'), 80), id: link.host, url: `https://${link.host}` },
  };
}

export async function linkMetadata(link: CanonicalLink): Promise<LinkMetadata> {
  const { value } = await swr<LinkMetadata>(`linkmeta:${link.canonicalId}`, TTL_MS, () =>
    link.kind === 'x_post' ? xPost(link) : link.kind === 'youtube_video' ? ytVideo(link) : link.kind === 'github_repo' ? ghRepo(link) : webPage(link)
  );
  return value;
}
