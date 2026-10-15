// Server-only: link coins, end to end (prepare, hatch, confirm, lookup, by-mint). API routes are thin wrappers.
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { serverRpcUrl } from '@/lib/config/network';
import { LinkError, canonicalize, linkIdHash, type CanonicalLink } from '@/lib/links/canonical';
import { blockMessage, checkBlocked } from '@/lib/links/blocklist';
import { isValidName, isValidTicker, sanitizeName, sanitizeTicker, suggestCoin } from '@/lib/links/suggest';
import { IMAGE_EXT } from '@/lib/validation/launch';
import { ImageError, loadLaunchImage } from '@/lib/server/image';
import { renderFallbackPng } from '@/lib/server/fallbackImage';
import { isR2Configured, publicR2Url, uploadToR2 } from '@/lib/server/r2';
import { forgetSwr, swr } from '@/lib/server/swrCache';
import { toPoolLink as toPoolLinkRow, verifyListedLinks } from '@/lib/links/listing';
import { fetchPoolsByAddress, type HatchPool, type PoolLink } from '@/lib/dbc/pool';
import { linkConfigKeys } from '@/lib/presets';
import { loadHatchConfigs } from '@/lib/server/presets';
import { LinkMetadataError, linkMetadata, type LinkMetadata } from './metadata';
import { assertLinkConfig, buildLinkHatchTx, checkLinkPool, linkKeys, linkNetwork, maxFirstBuyLamports, maxFirstBuySol } from './chain';
import { LinkConflictError, dropOwnReservation, getLink, getLinkByGithubRepoId, getLinkByMint, isExpired, linksByPrefix, linksHatchedBy, listedLinks, markHatched, releaseExpired, reserveLink, type LinkNetwork, type LinkRow } from './store';

/** A failure with an HTTP status and a message safe to show users. */
export class LinkApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const connection = () => new Connection(serverRpcUrl(), 'confirmed');

function requireNetwork(): LinkNetwork {
  const n = linkNetwork();
  if (!n) throw new LinkApiError(404, 'Link coins are not available on this network yet');
  return n;
}

function canonical(url: unknown): CanonicalLink {
  try {
    const link = canonicalize(String(url ?? ''));
    const blocked = checkBlocked({ host: link.host, texts: [new URL(link.displayUrl).pathname] });
    if (blocked) throw new LinkApiError(422, blockMessage(blocked));
    return link;
  } catch (e) {
    if (e instanceof LinkError) throw new LinkApiError(400, e.message);
    throw e;
  }
}

/**
 * The row as it really is: an expired reservation whose transaction landed becomes hatched; one whose
 * transaction never landed is released (and the link is free again). Returns null when there is no coin.
 */
async function settle(network: LinkNetwork, row: LinkRow | null): Promise<LinkRow | null> {
  if (!row || !isExpired(row) || !row.mint) return row;
  if (!row.pool) {
    // Expired before its transaction was even built: nothing can have landed.
    await releaseExpired(network, row.canonical_id, row.mint);
    return null;
  }
  const { config, vault } = linkKeys();
  const check = await checkLinkPool(connection(), { pool: row.pool, mint: row.mint, config: row.config ? new PublicKey(row.config) : config, vault });
  if (check.exists && check.ok) return (await markHatched(network, row.canonical_id, row.mint)) ?? (await getLink(network, row.canonical_id));
  if (!check.exists) {
    await releaseExpired(network, row.canonical_id, row.mint);
    return null;
  }
  return row; // a pool exists but is not ours: leave it for a person to look at
}

const takenInfo = (r: LinkRow) => ({ mint: r.mint, pool: r.pool, status: r.status, name: r.coin_name, ticker: r.coin_ticker });
const reservedFor = (r: LinkRow) => Math.max(1, Math.ceil((new Date(r.reserved_until ?? 0).getTime() - Date.now()) / 1000));

