-- Private JournalPal vaults and encrypted entries.
--
-- Plaintext and journal passphrases never enter these tables. Each authenticated
-- user can access only their own ciphertext through the public API. Database
-- administrators can still see metadata and ciphertext, but not journal text.

create table if not exists public.journal_vaults (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  salt text not null,
  wrap_iv text not null,
  wrapped_key text not null,
  kdf_iterations integer not null default 600000,
  crypto_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_vaults_iterations_check check (kdf_iterations >= 600000),
  constraint journal_vaults_crypto_version_check check (crypto_version = 1)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.journal_vaults(owner_id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  crypto_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_crypto_version_check check (crypto_version = 1)
);

create index if not exists idx_journal_entries_owner_created
  on public.journal_entries(owner_id, created_at desc);

alter table public.journal_vaults enable row level security;
alter table public.journal_entries enable row level security;

revoke all on public.journal_vaults from anon;
revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_vaults to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;

drop policy if exists "users can manage their own journal vault" on public.journal_vaults;
create policy "users can manage their own journal vault"
  on public.journal_vaults
  for all
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "users can manage their own journal entries" on public.journal_entries;
create policy "users can manage their own journal entries"
  on public.journal_entries
  for all
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
