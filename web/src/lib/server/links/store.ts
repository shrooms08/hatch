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
  owner_verified_id?: string | null;
  owner_verified_at?: string | null;
  owner_trust?: import('@/lib/links/claimRules').OwnerTrust | null;
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

const LISTED_COLUMNS = 'canonical_id, kind, mint, pool, status, title, display_url, owner_platform, owner_handle, hatched_by, claimed_wallet, hatched_at';
export type ListedLinkRow = Pick<LinkRow, 'canonical_id' | 'kind' | 'mint' | 'pool' | 'status' | 'title' | 'display_url' | 'owner_platform' | 'owner_handle' | 'hatched_by' | 'claimed_wallet'> & { hatched_at: string | null };

/** Every live link coin on a network (hatched or claimed), for the public Hatches list. */
export async function listedLinks(network: LinkNetwork): Promise<ListedLinkRow[]> {
  const { data, error } = await supabaseAdmin().from('links').select(LISTED_COLUMNS).eq('network', network).in('status', ['hatched', 'claimed', 'disowned']).not('mint', 'is', null).limit(5000);
  if (error) fail('listed links', error);
  return (data as ListedLinkRow[]) ?? [];
}

/** Live link coins a wallet hatched (paid for: the creation transaction's fee payer, stored at hatch time). */
export async function linksHatchedBy(network: LinkNetwork, wallet: string): Promise<ListedLinkRow[]> {
  const { data, error } = await supabaseAdmin().from('links').select(LISTED_COLUMNS).eq('network', network).eq('hatched_by', wallet).in('status', ['hatched', 'claimed', 'disowned']).not('mint', 'is', null).limit(200);
  if (error) fail('links hatched by', error);
  return (data as ListedLinkRow[]) ?? [];
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

// ---------- claims (P4a) ----------

export type ClaimStatus = 'pending' | 'proposed' | 'approved' | 'executed' | 'rejected' | 'failed';
export type ClaimRow = {
  id: string;
  network: LinkNetwork;
  canonical_id: string;
  mint: string | null;
  platform: string;
  action: 'claim' | 'disown';
  account_id: string;
  account_login: string | null;
  verified_handle: string | null;
  verified_at: string;
  owner_wallet: string;
  destination: string;
  squads_proposal: string | null;
  transaction_index: number | null;
  held_lamports: number | null;
  received_lamports: number | null;
  propose_signatures: string[];
  approve_signature: string | null;
  execute_signature: string | null;
  status: ClaimStatus;
  error: string | null;
  created_at: string;
  executed_at: string | null;
  destination_message: string | null;
  destination_signature: string | null;
  nonce: string | null;
  trust: import('@/lib/links/claimRules').OwnerTrust | null;
  timelock_until: string | null;
  evidence_url: string | null;
};

/** Another claim for this link is already open (pending, proposed or approved). */
export class ClaimOpenError extends Error {}

export type NewClaim = Pick<ClaimRow, 'network' | 'canonical_id' | 'mint' | 'platform' | 'action' | 'account_id' | 'account_login' | 'verified_at' | 'destination'> &
  Partial<Pick<ClaimRow, 'destination_message' | 'destination_signature' | 'nonce' | 'trust' | 'evidence_url'>>;

export async function insertClaim(c: NewClaim): Promise<ClaimRow> {
  const { data, error } = await supabaseAdmin()
    .from('claims')
    .insert({ ...c, verified_handle: c.account_login, owner_wallet: c.destination, status: 'pending' })
    .select('*')
    .single();
  if (error?.code === '23505') throw new ClaimOpenError('A claim for this coin is already open');
  if (error) fail('insert claim', error);
  return data as ClaimRow;
}

/** Updates a claim. `from` guards the transition (only rows currently in one of these states change). */
export async function updateClaim(id: string, patch: Partial<Omit<ClaimRow, 'id' | 'destination' | 'action'>>, from?: ClaimStatus[]): Promise<ClaimRow | null> {
  let q = supabaseAdmin().from('claims').update(patch).eq('id', id);
  if (from) q = q.in('status', from);
  const { data, error } = await q.select('*').maybeSingle();
  if (error) fail('update claim', error);
  return (data as ClaimRow) ?? null;
}

export async function getClaim(id: string): Promise<ClaimRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data, error } = await supabaseAdmin().from('claims').select('*').eq('id', id).maybeSingle();
  if (error) fail('get claim', error);
  return (data as ClaimRow) ?? null;
}

export async function claimsForLink(network: LinkNetwork, canonicalId: string): Promise<ClaimRow[]> {
  const { data, error } = await supabaseAdmin().from('claims').select('*').eq('network', network).eq('canonical_id', canonicalId).order('created_at', { ascending: false }).limit(20);
  if (error) fail('claims for link', error);
  return (data as ClaimRow[]) ?? [];
}

export async function claimsByStatus(network: LinkNetwork, statuses: ClaimStatus[], limit = 100): Promise<ClaimRow[]> {
  const { data, error } = await supabaseAdmin().from('claims').select('*').eq('network', network).in('status', statuses).order('created_at', { ascending: false }).limit(limit);
  if (error) fail('claims by status', error);
  return (data as ClaimRow[]) ?? [];
}

export type ClaimLogEntry = {
  network: LinkNetwork;
  claim_id: string | null;
  canonical_id: string;
  event: string;
  platform?: string | null;
  account_id?: string | null;
  account_login?: string | null;
  destination?: string | null;
  proposal?: string | null;
  signatures?: string[];
  detail?: Record<string, unknown>;
};