function ownerFields(meta: LinkMetadata) {
  return { owner_platform: meta.owner.platform, owner_handle: meta.owner.handle, owner_id: meta.owner.id };
}

function blockedMeta(meta: LinkMetadata) {
  const b = checkBlocked({ texts: [meta.title, meta.snippet] });
  if (b) throw new LinkApiError(422, blockMessage(b));
}

/**
 * The link plus its metadata. GitHub answers for a renamed or transferred repo with its CURRENT owner/name
 * (it redirects), so the canonical id follows it: old and new names are one repository and get one coin.
 */
async function resolveLink(url: unknown): Promise<{ link: CanonicalLink; meta: LinkMetadata }> {
  const link = canonical(url);
  return { link, meta: await metadataOrFail(link) };
}

/** GitHub hatches need the numeric repo id (never hatched without it). */
export function githubRepoIdOrThrow(meta: Pick<LinkMetadata, 'githubRepoId'>): number {
  if (!meta.githubRepoId) throw new LinkApiError(503, 'Could not confirm the repository with GitHub right now. Try again in a few minutes.');
  return meta.githubRepoId;
}

/** Another row already holds this GitHub repo (same id, possibly under an older or newer name). */
async function githubTaken(network: LinkNetwork, link: CanonicalLink, meta: LinkMetadata): Promise<LinkRow | null> {
  if (link.kind !== 'github_repo') return null;
  const other = await settle(network, await getLinkByGithubRepoId(network, githubRepoIdOrThrow(meta)));
  return other && other.canonical_id !== link.canonicalId ? other : null;
}

async function metadataOrFail(link: CanonicalLink): Promise<LinkMetadata> {
  try {
    return await linkMetadata(link);
  } catch (e) {
    if (e instanceof LinkMetadataError) throw new LinkApiError(e.retryable ? 503 : 422, e.message);
    throw e;
  }
}

// ---------- prepare ----------

export async function prepareLink(body: { url?: unknown; firstBuySol?: unknown }) {
  const network = requireNetwork();
  const link = canonical(body.url);
  if (body.firstBuySol !== undefined && body.firstBuySol !== '') parseFirstBuy(body.firstBuySol); // reject over the cap early
  const idHash = await linkIdHash(link.canonicalId);
  const base = { canonicalId: link.canonicalId, idHash, kind: link.kind, displayUrl: link.displayUrl, maxFirstBuySol: maxFirstBuySol() };
  // Already taken under this exact link? Answer from the database without fetching anything.
  const row = await settle(network, await getLink(network, link.canonicalId));
  if (row && row.status !== 'reserved') return { ...base, exists: takenInfo(row) };
  if (row && row.status === 'reserved') return { ...base, reserved: { retryInSeconds: reservedFor(row) } };
  const { meta } = await resolveLink(body.url);
  // GitHub: the same repo under another name (renamed / transferred) already has its coin.
  const other = await githubTaken(network, link, meta);
  if (other) return other.status === 'reserved' ? { ...base, reserved: { retryInSeconds: reservedFor(other) } } : { ...base, exists: takenInfo(other) };
  blockedMeta(meta);
  const suggested = suggestCoin({ title: link.kind === 'github_repo' ? link.canonicalId.split('/')[1] : meta.title, fallback: meta.owner.handle ?? link.host });
  return { ...base, available: true as const, metadata: meta, suggested: { ...suggested, imageUrl: meta.imageUrl } };
}

// ---------- hatch ----------

function parseWallet(w: unknown): PublicKey {
  try {
    const k = new PublicKey(String(w ?? ''));
    if (!PublicKey.isOnCurve(k.toBytes())) throw new Error();
    return k;
  } catch {
    throw new LinkApiError(400, 'wallet is not a valid wallet address');
  }
}

