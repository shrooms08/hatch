-- Link coins: one official coin per link (per network), and the owner claims for them.
-- Server-only: Row Level Security is on with NO policies, and anon/authenticated have no grants,
-- so only the service role (the Hatch server) can read or write.

create table public.links (
  network            text not null check (network in ('devnet', 'mainnet')),
  canonical_id       text not null check (char_length(canonical_id) between 3 and 600),
  id_hash            text not null check (id_hash ~ '^[0-9a-f]{64}$'),
  kind               text not null check (kind in ('x_post', 'youtube_video', 'github_repo', 'web_page')),
  display_url        text not null check (char_length(display_url) <= 2048),
  title              text,
  image_url          text,
  owner_platform     text,
  owner_handle       text,
  owner_id           text,
  coin_name          text check (char_length(coin_name) <= 32),
  coin_ticker        text check (coin_ticker ~ '^[A-Z0-9]{1,10}$'),
  metadata_url       text,
  mint               text,
  pool               text,
  config             text,
  status             text not null check (status in ('reserved', 'hatched', 'claimed', 'disowned')),
  hatched_by         text,
  first_buy_lamports bigint check (first_buy_lamports >= 0),
  reserved_until     timestamptz,
  created_at         timestamptz not null default now(),
  hatched_at         timestamptz,
  claimed_wallet     text,
  claimed_at         timestamptz,
  -- One row per link per network: a link can never have two coins on the same network.
  constraint links_pkey primary key (network, canonical_id)
);

-- Private prefix lookup (first 8 hex chars of id_hash) per network.
create index links_network_id_hash_idx on public.links (network, id_hash text_pattern_ops);
create unique index links_network_mint_key on public.links (network, mint) where mint is not null;

create table public.claims (
  id               uuid primary key default gen_random_uuid(),
  network          text not null check (network in ('devnet', 'mainnet')),
  canonical_id     text not null,
  platform         text not null,
  verified_handle  text,
  owner_wallet     text not null,
  squads_proposal  text,
  status           text not null default 'pending' check (status in ('pending', 'proposed', 'approved', 'executed', 'rejected', 'failed')),
  created_at       timestamptz not null default now(),
  executed_at      timestamptz,
  constraint claims_link_fkey foreign key (network, canonical_id) references public.links (network, canonical_id) on delete cascade
);
create index claims_link_idx on public.claims (network, canonical_id);

alter table public.links enable row level security;
alter table public.claims enable row level security;
revoke all on public.links, public.claims from anon, authenticated;

-- Atomically reserve a link for a hatch. Succeeds (returns the row) only when the link has no row yet, or
-- its row is an EXPIRED reservation whose mint is still p_prev_mint (the caller checked on chain that this
-- earlier mint never launched). A hatched / claimed / disowned row is never taken over. Two concurrent calls
-- for the same link: exactly one gets a row back.
create function public.reserve_link(
  p_network text, p_canonical_id text, p_id_hash text, p_kind text, p_display_url text,
  p_title text, p_image_url text, p_owner_platform text, p_owner_handle text, p_owner_id text,
  p_coin_name text, p_coin_ticker text, p_metadata_url text, p_mint text, p_pool text, p_config text,
  p_hatched_by text, p_first_buy_lamports bigint, p_ttl_seconds integer, p_prev_mint text
) returns setof public.links
language sql
security invoker
set search_path = ''
as $$
  insert into public.links as l (
    network, canonical_id, id_hash, kind, display_url, title, image_url, owner_platform, owner_handle, owner_id,
    coin_name, coin_ticker, metadata_url, mint, pool, config, status, hatched_by, first_buy_lamports, reserved_until
  ) values (
    p_network, p_canonical_id, p_id_hash, p_kind, p_display_url, p_title, p_image_url, p_owner_platform, p_owner_handle, p_owner_id,
    p_coin_name, p_coin_ticker, p_metadata_url, p_mint, p_pool, p_config, 'reserved', p_hatched_by, p_first_buy_lamports,
    now() + make_interval(secs => p_ttl_seconds)
  )
  on conflict (network, canonical_id) do update set
    id_hash = excluded.id_hash, kind = excluded.kind, display_url = excluded.display_url, title = excluded.title,
    image_url = excluded.image_url, owner_platform = excluded.owner_platform, owner_handle = excluded.owner_handle,
    owner_id = excluded.owner_id, coin_name = excluded.coin_name, coin_ticker = excluded.coin_ticker,
    metadata_url = excluded.metadata_url, mint = excluded.mint, pool = excluded.pool, config = excluded.config,
    hatched_by = excluded.hatched_by, first_buy_lamports = excluded.first_buy_lamports,
    reserved_until = excluded.reserved_until, created_at = now()
  where l.status = 'reserved' and l.reserved_until < now() and l.mint is not distinct from p_prev_mint
  returning l.*;
$$;

-- Mark a reservation hatched once its pool is verified on chain. Only the reservation holding p_mint.
create function public.mark_link_hatched(p_network text, p_canonical_id text, p_mint text)
returns setof public.links
language sql
security invoker
set search_path = ''
as $$
  update public.links
     set status = 'hatched', hatched_at = now(), reserved_until = null
   where network = p_network and canonical_id = p_canonical_id and mint = p_mint and status = 'reserved'
  returning *;
$$;

-- Release an expired reservation whose transaction never landed (the caller checked the chain). Only that mint.
create function public.release_link(p_network text, p_canonical_id text, p_mint text)
returns setof public.links
language sql
security invoker
set search_path = ''
as $$
  delete from public.links
   where network = p_network and canonical_id = p_canonical_id and mint = p_mint
     and status = 'reserved' and reserved_until < now()
  returning *;
$$;

revoke all on function public.reserve_link(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, bigint, integer, text) from public, anon, authenticated;
revoke all on function public.mark_link_hatched(text, text, text) from public, anon, authenticated;
revoke all on function public.release_link(text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_link(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, bigint, integer, text) to service_role;
grant execute on function public.mark_link_hatched(text, text, text) to service_role;
grant execute on function public.release_link(text, text, text) to service_role;
