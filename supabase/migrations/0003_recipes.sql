-- Rezepte, die pro Haushalt dazukommen – erzeugt von der Edge Function
-- "generate-recipes" oder später von Hand ergänzt.
--
-- Die mitgelieferte Rezeptbibliothek (src/data/recipes.ts) bleibt im
-- Frontend: sie funktioniert offline und ohne Datenbank. Die App führt
-- beide Quellen zusammen und entfernt Dubletten über die id.

create table if not exists public.recipes (
  id           text not null,
  household_id uuid not null references public.households (id) on delete cascade,
  title        text not null,
  subtitle     text not null default '',
  servings     integer not null default 3,
  minutes      integer not null default 30,
  emoji        text not null default '🍽️',
  kind         text not null default 'alltag',
  tags         jsonb not null default '[]'::jsonb,
  ingredients  jsonb not null default '[]'::jsonb,
  steps        jsonb not null default '[]'::jsonb,
  kid_tip      text not null default '',
  -- Woher das Rezept stammt: 'ki' = wöchentlich erzeugt, 'eigen' = selbst angelegt.
  source       text not null default 'ki',
  created_at   timestamptz not null default now(),
  primary key (household_id, id),
  constraint recipes_kind_check   check (kind in ('alltag', 'wochenende')),
  constraint recipes_source_check check (source in ('ki', 'eigen')),
  constraint recipes_servings_check check (servings between 1 and 12),
  constraint recipes_minutes_check  check (minutes between 5 and 300)
);

create index if not exists recipes_household_created_idx
  on public.recipes (household_id, created_at desc);

alter table public.recipes enable row level security;

drop policy if exists recipes_select on public.recipes;
create policy recipes_select on public.recipes
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists recipes_insert on public.recipes;
create policy recipes_insert on public.recipes
  for insert to authenticated
  with check (public.is_household_member(household_id));

drop policy if exists recipes_update on public.recipes;
create policy recipes_update on public.recipes
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists recipes_delete on public.recipes;
create policy recipes_delete on public.recipes
  for delete to authenticated
  using (public.is_household_member(household_id));

-- Änderungen erscheinen sofort auf dem anderen Gerät.
do $$
begin
  alter publication supabase_realtime add table public.recipes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
