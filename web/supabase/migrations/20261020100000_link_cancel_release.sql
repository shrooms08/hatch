-- /link cancel release + anti-griefing. ADDITIVE ONLY (a column, a table, new functions). Nothing dropped.

-- The reservation token (sha256 of a random token returned to the client that reserved the link).
alter table public.links add column if not exists reservation_token_hash text;

-- Expire a reservation NOW, only for its own mint and token, only while still reserved. The caller has checked on
-- chain that no pool exists, then releases it with release_link (which only drops expired reservations).
create function public.cancel_link_reservation(p_network text, p_canonical_id text, p_mint text, p_token_hash text)
returns setof public.links
language sql
security invoker
set search_path = ''
as $$
  update public.links
     set reserved_until = now() - interval '1 second'
   where network = p_network and canonical_id = p_canonical_id and mint = p_mint and status = 'reserved'
     and reservation_token_hash is not null and reservation_token_hash = p_token_hash
  returning *;
$$;

-- Every hatch attempt (a reservation handed out), per wallet and per salted IP hash, for the unfinished-hatch limit.
create table if not exists public.link_hatch_attempts (
  id           bigint generated always as identity primary key,
  network      text not null check (network in ('devnet', 'mainnet')),
  canonical_id text not null,
  mint         text not null,
  wallet       text not null,
  ip_hash      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists link_hatch_attempts_wallet_idx on public.link_hatch_attempts (network, wallet, created_at);
create index if not exists link_hatch_attempts_ip_idx on public.link_hatch_attempts (network, ip_hash, created_at);
alter table public.link_hatch_attempts enable row level security;
revoke all on public.link_hatch_attempts from anon, authenticated;

-- Unfinished attempts since p_since for this wallet and for this IP: attempts whose coin did not get hatched.
create function public.unfinished_hatch_attempts(p_network text, p_wallet text, p_ip_hash text, p_since timestamptz)
returns table (by_wallet bigint, by_ip bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select a.wallet, a.ip_hash
      from public.link_hatch_attempts a
     where a.network = p_network and a.created_at >= p_since
       and (a.wallet = p_wallet or a.ip_hash = p_ip_hash)
       and not exists (
         select 1 from public.links l
          where l.network = a.network and l.mint = a.mint and l.status in ('hatched', 'claimed', 'disowned')
       )
  )
  select count(*) filter (where wallet = p_wallet), count(*) filter (where ip_hash = p_ip_hash) from recent;
$$;
