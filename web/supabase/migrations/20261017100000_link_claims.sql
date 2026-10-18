-- P4a: link coin claims. ADDITIVE ONLY: new columns, indexes, a new table and new functions/triggers. Nothing
-- existing is dropped or recreated.

-- Claims: who verified (permanent account id, never a username alone), what they asked for, and the Squads proposal.
alter table public.claims
  add column if not exists mint               text,
  add column if not exists action             text check (action in ('claim', 'disown')),
  add column if not exists account_id         text,
  add column if not exists account_login      text,
  add column if not exists verified_at        timestamptz,
  add column if not exists destination        text,
  add column if not exists transaction_index  bigint,
  add column if not exists held_lamports      bigint,
  add column if not exists received_lamports  bigint,
  add column if not exists propose_signatures text[] not null default '{}',
  add column if not exists approve_signature  text,
  add column if not exists execute_signature  text,
  add column if not exists error              text,
  add column if not exists updated_at         timestamptz not null default now();

-- At most one open claim per link (pending, proposed or approved). A rejected/failed claim frees the link.
create unique index if not exists claims_one_open_per_link
  on public.claims (network, canonical_id) where status in ('pending', 'proposed', 'approved');
create index if not exists claims_status_idx on public.claims (network, status);

-- The destination can never change once set (the Squads proposal encodes it). To change it: reject, start again.
create function public.claims_destination_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.destination is not null and new.destination is distinct from old.destination then
    raise exception 'claim destination cannot be changed';
  end if;
  if old.action is not null and new.action is distinct from old.action then
    raise exception 'claim action cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger claims_destination_immutable before update on public.claims
  for each row execute function public.claims_destination_immutable();

-- Append-only claim log: verifications, proposals, votes, executions, refusals.
create table if not exists public.claim_log (
  id           bigint generated always as identity primary key,
  network      text not null check (network in ('devnet', 'mainnet')),
  claim_id     uuid references public.claims (id),
  canonical_id text not null,
  event        text not null,
  platform     text,
  account_id   text,
  account_login text,
  destination  text,
  proposal     text,
  signatures   text[] not null default '{}',
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists claim_log_claim_idx on public.claim_log (claim_id);
create index if not exists claim_log_link_idx on public.claim_log (network, canonical_id);

create function public.claim_log_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'claim_log is append-only';
end;
$$;
create trigger claim_log_no_update before update or delete on public.claim_log
  for each row execute function public.claim_log_append_only();
create trigger claim_log_no_truncate before truncate on public.claim_log
  for each statement execute function public.claim_log_append_only();

alter table public.claim_log enable row level security;
revoke all on public.claim_log from anon, authenticated;

-- Links: who disowned / claimed is already claimed_wallet + claimed_at; record the verified account too.
alter table public.links
  add column if not exists owner_verified_id text,
  add column if not exists owner_verified_at timestamptz;
