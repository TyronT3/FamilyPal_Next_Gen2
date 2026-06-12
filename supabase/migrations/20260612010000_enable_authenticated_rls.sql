-- Require a signed-in Supabase user for all FamilyPal data access.
--
-- This is the first security step for the current single-household app:
-- authenticated users can still share all household data, but anonymous
-- browser requests no longer have table access once RLS is enabled.

alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.history enable row level security;
alter table public.baby_feeds enable row level security;
alter table public.baby_diapers enable row level security;
alter table public.baby_sleep enable row level security;
alter table public.baby_pumping enable row level security;
alter table public.mama_meals enable row level security;
alter table public.chores enable row level security;
alter table public.chore_logs enable row level security;
alter table public.chore_goals enable row level security;

revoke all on public.categories from anon;
revoke all on public.items from anon;
revoke all on public.history from anon;
revoke all on public.baby_feeds from anon;
revoke all on public.baby_diapers from anon;
revoke all on public.baby_sleep from anon;
revoke all on public.baby_pumping from anon;
revoke all on public.mama_meals from anon;
revoke all on public.chores from anon;
revoke all on public.chore_logs from anon;
revoke all on public.chore_goals from anon;

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.history to authenticated;
grant select, insert, update, delete on public.baby_feeds to authenticated;
grant select, insert, update, delete on public.baby_diapers to authenticated;
grant select, insert, update, delete on public.baby_sleep to authenticated;
grant select, insert, update, delete on public.baby_pumping to authenticated;
grant select, insert, update, delete on public.mama_meals to authenticated;
grant select, insert, update, delete on public.chores to authenticated;
grant select, insert, update, delete on public.chore_logs to authenticated;
grant select, insert, update, delete on public.chore_goals to authenticated;

drop policy if exists "authenticated users can manage categories" on public.categories;
create policy "authenticated users can manage categories"
  on public.categories
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage items" on public.items;
create policy "authenticated users can manage items"
  on public.items
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage history" on public.history;
create policy "authenticated users can manage history"
  on public.history
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage baby_feeds" on public.baby_feeds;
create policy "authenticated users can manage baby_feeds"
  on public.baby_feeds
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage baby_diapers" on public.baby_diapers;
create policy "authenticated users can manage baby_diapers"
  on public.baby_diapers
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage baby_sleep" on public.baby_sleep;
create policy "authenticated users can manage baby_sleep"
  on public.baby_sleep
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage baby_pumping" on public.baby_pumping;
create policy "authenticated users can manage baby_pumping"
  on public.baby_pumping
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage mama_meals" on public.mama_meals;
create policy "authenticated users can manage mama_meals"
  on public.mama_meals
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage chores" on public.chores;
create policy "authenticated users can manage chores"
  on public.chores
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage chore_logs" on public.chore_logs;
create policy "authenticated users can manage chore_logs"
  on public.chore_logs
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated users can manage chore_goals" on public.chore_goals;
create policy "authenticated users can manage chore_goals"
  on public.chore_goals
  for all
  to authenticated
  using (true)
  with check (true);
