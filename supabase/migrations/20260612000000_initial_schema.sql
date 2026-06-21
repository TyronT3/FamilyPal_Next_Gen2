-- FamilyPal staging schema
-- Schema only: no seed or demo data.

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text default null,
  created_at timestamptz default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text,
  category_id uuid references public.categories(id) on delete set null,
  barcode text,
  emoji text default null,
  quantity integer,
  status text,
  qty_stocked integer default 1,
  qty_open integer default 0,
  min_stock integer default 0,
  expiry_date date,
  priority boolean default false,
  unit_of_measure text default null,
  rating text default 'unsure',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint items_qty_stocked_nonnegative check (qty_stocked >= 0),
  constraint items_qty_open_nonnegative check (qty_open >= 0),
  constraint items_min_stock_nonnegative check (min_stock >= 0),
  constraint items_rating_check check (rating in ('unsure', 'love', 'hate'))
);

create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete cascade,
  action text,
  note text,
  price numeric(10,2),
  created_at timestamptz default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text,
  updated_at timestamptz default now()
);

create table if not exists public.baby_feeds (
  id uuid primary key default gen_random_uuid(),
  feed_type text not null,
  amount_ml integer,
  duration_mins integer,
  breast_side text,
  notes text,
  logged_at timestamptz default now(),
  constraint baby_feeds_feed_type_check check (feed_type in ('bottle', 'breast')),
  constraint baby_feeds_amount_nonnegative check (amount_ml is null or amount_ml >= 0),
  constraint baby_feeds_duration_nonnegative check (duration_mins is null or duration_mins >= 0)
);

create table if not exists public.baby_diapers (
  id uuid primary key default gen_random_uuid(),
  diaper_type text not null,
  notes text,
  logged_at timestamptz default now(),
  constraint baby_diapers_type_check check (diaper_type in ('wet', 'soiled', 'light', 'blowout'))
);

create table if not exists public.baby_sleep (
  id uuid primary key default gen_random_uuid(),
  sleep_start timestamptz,
  sleep_end timestamptz,
  duration_mins integer,
  notes text,
  logged_at timestamptz default now(),
  constraint baby_sleep_duration_nonnegative check (duration_mins is null or duration_mins >= 0)
);

create table if not exists public.baby_pumping (
  id uuid primary key default gen_random_uuid(),
  amount_ml integer not null,
  duration_mins integer,
  notes text,
  logged_at timestamptz default now(),
  constraint baby_pumping_amount_positive check (amount_ml > 0),
  constraint baby_pumping_duration_nonnegative check (duration_mins is null or duration_mins >= 0)
);

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

create table if not exists public.chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text default null,
  frequency text default 'daily',
  assigned_to text default 'rotating',
  points integer default 1,
  babypal_link text default null,
  active boolean default true,
  created_at timestamptz default now(),
  constraint chores_frequency_check check (frequency in ('daily', 'weekly', 'monthly', 'once')),
  constraint chores_assigned_to_check check (assigned_to in ('Tyron', 'Ansonette', 'rotating')),
  constraint chores_points_positive check (points > 0),
  constraint chores_babypal_link_check check (babypal_link is null or babypal_link in ('diaper'))
);

create table if not exists public.chore_logs (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid references public.chores(id) on delete cascade,
  completed_by text not null,
  completed_at timestamptz default now(),
  shared boolean default false,
  completed_by_2 text default null,
  notes text,
  constraint chore_logs_completed_by_check check (completed_by in ('Tyron', 'Ansonette')),
  constraint chore_logs_completed_by_2_check check (completed_by_2 is null or completed_by_2 in ('Tyron', 'Ansonette'))
);

create table if not exists public.chore_goals (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  prize text not null,
  points_target integer default null,
  created_by text not null,
  confirmed boolean default false,
  confirmed_by text default null,
  start_date date not null,
  end_date date not null,
  winner text default null,
  active boolean default true,
  created_at timestamptz default now(),
  constraint chore_goals_period_check check (period in ('weekly', 'monthly')),
  constraint chore_goals_points_target_positive check (points_target is null or points_target > 0),
  constraint chore_goals_winner_check check (winner is null or winner in ('Tyron', 'Ansonette', 'tie'))
);

create index if not exists idx_items_name on public.items(name);
create index if not exists idx_items_category_id on public.items(category_id);
create index if not exists idx_items_barcode on public.items(barcode);
create index if not exists idx_history_item_id_created_at on public.history(item_id, created_at desc);
create index if not exists idx_settings_key on public.settings(key);

create index if not exists idx_baby_feeds_logged_at on public.baby_feeds(logged_at desc);
create index if not exists idx_baby_diapers_logged_at on public.baby_diapers(logged_at desc);
create index if not exists idx_baby_sleep_logged_at on public.baby_sleep(logged_at desc);
create index if not exists idx_baby_pumping_logged_at on public.baby_pumping(logged_at desc);
create index if not exists idx_baby_health_logged_at on public.baby_health(logged_at desc);
create index if not exists idx_chores_active_name on public.chores(active, name);
create index if not exists idx_chore_logs_completed_at on public.chore_logs(completed_at desc);
create index if not exists idx_chore_logs_chore_id on public.chore_logs(chore_id);
create index if not exists idx_chore_goals_active_created_at on public.chore_goals(active, created_at desc);

-- Preserve current app behavior while the frontend still uses the anon key for REST calls.
-- Replace this with authenticated RLS policies once the auth refactor stores real Supabase sessions.
alter table public.categories disable row level security;
alter table public.items disable row level security;
alter table public.history disable row level security;
alter table public.settings disable row level security;
alter table public.baby_feeds disable row level security;
alter table public.baby_diapers disable row level security;
alter table public.baby_sleep disable row level security;
alter table public.baby_pumping disable row level security;
alter table public.baby_health disable row level security;
alter table public.chores disable row level security;
alter table public.chore_logs disable row level security;
alter table public.chore_goals disable row level security;