/** Append-only (the table refuses updates and deletes). */
export async function appendClaimLog(e: ClaimLogEntry): Promise<void> {
  const { error } = await supabaseAdmin().from('claim_log').insert({ signatures: [], detail: {}, ...e });
  if (error) fail('claim log', error);
}

export async function claimLogFor(claimId: string) {
  const { data, error } = await supabaseAdmin().from('claim_log').select('*').eq('claim_id', claimId).order('id');
  if (error) fail('claim log read', error);
  return data ?? [];
}

/** After an executed handover: the link is claimed (or disowned) by the verified account, paid to `wallet`. */
export async function markLinkHandedOver(network: LinkNetwork, canonicalId: string, mint: string, status: 'claimed' | 'disowned', wallet: string, accountId: string): Promise<LinkRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from('links')
    .update({ status, claimed_wallet: wallet, claimed_at: now, owner_verified_id: accountId, owner_verified_at: now })
    .eq('network', network)
    .eq('canonical_id', canonicalId)
    .eq('mint', mint)
    .eq('status', 'hatched')
    .select('*')
    .maybeSingle();
  if (error) fail('mark handed over', error);
  return (data as LinkRow) ?? null;
}

/** Scouts: who hatched which live link coins. */
export async function hatchersOfLiveLinks(network: LinkNetwork) {
  const { data, error } = await supabaseAdmin().from('links').select('hatched_by, mint, pool, status').eq('network', network).in('status', ['hatched', 'claimed', 'disowned']).not('hatched_by', 'is', null).limit(5000);
  if (error) fail('scouts', error);
  return (data as Pick<LinkRow, 'hatched_by' | 'mint' | 'pool' | 'status'>[]) ?? [];
}

// ---------- claim hardening (P4a.1) ----------

/** The trust signals of the account that just verified ownership of this link. */
export async function setOwnerTrust(network: LinkNetwork, canonicalId: string, trust: unknown): Promise<void> {
  const { error } = await supabaseAdmin().from('links').update({ owner_trust: trust }).eq('network', network).eq('canonical_id', canonicalId);
  if (error) fail('owner trust', error);
}

export type NonceRow = { nonce: string; network: LinkNetwork; mint: string; platform: string; account_id: string; wallet: string; message: string; issued_at: string; expires_at: string; used_at: string | null };

export async function insertNonce(r: Omit<NonceRow, 'issued_at' | 'used_at'>): Promise<void> {
  const { error } = await supabaseAdmin().from('claim_nonces').insert(r);
  if (error) fail('insert nonce', error);
}

export async function getNonce(nonce: string): Promise<NonceRow | null> {
  if (!/^[0-9a-f]{32}$/.test(nonce)) return null;
  const { data, error } = await supabaseAdmin().from('claim_nonces').select('*').eq('nonce', nonce).maybeSingle();
  if (error) fail('get nonce', error);
  return (data as NonceRow) ?? null;
}

/** Uses a nonce exactly once (unexpired, same network, mint, account and wallet). Null when it cannot be used. */
export async function consumeNonce(p: { nonce: string; network: LinkNetwork; mint: string; accountId: string; wallet: string }): Promise<NonceRow | null> {
  const { data, error } = await supabaseAdmin().rpc('use_claim_nonce', { p_nonce: p.nonce, p_network: p.network, p_mint: p.mint, p_account_id: p.accountId, p_wallet: p.wallet });
  if (error) fail('use nonce', error);
  return ((data as NonceRow[]) ?? [])[0] ?? null;
}

export type DisputeRow = { id: string; network: LinkNetwork; claim_id: string; canonical_id: string; contact: string; reason: string; created_at: string };

export async function insertDispute(d: Omit<DisputeRow, 'id' | 'created_at'>): Promise<DisputeRow> {
  const { data, error } = await supabaseAdmin().from('claim_disputes').insert(d).select('*').single();
  if (error) fail('insert dispute', error);
  return data as DisputeRow;
}

export async function disputesFor(claimIds: string[]): Promise<DisputeRow[]> {
  if (!claimIds.length) return [];
  const { data, error } = await supabaseAdmin().from('claim_disputes').select('*').in('claim_id', claimIds).order('created_at');
  if (error) fail('disputes', error);
  return (data as DisputeRow[]) ?? [];
}

// ---------- X post-a-code (P4c) ----------

export type XCodeRow = { code: string; network: LinkNetwork; mint: string; session_hash: string; issued_at: string; expires_at: string; used_at: string | null; used_post_url: string | null };

export async function insertXCode(r: Pick<XCodeRow, 'code' | 'network' | 'mint' | 'session_hash' | 'expires_at'>): Promise<XCodeRow> {
  const { data, error } = await supabaseAdmin().from('x_claim_codes').insert(r).select('*').single();
  if (error) fail('insert x code', error);
  return data as XCodeRow;
}

export async function getXCode(code: string): Promise<XCodeRow | null> {
  const { data, error } = await supabaseAdmin().from('x_claim_codes').select('*').eq('code', code).maybeSingle();
  if (error) fail('get x code', error);
  return (data as XCodeRow) ?? null;
}

/** Uses a code exactly once (unexpired, same network, coin and session). Null when it cannot be used. */
export async function consumeXCode(p: { code: string; network: LinkNetwork; mint: string; sessionHash: string; postUrl: string }): Promise<XCodeRow | null> {
  const { data, error } = await supabaseAdmin().rpc('use_x_claim_code', { p_code: p.code, p_network: p.network, p_mint: p.mint, p_session_hash: p.sessionHash, p_post_url: p.postUrl });
  if (error) fail('use x code', error);
  return ((data as XCodeRow[]) ?? [])[0] ?? null;
}
