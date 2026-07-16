-- Explicit observation markers for missing-data-safe BabyPal and PantryPal analytics.
--
-- A missing row means "unknown", not zero. BabyPal days are only considered
-- complete after a household member confirms them. PantryPal forecasts compare
-- explicit whole-pantry inventory snapshots instead of treating quiet history as
-- proof that nothing was consumed.

create table if not exists public.baby_tracking_days (
  track_date date primary key default current_date,
  status text not null default 'complete',
  confirmed_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint baby_tracking_days_status_check check (status = 'complete')
);

create table if not exists public.pantry_inventory_snapshots (
  item_id uuid not null references public.items(id) on delete cascade,
  snapshot_date date not null default current_date,
  qty_stocked integer not null,
  qty_open integer not null,
  captured_by uuid default auth.uid() references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  primary key (item_id, snapshot_date),
  constraint pantry_snapshot_stocked_nonnegative check (qty_stocked >= 0),
  constraint pantry_snapshot_open_nonnegative check (qty_open >= 0)
);

create index if not exists idx_pantry_snapshots_date
  on public.pantry_inventory_snapshots(snapshot_date desc);

alter table public.baby_tracking_days enable row level security;
alter table public.pantry_inventory_snapshots enable row level security;

revoke all on public.baby_tracking_days from anon;
revoke all on public.pantry_inventory_snapshots from anon;

grant select, insert, update, delete on public.baby_tracking_days to authenticated;
grant select, insert, update, delete on public.pantry_inventory_snapshots to authenticated;

drop policy if exists "household can manage baby tracking days" on public.baby_tracking_days;
create policy "household can manage baby tracking days" on public.baby_tracking_days
  for all to authenticated using (true) with check ((select auth.uid()) is not null);

drop policy if exists "household can manage pantry snapshots" on public.pantry_inventory_snapshots;
create policy "household can manage pantry snapshots" on public.pantry_inventory_snapshots
  for all to authenticated using (true) with check ((select auth.uid()) is not null);
