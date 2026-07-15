-- Shared structured wellbeing data for the current single-household FamilyPal app.
--
-- All authenticated household accounts may read these structured records. Each
-- account may change only its own profile, health check-ins and medications.
-- Household context is intentionally shared and contains no free-form notes.

create table if not exists public.wellbeing_profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  role text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellbeing_profiles_role_check check (role in ('husband', 'wife')),
  constraint wellbeing_profiles_name_check check (char_length(display_name) between 1 and 80)
);

create table if not exists public.wellbeing_daily_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.wellbeing_profiles(owner_id) on delete cascade,
  log_date date not null default current_date,
  mood smallint not null,
  energy smallint not null,
  stress smallint not null,
  sleep_quality smallint not null,
  movement smallint not null,
  symptoms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellbeing_daily_unique unique (owner_id, log_date),
  constraint wellbeing_daily_mood_check check (mood between 1 and 5),
  constraint wellbeing_daily_energy_check check (energy between 1 and 5),
  constraint wellbeing_daily_stress_check check (stress between 1 and 5),
  constraint wellbeing_daily_sleep_check check (sleep_quality between 1 and 5),
  constraint wellbeing_daily_movement_check check (movement between 1 and 5),
  constraint wellbeing_daily_symptom_count_check check (cardinality(symptoms) <= 16),
  constraint wellbeing_daily_symptom_values_check check (symptoms <@ array['headache','fatigue','pain','stomach','anxiety','low_mood','irritable','cold_flu','allergies','dizzy','nausea','other']::text[])
);

create table if not exists public.wellbeing_household_context (
  context_date date primary key default current_date,
  meal_source text,
  meal_balance smallint,
  home_feel smallint,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellbeing_context_meal_source_check check (meal_source is null or meal_source in ('home_cooked', 'mixed', 'takeaway')),
  constraint wellbeing_context_meal_balance_check check (meal_balance is null or meal_balance between 1 and 5),
  constraint wellbeing_context_home_feel_check check (home_feel is null or home_feel between 1 and 5)
);

create table if not exists public.wellbeing_medications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.wellbeing_profiles(owner_id) on delete cascade,
  name text not null,
  dosage text not null default '',
  time_of_day text not null default 'any',
  active boolean not null default true,
  start_date date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wellbeing_medications_owner_pair unique (id, owner_id),
  constraint wellbeing_medications_name_check check (char_length(name) between 1 and 120),
  constraint wellbeing_medications_dosage_check check (char_length(dosage) <= 120),
  constraint wellbeing_medications_time_check check (time_of_day in ('morning', 'afternoon', 'evening', 'bedtime', 'any')),
  constraint wellbeing_medications_dates_check check (ended_at is null or ended_at >= start_date)
);

create table if not exists public.wellbeing_medication_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  medication_id uuid not null,
  log_date date not null default current_date,
  status text not null,
  logged_at timestamptz not null default now(),
  constraint wellbeing_medication_logs_unique unique (medication_id, log_date),
  constraint wellbeing_medication_logs_status_check check (status in ('taken', 'missed', 'skipped')),
  constraint wellbeing_medication_logs_owner_fk foreign key (medication_id, owner_id)
    references public.wellbeing_medications(id, owner_id) on delete cascade
);

create index if not exists idx_wellbeing_daily_owner_date on public.wellbeing_daily_logs(owner_id, log_date desc);
create index if not exists idx_wellbeing_med_logs_owner_date on public.wellbeing_medication_logs(owner_id, log_date desc);

alter table public.wellbeing_profiles enable row level security;
alter table public.wellbeing_daily_logs enable row level security;
alter table public.wellbeing_household_context enable row level security;
alter table public.wellbeing_medications enable row level security;
alter table public.wellbeing_medication_logs enable row level security;

revoke all on public.wellbeing_profiles from anon;
revoke all on public.wellbeing_daily_logs from anon;
revoke all on public.wellbeing_household_context from anon;
revoke all on public.wellbeing_medications from anon;
revoke all on public.wellbeing_medication_logs from anon;

grant select, insert, update, delete on public.wellbeing_profiles to authenticated;
grant select, insert, update, delete on public.wellbeing_daily_logs to authenticated;
grant select, insert, update, delete on public.wellbeing_household_context to authenticated;
grant select, insert, update, delete on public.wellbeing_medications to authenticated;
grant select, insert, update, delete on public.wellbeing_medication_logs to authenticated;

drop policy if exists "household can read wellbeing profiles" on public.wellbeing_profiles;
create policy "household can read wellbeing profiles" on public.wellbeing_profiles
  for select to authenticated using (true);
drop policy if exists "users can insert own wellbeing profile" on public.wellbeing_profiles;
create policy "users can insert own wellbeing profile" on public.wellbeing_profiles
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "users can update own wellbeing profile" on public.wellbeing_profiles;
create policy "users can update own wellbeing profile" on public.wellbeing_profiles
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "users can delete own wellbeing profile" on public.wellbeing_profiles;
create policy "users can delete own wellbeing profile" on public.wellbeing_profiles
  for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "household can read wellbeing logs" on public.wellbeing_daily_logs;
create policy "household can read wellbeing logs" on public.wellbeing_daily_logs
  for select to authenticated using (true);
drop policy if exists "users can insert own wellbeing logs" on public.wellbeing_daily_logs;
create policy "users can insert own wellbeing logs" on public.wellbeing_daily_logs
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "users can update own wellbeing logs" on public.wellbeing_daily_logs;
create policy "users can update own wellbeing logs" on public.wellbeing_daily_logs
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "users can delete own wellbeing logs" on public.wellbeing_daily_logs;
create policy "users can delete own wellbeing logs" on public.wellbeing_daily_logs
  for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "household can manage wellbeing context" on public.wellbeing_household_context;
create policy "household can manage wellbeing context" on public.wellbeing_household_context
  for all to authenticated using (true) with check ((select auth.uid()) is not null);

drop policy if exists "household can read wellbeing medications" on public.wellbeing_medications;
create policy "household can read wellbeing medications" on public.wellbeing_medications
  for select to authenticated using (true);
drop policy if exists "users can insert own wellbeing medications" on public.wellbeing_medications;
create policy "users can insert own wellbeing medications" on public.wellbeing_medications
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "users can update own wellbeing medications" on public.wellbeing_medications;
create policy "users can update own wellbeing medications" on public.wellbeing_medications
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "users can delete own wellbeing medications" on public.wellbeing_medications;
create policy "users can delete own wellbeing medications" on public.wellbeing_medications
  for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "household can read wellbeing medication logs" on public.wellbeing_medication_logs;
create policy "household can read wellbeing medication logs" on public.wellbeing_medication_logs
  for select to authenticated using (true);
drop policy if exists "users can insert own wellbeing medication logs" on public.wellbeing_medication_logs;
create policy "users can insert own wellbeing medication logs" on public.wellbeing_medication_logs
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "users can update own wellbeing medication logs" on public.wellbeing_medication_logs;
create policy "users can update own wellbeing medication logs" on public.wellbeing_medication_logs
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "users can delete own wellbeing medication logs" on public.wellbeing_medication_logs;
create policy "users can delete own wellbeing medication logs" on public.wellbeing_medication_logs
  for delete to authenticated using ((select auth.uid()) = owner_id);
