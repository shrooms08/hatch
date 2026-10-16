-- P4a.1: claim hardening. ADDITIVE ONLY (new columns, tables, indexes, functions). Nothing dropped or recreated.

-- Claims: the destination wallet's signature, the owner's trust signals at verify time, and the timelock.
alter table public.claims
  add column if not exists destination_message   text,
  add column if not exists destination_signature text,
  add column if not exists nonce                 text,
  add column if not exists trust                 jsonb,
  add column if not exists timelock_until        timestamptz;

-- Links: the trust signals of the account that last verified ownership (shown on the coin and in the extension).
alter table public.links
  add column if not exists owner_trust jsonb;

-- One-time nonces for the destination signature. Issued for (mint, verified account, wallet); used once.
create table if not exists public.claim_nonces (
  nonce        text primary key,
  network      text not null check (network in ('devnet', 'mainnet')),
  mint         text not null,
  platform     text not null,
  account_id   text not null,
  wallet       text not null,
  message      text not null,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);
create index if not exists claim_nonces_lookup_idx on public.claim_nonces (network, mint, account_id);
alter table public.claim_nonces enable row level security;
revoke all on public.claim_nonces from anon, authenticated;

-- Atomically use a nonce: succeeds once, only while unexpired and only for the same mint, account and wallet.
create function public.use_claim_nonce(p_nonce text, p_network text, p_mint text, p_account_id text, p_wallet text)
returns setof public.claim_nonces
language sql
security invoker
set search_path = ''
as $$
  update public.claim_nonces
     set used_at = now()
   where nonce = p_nonce and network = p_network and mint = p_mint and account_id = p_account_id and wallet = p_wallet
     and used_at is null and expires_at > now()
  returning *;
$$;

-- Disputes against an open claim (shown to the approver). Contact + reason only.
create table if not exists public.claim_disputes (
  id           uuid primary key default gen_random_uuid(),
  network      text not null check (network in ('devnet', 'mainnet')),
  claim_id     uuid not null references public.claims (id),
  canonical_id text not null,
  contact      text not null check (char_length(contact) between 3 and 200),
  reason       text not null check (char_length(reason) between 10 and 2000),
  created_at   timestamptz not null default now()
);
create index if not exists claim_disputes_claim_idx on public.claim_disputes (claim_id);
alter table public.claim_disputes enable row level security;
revoke all on public.claim_disputes from anon, authenticated;
