// Link coins in lists (Hatches, My Hatches): which link pools may be shown, their labels, and the list filter.
// Pure (client and server).
import type { HatchPool, HatchStatus, PoolLink } from '@/lib/dbc/pool';

export const PLATFORM_NAME: Record<PoolLink['platform'], string> = { x: 'X', youtube: 'YouTube', github: 'GitHub', web: 'Web' };

const KIND_PLATFORM: Record<string, PoolLink['platform']> = { x_post: 'x', youtube_video: 'youtube', github_repo: 'github', web_page: 'web' };

export type ListedLinkLike = {
  kind: string;
  mint: string | null;
  pool: string | null;
  status: string;
  title: string | null;
  display_url: string;
  owner_platform: string | null;
  owner_handle: string | null;
  claimed_wallet: string | null;
  hatched_at?: string | null;
};

export function toPoolLink(row: ListedLinkLike): PoolLink {
  const p = row.owner_platform && row.owner_platform in PLATFORM_NAME ? (row.owner_platform as PoolLink['platform']) : (KIND_PLATFORM[row.kind] ?? 'web');
  const t = row.hatched_at ? Date.parse(row.hatched_at) : NaN;
  return { platform: p, title: row.title, displayUrl: row.display_url, ownerHandle: row.owner_handle, hatchedAt: Number.isFinite(t) ? Math.floor(t / 1000) : null };
}

/**
 * Link pools that may be listed, by mint. Anyone can create a pool under a public DBC config, so a pool under the
 * LINK config is only a link coin when the links table has it (hatched or claimed, same mint AND pool) and its
 * on-chain creator is the Hatch vault, or the owner's wallet once claimed.
 */
export function verifyListedLinks(pools: readonly Pick<HatchPool, 'baseMint' | 'address' | 'creator' | 'isLink'>[], rows: readonly ListedLinkLike[], vault: string): Map<string, PoolLink> {
  const byMint = new Map(rows.filter((r) => r.mint && (r.status === 'hatched' || r.status === 'claimed' || r.status === 'disowned')).map((r) => [r.mint!, r]));
  const out = new Map<string, PoolLink>();
  for (const p of pools) {
    if (!p.isLink) continue;
    const r = byMint.get(p.baseMint);
    if (!r || r.pool !== p.address) continue;
    if (p.creator !== vault && !(r.claimed_wallet && p.creator === r.claimed_wallet)) continue;
    out.set(p.baseMint, toPoolLink(r));
  }
  return out;
}

/**
 * "fees held for @jawed on YouTube" (unclaimed), "fees go to @jawed on YouTube" (claimed),
 * "disowned by the owner" (the owner had the held fees sent to a wallet they chose).
 */
export function feesLabel(link: Pick<PoolLink, 'platform' | 'ownerHandle'>, claimed: boolean, disowned = false): string {
  if (disowned) return 'disowned by the owner';
  const who = link.ownerHandle ? `${link.ownerHandle}${link.platform !== 'web' ? ` on ${PLATFORM_NAME[link.platform]}` : ''}` : "the link's owner";
  return claimed ? `fees go to ${who}` : `fees held for ${who}`;
}

export type HatchFilter = 'ALL' | HatchStatus | 'LINK';

/** The Hatches list filter tabs and search box: name, ticker, mint, and for link coins the link's title. */
export function matchesHatch(p: Pick<HatchPool, 'status' | 'isLink' | 'baseMint' | 'link'>, filter: HatchFilter, query: string, md?: { name?: string | null; symbol?: string | null } | null): boolean {
  if (filter === 'LINK' ? !p.isLink : filter !== 'ALL' && p.status !== filter) return false;
  const q = query.trim().toLowerCase().replace(/^\$/, '');
  if (!q) return true;
  return [md?.name, md?.symbol, p.baseMint, p.link?.title].some((s) => s?.toLowerCase().includes(q));
}
