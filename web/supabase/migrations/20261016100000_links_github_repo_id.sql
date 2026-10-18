-- GitHub repo identity: a repo keeps its numeric id across renames and transfers, so one repo gets one coin
-- even when people hatch it under different owner/name paths. The canonical id (gh:repo:<owner>/<repo>) stays
-- what clients hash for lookups; this column is the uniqueness check behind it.
alter table public.links add column github_repo_id bigint check (github_repo_id > 0);
create unique index links_network_github_repo_id_key on public.links (network, github_repo_id) where github_repo_id is not null;

-- reserve_link gains p_github_repo_id (a new overload; nothing is dropped, the server only calls this one).
-- A reservation whose repo id already belongs to another row fails with a unique violation (23505), which the
-- server reports as "This link already has its coin".

create function public.reserve_link(
  p_network text, p_canonical_id text, p_id_hash text, p_kind text, p_display_url text,
  p_title text, p_image_url text, p_owner_platform text, p_owner_handle text, p_owner_id text,
  p_coin_name text, p_coin_ticker text, p_metadata_url text, p_mint text, p_pool text, p_config text,
  p_hatched_by text, p_first_buy_lamports bigint, p_ttl_seconds integer, p_prev_mint text, p_github_repo_id bigint
) returns setof public.links
language sql
security invoker
set search_path = ''
as $$
  insert into public.links as l (
    network, canonical_id, id_hash, kind, display_url, title, image_url, owner_platform, owner_handle, owner_id,
    coin_name, coin_ticker, metadata_url, mint, pool, config, status, hatched_by, first_buy_lamports, reserved_until,
    github_repo_id
  ) values (
    p_network, p_canonical_id, p_id_hash, p_kind, p_display_url, p_title, p_image_url, p_owner_platform, p_owner_handle, p_owner_id,
    p_coin_name, p_coin_ticker, p_metadata_url, p_mint, p_pool, p_config, 'reserved', p_hatched_by, p_first_buy_lamports,
    now() + make_interval(secs => p_ttl_seconds), p_github_repo_id
  )
  on conflict (network, canonical_id) do update set
    id_hash = excluded.id_hash, kind = excluded.kind, display_url = excluded.display_url, title = excluded.title,
    image_url = excluded.image_url, owner_platform = excluded.owner_platform, owner_handle = excluded.owner_handle,
    owner_id = excluded.owner_id, coin_name = excluded.coin_name, coin_ticker = excluded.coin_ticker,
    metadata_url = excluded.metadata_url, mint = excluded.mint, pool = excluded.pool, config = excluded.config,
    hatched_by = excluded.hatched_by, first_buy_lamports = excluded.first_buy_lamports,
    reserved_until = excluded.reserved_until, github_repo_id = excluded.github_repo_id, created_at = now()
  where l.status = 'reserved' and l.reserved_until < now() and l.mint is not distinct from p_prev_mint
  returning l.*;
$$;

revoke all on function public.reserve_link(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, bigint, integer, text, bigint) from public, anon, authenticated;
grant execute on function public.reserve_link(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, bigint, integer, text, bigint) to service_role;
