-- Familien-Wochenplan: Datenbankschema
-- Ausführen im Supabase Studio unter "SQL Editor" (oder via `supabase db push`).

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Familie',
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Ein Dokument pro Woche ("week:2026-07-27") bzw. für die Einstellungen
-- ("settings"). Der Inhalt liegt als JSON in `data`.
create table if not exists public.planner_docs (
  household_id uuid not null references public.households (id) on delete cascade,
  key          text not null,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (household_id, key)
);

create index if not exists planner_docs_household_idx
  on public.planner_docs (household_id);

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: Ist der angemeldete Nutzer Mitglied des Haushalts?
-- SECURITY DEFINER, damit die Policy auf household_members sich nicht
-- selbst rekursiv aufruft.
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(p_household uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household
      and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.planner_docs      enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

-- Nutzer dürfen ausschließlich ihre eigene Mitgliedschaft entfernen.
drop policy if exists members_delete_self on public.household_members;
create policy members_delete_self on public.household_members
  for delete to authenticated
  using (user_id = auth.uid());

-- Lesen, Schreiben und Löschen von Planungsdaten nur für Haushaltsmitglieder.
drop policy if exists docs_select on public.planner_docs;
create policy docs_select on public.planner_docs
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists docs_insert on public.planner_docs;
create policy docs_insert on public.planner_docs
  for insert to authenticated
  with check (public.is_household_member(household_id));

drop policy if exists docs_update on public.planner_docs;
create policy docs_update on public.planner_docs
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists docs_delete on public.planner_docs;
create policy docs_delete on public.planner_docs
  for delete to authenticated
  using (public.is_household_member(household_id));

-- Haushalte werden ausschließlich über die RPCs unten angelegt/betreten,
-- deshalb gibt es bewusst keine INSERT-Policy für die Tabellen selbst.

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Liefert den Haushalt des angemeldeten Nutzers; legt beim ersten Aufruf
-- einen neuen an.
create or replace function public.ensure_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select household_id into v_household
  from public.household_members
  where user_id = auth.uid()
  order by created_at
  limit 1;

  if v_household is not null then
    return v_household;
  end if;

  insert into public.households (name) values ('Familie')
  returning id into v_household;

  insert into public.household_members (household_id, user_id)
  values (v_household, auth.uid());

  return v_household;
end;
$$;

-- Zweites Elternteil tritt mit dem Haushalts-Code bei.
-- Der Code ist eine UUID: Wer sie kennt, darf beitreten – teilt sie also
-- nur persönlich, nicht öffentlich.
create or replace function public.join_household(p_household uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if not exists (select 1 from public.households where id = p_household) then
    raise exception 'Haushalt nicht gefunden.';
  end if;

  insert into public.household_members (household_id, user_id)
  values (p_household, auth.uid())
  on conflict do nothing;
end;
$$;

revoke all on function public.ensure_household() from public, anon;
revoke all on function public.join_household(uuid) from public, anon;
grant execute on function public.ensure_household() to authenticated;
grant execute on function public.join_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: Änderungen landen sofort auf dem anderen Handy
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.planner_docs;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