function parseFirstBuy(v: unknown): number {
  const s = String(v ?? '0').trim();
  if (!/^\d*\.?\d+$/.test(s) || (s.split('.')[1]?.length ?? 0) > 9) throw new LinkApiError(400, 'firstBuySol must be a SOL amount like 0.05');
  const [int, frac = ''] = s.split('.');
  const lamports = Number(BigInt(int || '0') * 1_000_000_000n + BigInt((frac + '000000000').slice(0, 9)));
  if (lamports > maxFirstBuyLamports()) throw new LinkApiError(400, `The first buy is capped at ${maxFirstBuySol()} SOL`);
  return lamports;
}

export async function hatchLink(body: { url?: unknown; wallet?: unknown; name?: unknown; ticker?: unknown; imageUrl?: unknown; firstBuySol?: unknown }) {
  const network = requireNetwork();
  canonical(body.url); // reject bad links before anything else
  const payer = parseWallet(body.wallet);
  const name = sanitizeName(body.name);
  const ticker = sanitizeTicker(body.ticker);
  if (!isValidName(name)) throw new LinkApiError(400, 'Name must be 1-32 characters (letters, numbers, spaces and . , \' & ! ? -)');
  if (!isValidTicker(ticker)) throw new LinkApiError(400, 'Ticker must be 2-10 characters, A-Z and 0-9');
  const blocked = checkBlocked({ texts: [name, ticker] });
  if (blocked) throw new LinkApiError(422, blockMessage(blocked));
  const firstBuyLamports = parseFirstBuy(body.firstBuySol);
  if (!isR2Configured()) throw new LinkApiError(503, 'Uploads are not configured on this server');

  const { config, vault } = linkKeys();
  const conn = connection();
  await assertLinkConfig(conn, config);

  const { link, meta } = await resolveLink(body.url);
  // Taken? (an expired reservation is settled against the chain first: hatched if it landed, else released)
  const row = await settle(network, await getLink(network, link.canonicalId));
  if (row && row.status !== 'reserved') throw new LinkApiError(409, 'This link already has its coin', { exists: takenInfo(row) });
  if (row && row.status === 'reserved') throw new LinkApiError(409, 'Someone is hatching this link right now. Try again shortly.', { retryInSeconds: reservedFor(row) });
  const other = await githubTaken(network, link, meta);
  if (other && other.status !== 'reserved') throw new LinkApiError(409, 'This link already has its coin', { exists: takenInfo(other) });
  if (other) throw new LinkApiError(409, 'Someone is hatching this repository right now. Try again shortly.', { retryInSeconds: reservedFor(other) });
  const githubRepoId = link.kind === 'github_repo' ? githubRepoIdOrThrow(meta) : null;

  blockedMeta(meta);
  const idHash = await linkIdHash(link.canonicalId);
  const baseMint = Keypair.generate();
  const mint = baseMint.publicKey.toBase58();
  const metadataUrl = publicR2Url(`metadata/${mint}.json`);

  // Atomic: exactly one concurrent request for this link gets the reservation.
  const reserved = await reserveLink(
    {
      network,
      canonical_id: link.canonicalId,
      id_hash: idHash,
      kind: link.kind,
      display_url: link.displayUrl,
      title: meta.title,
      image_url: null,
      ...ownerFields(meta),
      coin_name: name,
      coin_ticker: ticker,
      metadata_url: metadataUrl,
      mint,
      pool: null,
      config: config.toBase58(),
      hatched_by: payer.toBase58(),
      first_buy_lamports: firstBuyLamports,
      github_repo_id: githubRepoId,
    },
    { prevMint: null }
  ).catch(async (e: unknown) => {
    if (!(e instanceof LinkConflictError)) throw e;
    // Same GitHub repo id under another name won the race.
    const winner = githubRepoId ? await getLinkByGithubRepoId(network, githubRepoId) : null;
    throw new LinkApiError(409, 'This link already has its coin', winner && winner.status !== 'reserved' ? { exists: takenInfo(winner) } : {});
  });
  if (!reserved) throw new LinkApiError(409, 'Someone else just started hatching this link. Try again shortly.');

  try {
    const source = typeof body.imageUrl === 'string' && body.imageUrl ? body.imageUrl : meta.imageUrl;
    const egg = () => ({ bytes: renderFallbackPng(ticker), contentType: 'image/png' as const });
    // An unusable thumbnail (too big, wrong type, unreachable) falls back to the Hatch egg art.
    const image = source ? await loadLaunchImage(source).catch((e: unknown) => (e instanceof ImageError || e instanceof Error ? egg() : Promise.reject(e))) : egg();
    const imageUrl = await uploadToR2(`images/${mint}.${IMAGE_EXT[image.contentType]}`, image.bytes, image.contentType);
    const description = `The official Hatch coin for ${link.displayUrl}. Its creator share of trading fees is held for the link's owner until they claim it. Not affiliated with or endorsed by the owner.`;
    await uploadToR2(
      `metadata/${mint}.json`,
      JSON.stringify({ name, symbol: ticker, description, image: imageUrl, external_url: link.displayUrl, hatch: { link: { canonicalId: link.canonicalId, kind: link.kind, owner: { platform: meta.owner.platform, handle: meta.owner.handle } } } }),
      'application/json'
    );
    const built = await buildLinkHatchTx({ connection: conn, config, vault, payer, baseMint, name, symbol: ticker, uri: metadataUrl, firstBuyLamports });
    // Record the pool and image on the reservation (same mint, so it is this request's row).
    const { supabaseAdmin } = await import('@/lib/server/supabase');
    await supabaseAdmin().from('links').update({ pool: built.pool, image_url: imageUrl }).eq('network', network).eq('canonical_id', link.canonicalId).eq('mint', mint).eq('status', 'reserved');
    return { canonicalId: link.canonicalId, ...built, reservedUntil: reserved.reserved_until };
  } catch (e) {
    await dropOwnReservation(network, link.canonicalId, mint).catch((): void => undefined);
    throw e;
  }
}

