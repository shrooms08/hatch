// Server-only: the links table. All writes that matter for "one coin per link" go through Postgres functions
// (reserve_link / mark_link_hatched / release_link in supabase/migrations), so concurrent requests cannot both win.
import { supabaseAdmin } from '@/lib/server/supabase';
import type { LinkKind } from '@/lib/links/canonical';

export type LinkNetwork = 'devnet' | 'mainnet';
export type LinkStatus = 'reserved' | 'hatched' | 'claimed' | 'disowned';

export type LinkRow = {
  network: LinkNetwork;
  canonical_id: string;
  id_hash: string;
  kind: LinkKind;
  display_url: string;
  title: string | null;
  image_url: string | null;
  owner_platform: string | null;
  owner_handle: string | null;
  owner_id: string | null;
  coin_name: string | null;
  coin_ticker: string | null;
  metadata_url: string | null;
  mint: string | null;
  pool: string | null;
  config: string | null;
  status: LinkStatus;
  hatched_by: string | null;
  first_buy_lamports: number | null;
  reserved_until: string | null;
  created_at: string;
  hatched_at: string | null;
  claimed_wallet: string | null;
  claimed_at: string | null;
  /** GitHub repos: the numeric repo id (unique per network). */
  github_repo_id: number | null;
};

/** The reservation collided with another row's unique key (e.g. the same GitHub repo under another name). */
export class LinkConflictError extends Error {}

/** How long a hatch reservation lasts. Longer than a blockhash lives (~60-90 s), so an expired one cannot still land. */
export const RESERVATION_SECONDS = 120;

export const isExpired = (r: Pick<LinkRow, 'status' | 'reserved_until'>, now = Date.now()) =>
  r.status === 'reserved' && !!r.reserved_until && new Date(r.reserved_until).getTime() < now;

function fail(op: string, error: { message?: string; code?: string } | null): never {
  // No row data and no query parameters in the message.
  throw new Error(`links ${op} failed${error?.code ? ` (${error.code})` : ''}`);
}

export async function getLink(network: LinkNetwork, canonicalId: string): Promise<LinkRow | null> {
  const { data, error } = await supabaseAdmin().from('links').select('*').eq('network', network).eq('canonical_id', canonicalId).maybeSingle();
  if (error) fail('get', error);
  return (data as LinkRow) ?? null;
}

export async function getLinkByMint(network: LinkNetwork, mint: string): Promise<LinkRow | null> {
  const { data, error } = await supabaseAdmin().from('links').select('*').eq('network', network).eq('mint', mint).maybeSingle();
  if (error) fail('get by mint', error);
  return (data as LinkRow) ?? null;
}

/** All links whose id_hash starts with the 8-hex `prefix` (the lookup API's anonymity set). */
export async function linksByPrefix(network: LinkNetwork, prefix: string): Promise<LinkRow[]> {
  if (!/^[0-9a-f]{8}$/.test(prefix)) throw new Error('bad prefix');
  const { data, error } = await supabaseAdmin().from('links').select('*').eq('network', network).like('id_hash', `${prefix}%`).limit(50);
  if (error) fail('prefix lookup', error);
  return (data as LinkRow[]) ?? [];
}

export async function getLinkByGithubRepoId(network: LinkNetwork, repoId: number): Promise<LinkRow | null> {
  const { data, error } = await supabaseAdmin().from('links').select('*').eq('network', network).eq('github_repo_id', repoId).maybeSingle();
  if (error) fail('get by github repo id', error);
  return (data as LinkRow) ?? null;
}

export type ReserveInput = Omit<LinkRow, 'status' | 'reserved_until' | 'created_at' | 'hatched_at' | 'claimed_wallet' | 'claimed_at'>;

/** Atomic: returns the new reservation, or null when the link is taken (hatched, or reserved by someone else). */
export async function reserveLink(row: ReserveInput, opts: { prevMint: string | null; ttlSeconds?: number }): Promise<LinkRow | null> {
  const { data, error } = await supabaseAdmin().rpc('reserve_link', {
    p_network: row.network,
    p_canonical_id: row.canonical_id,
    p_id_hash: row.id_hash,
    p_kind: row.kind,
    p_display_url: row.display_url,
    p_title: row.title,
    p_image_url: row.image_url,
    p_owner_platform: row.owner_platform,
    p_owner_handle: row.owner_handle,
    p_owner_id: row.owner_id,
    p_coin_name: row.coin_name,
    p_coin_ticker: row.coin_ticker,
    p_metadata_url: row.metadata_url,
    p_mint: row.mint,
    p_pool: row.pool,
    p_config: row.config,
    p_hatched_by: row.hatched_by,
    p_first_buy_lamports: row.first_buy_lamports,
    p_ttl_seconds: opts.ttlSeconds ?? RESERVATION_SECONDS,
    p_prev_mint: opts.prevMint,
    p_github_repo_id: row.github_repo_id,
  });
  if (error?.code === '23505') throw new LinkConflictError('unique key already taken');
  if (error) fail('reserve', error);
  const rows = (data as LinkRow[]) ?? [];
  return rows[0] ?? null;
}

export async function markHatched(network: LinkNetwork, canonicalId: string, mint: string): Promise<LinkRow | null> {
  const { data, error } = await supabaseAdmin().rpc('mark_link_hatched', { p_network: network, p_canonical_id: canonicalId, p_mint: mint });
  if (error) fail('mark hatched', error);
  return ((data as LinkRow[]) ?? [])[0] ?? null;
}

/** Releases an EXPIRED reservation for `mint` (the caller checked its pool never landed). */
export async function releaseExpired(network: LinkNetwork, canonicalId: string, mint: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('release_link', { p_network: network, p_canonical_id: canonicalId, p_mint: mint });
  if (error) fail('release', error);
  return ((data as LinkRow[]) ?? []).length > 0;
}

/** Drops a reservation this server just made, when building its transaction failed (before anyone could sign it). */
export async function dropOwnReservation(network: LinkNetwork, canonicalId: string, mint: string): Promise<void> {
  const { error } = await supabaseAdmin().from('links').delete().eq('network', network).eq('canonical_id', canonicalId).eq('mint', mint).eq('status', 'reserved');
  if (error) fail('drop reservation', error);
}
