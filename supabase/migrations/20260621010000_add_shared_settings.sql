-- Shared household settings for FamilyPal.
-- This is used for cross-device choices such as the PantryPal item to decrement
-- when BabyPal or ChoresPal logs a diaper change.

create extension if not exists pgcrypto;

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text,
  updated_at timestamptz default now()
);

create index if not exists idx_settings_key on public.settings(key);

alter table public.settings enable row level security;

revoke all on public.settings from anon;
grant select, insert, update, delete on public.settings to authenticated;

drop policy if exists "authenticated users can manage settings" on public.settings;
create policy "authenticated users can manage settings"
  on public.settings
  for all
  to authenticated
  using (true)
  with check (true);