// ---------- confirm ----------

export async function confirmLink(body: { canonicalId?: unknown; signature?: unknown }) {
  const network = requireNetwork();
  const canonicalId = String(body.canonicalId ?? '');
  const signature = String(body.signature ?? '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) throw new LinkApiError(400, 'signature is invalid');
  const row = await getLink(network, canonicalId);
  if (!row || !row.mint || !row.pool) throw new LinkApiError(404, 'No hatch is pending for this link');
  if (row.status !== 'reserved') return { status: row.status, mint: row.mint, pool: row.pool };

  const conn = connection();
  const { config, vault } = linkKeys();
  // The signed transaction must have succeeded and touched this reservation's pool...
  const tx = await conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) throw new LinkApiError(409, 'The transaction is not confirmed yet. Try again in a few seconds.');
  if (tx.meta?.err) throw new LinkApiError(409, 'The transaction failed on chain');
  const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  if (!keys.includes(row.pool)) throw new LinkApiError(409, 'That transaction is not this link’s hatch');
  // ...and the pool must really be ours: LINK config, this mint, creator = the vault.
  const check = await checkLinkPool(conn, { pool: row.pool, mint: row.mint, config: row.config ? new PublicKey(row.config) : config, vault });
  if (!check.ok) throw new LinkApiError(409, `The pool does not check out: ${check.reason}`);
  const hatched = await markHatched(network, canonicalId, row.mint);
  // The new coin shows in the Hatches list on the next request (other server instances within 30 s).
  forgetSwr(listedKey(network));
  if (!hatched) {
    const now = await getLink(network, canonicalId);
    if (now?.status === 'hatched' && now.mint === row.mint) return { status: now.status, mint: now.mint, pool: now.pool };
    throw new LinkApiError(409, 'This reservation was replaced');
  }
  return { status: hatched.status, mint: hatched.mint, pool: hatched.pool };
}

// ---------- lookup (private: prefix only) ----------

