-- Erinnerungen an anstehende Termine per Web-Push.
--
-- Jedes Gerät, das Push erlaubt hat, hinterlegt hier sein Abo. Die Edge
-- Function "send-reminders" liest die Wochendokumente, findet fällige
-- Erinnerungen und schickt sie an die passenden Geräte.
--
-- Ohne diese Tabellen funktioniert die App unverändert weiter: Erinnerungen
-- werden dann nur angezeigt, solange die App auf dem Gerät geöffnet ist.

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Adresse beim Push-Dienst des Browsers; identifiziert das Gerät eindeutig.
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  -- Für wen dieses Gerät Erinnerungen bekommt. 'alle' = jeder Termin.
  only_for     text not null default 'alle',
  user_agent   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint push_only_for_check check (only_for in ('mama', 'papa', 'kind', 'alle'))
);

create index if not exists push_subscriptions_household_idx
  on public.push_subscriptions (household_id);

-- Was schon verschickt wurde. Verhindert, dass dieselbe Erinnerung bei
-- jedem Lauf der Funktion erneut rausgeht.
create table if not exists public.reminder_sent (
  household_id uuid not null references public.households (id) on delete cascade,
  key          text not null,
  sent_at      timestamptz not null default now(),
  primary key (household_id, key)
);

create index if not exists reminder_sent_sent_at_idx on public.reminder_sent (sent_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions enable row level security;
alter table public.reminder_sent      enable row level security;

-- Jeder sieht und pflegt ausschließlich die Abos seiner eigenen Geräte.
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_household_member(household_id));

drop policy if exists push_update on public.push_subscriptions;
create policy push_update on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));

drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- Für `reminder_sent` gibt es bewusst keine Policy: die Tabelle geht nur die
-- Edge Function etwas an, und die arbeitet mit dem service_role-Key an RLS
-- vorbei. Angemeldete Nutzer kommen damit gar nicht erst heran.

-- ---------------------------------------------------------------------------
-- Aufräumen
-- ---------------------------------------------------------------------------

-- Alte Einträge der Merkliste entfernen; die Funktion ruft das selbst auf.
create or replace function public.prune_reminder_sent()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.reminder_sent where sent_at < now() - interval '30 days';
$$;

revoke all on function public.prune_reminder_sent() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Zeitplan
-- ---------------------------------------------------------------------------
--
-- Die Edge Function muss regelmäßig laufen, damit sie fällige Erinnerungen
-- findet. Alle fünf Minuten reicht; feiner lohnt sich nicht, weil die
-- Vorlaufzeiten in der App bei zehn Minuten beginnen.
--
-- Einmalig im SQL-Editor ausführen — die Platzhalter vorher ersetzen:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   -- Schlüssel einmalig hinterlegen (steht damit nur in der Datenbank,
--   -- nicht in diesem Repository):
--   alter database postgres
--     set app.settings.service_role_key = '<service_role-Key aus dem Dashboard>';
--
--   select cron.schedule(
--     'send-reminders',
--     '*/5 * * * *',
--     $cron$
--       select net.http_post(
--         url     := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
--         headers := jsonb_build_object(
--                      'Content-Type', 'application/json',
--                      'Authorization',
--                      'Bearer ' || current_setting('app.settings.service_role_key', true)
--                    ),
--         body    := '{}'::jsonb
--       );
--     $cron$
--   );
--
-- Wieder abschalten: select cron.unschedule('send-reminders');
-- Was lief, zeigt: select * from cron.job_run_details order by start_time desc limit 20;
