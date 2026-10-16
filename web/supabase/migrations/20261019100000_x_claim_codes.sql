-- P4c: X claims by post-a-code. ADDITIVE ONLY (a new table, a new function, a new column). Nothing dropped.

-- One-time codes ("hatch-XXXX-XX") the owner posts from their X account. Bound to one coin and one browser session
-- (stored as a hash), single use, 30 minutes.
create table if not exists public.x_claim_codes (
  code          text primary key,
  network       text not null check (network in ('devnet', 'mainnet')),
  mint          text not null,
  session_hash  text not null,
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  used_post_url text
);
create index if not exists x_claim_codes_mint_idx on public.x_claim_codes (network, mint);
alter table public.x_claim_codes enable row level security;
revoke all on public.x_claim_codes from anon, authenticated;

-- Atomically use a code once: unexpired, same network, coin and session.
create function public.use_x_claim_code(p_code text, p_network text, p_mint text, p_session_hash text, p_post_url text)
returns setof public.x_claim_codes
language sql
security invoker
set search_path = ''
as $$
  update public.x_claim_codes
     set used_at = now(), used_post_url = p_post_url
   where code = p_code and network = p_network and mint = p_mint and session_hash = p_session_hash
     and used_at is null and expires_at > now()
  returning *;
$$;

-- Claims: evidence for the verification (X: the URL of the post that carried the code).
alter table public.claims add column if not exists evidence_url text;