export type LookupEntry = { h: string; status: LinkRow['status']; mint: string | null; ticker: string | null; name: string | null; progress: number | null; claimed: boolean };

export async function lookupPrefix(prefix: string): Promise<LookupEntry[]> {
  const network = requireNetwork();
  const { value } = await swr<LookupEntry[]>(`links:lookup:${network}:${prefix}`, 15_000, async () => {
    const rows = await linksByPrefix(network, prefix);
    const out: LookupEntry[] = [];
    const conn = connection();
    const { config, vault } = linkKeys();
    for (const r0 of rows) {
      const r = await settle(network, r0);
      if (!r) continue;
      const live = r.status === 'hatched' || r.status === 'claimed';
      const check = live && r.pool && r.mint ? await checkLinkPool(conn, { pool: r.pool, mint: r.mint, config: r.config ? new PublicKey(r.config) : config, vault, claimedWallet: r.claimed_wallet }).catch((): null => null) : null;
      out.push({ h: r.id_hash, status: r.status, mint: live ? r.mint : null, ticker: live ? r.coin_ticker : null, name: live ? r.coin_name : null, progress: check?.progress ?? null, claimed: r.status === 'claimed' });
    }
    return out;
  });
  return value;
}

// ---------- lists (Hatches, My Hatches) ----------

const listedKey = (network: LinkNetwork) => `links:listed:${network}`;

/**
 * Link coins for the public Hatches list, with their link: the pools the links table names (hatched or claimed),
 * read by address (no program scan), under the current or a legacy LINK config, and checked by verifyListedLinks
 * (same mint and pool, creator = the vault or the claimer). Pools other people create under the public LINK config
 * are never listed. Cached 30 s; confirmLink drops the cache so a new coin shows on the next request.
 * Empty where link coins are off (mainnet until its LINK config exists).
 */
export async function listedLinkPools(): Promise<HatchPool[]> {
  const network = linkNetwork();
  if (!network) return [];
  const { value } = await swr(listedKey(network), 30_000, async () => {
    const hc = loadHatchConfigs();
    const rows = await listedLinks(network);
    const pools = await fetchPoolsByAddress(connection(), [...new Set(rows.map((r) => r.pool).filter((p): p is string => !!p))], linkConfigKeys(hc), hc);
    const links = verifyListedLinks(pools, rows, linkKeys().vault.toBase58());
    return pools.filter((p) => links.has(p.baseMint)).map((p) => ({ ...p, link: links.get(p.baseMint)! }));
  });
  return value;
}

export type MyLinkHatch = { mint: string; pool: string; canonicalId: string; link: PoolLink; claimed: boolean };

/** Link coins this wallet hatched (it paid for the creation transaction). */
export async function linkHatchesFor(wallet: unknown): Promise<MyLinkHatch[]> {
  let address: string;
  try {
    address = new PublicKey(String(wallet ?? '')).toBase58();
  } catch {
    throw new LinkApiError(400, 'wallet is invalid');
  }
  const network = requireNetwork();
  const { value } = await swr(`links:hatched-by:${network}:${address}`, 15_000, async () =>
    (await linksHatchedBy(network, address)).map((r) => ({ mint: r.mint!, pool: r.pool!, canonicalId: r.canonical_id, link: toPoolLinkRow(r), claimed: r.status === 'claimed' }))
  );
  return value;
}

// ---------- by mint (token page) ----------

export async function linkForMint(mint: string) {
  const network = requireNetwork();
  const { value } = await swr(`links:mint:${network}:${mint}`, 30_000, async () => {
    const r = await getLinkByMint(network, mint);
    if (!r || (r.status !== 'hatched' && r.status !== 'claimed')) return null;
    return { canonicalId: r.canonical_id, kind: r.kind, displayUrl: r.display_url, title: r.title, ownerPlatform: r.owner_platform, ownerHandle: r.owner_handle, status: r.status, claimed: r.status === 'claimed' };
  });
  return value;
}
