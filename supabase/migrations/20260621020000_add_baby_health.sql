-- BabyPal health tracking.
-- Adds simple weight, temperature, medicine, and note entries.

create extension if not exists pgcrypto;

create table if not exists public.baby_health (
  id uuid primary key default gen_random_uuid(),
  health_type text not null,
  label text,
  value_numeric numeric,
  unit text,
  notes text,
  logged_at timestamptz default now(),
  constraint baby_health_type_check check (health_type in ('weight', 'temperature', 'medicine', 'note')),
  constraint baby_health_value_nonnegative check (value_numeric is null or value_numeric >= 0)
);

create index if not exists idx_baby_health_logged_at on public.baby_health(logged_at desc);

alter table public.baby_health enable row level security;

revoke all on public.baby_health from anon;
grant select, insert, update, delete on public.baby_health to authenticated;

drop policy if exists "authenticated users can manage baby_health" on public.baby_health;
create policy "authenticated users can manage baby_health"
  on public.baby_health
  for all
  to authenticated
  using (true)
  with check (true);
