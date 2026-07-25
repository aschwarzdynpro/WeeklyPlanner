-- Registrierung nur für freigeschaltete E-Mail-Adressen.
--
-- Hintergrund: Die App ist öffentlich erreichbar und der anon-Key steckt im
-- ausgelieferten JavaScript. Row Level Security schützt zwar die Daten – ohne
-- weitere Maßnahme könnten Fremde sich aber eigene Konten in diesem Projekt
-- anlegen. Die Dashboard-Einstellung "Allow new users to sign up" täte es
-- auch, kann aber unbemerkt wieder umgelegt werden; diese Sperre sitzt in der
-- Datenbank und greift auf jedem Weg, auf dem ein Konto entstehen kann.
--
-- Das Schema "private" wird von PostgREST nicht ausgeliefert – die Liste ist
-- über die API also weder les- noch schreibbar.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.allowed_signups (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

revoke all on table private.allowed_signups from anon, authenticated;

create or replace function private.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if not exists (
    select 1 from private.allowed_signups a
    where lower(a.email) = lower(new.email)
  ) then
    raise exception 'Für diese E-Mail-Adresse ist keine Registrierung freigeschaltet.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_signup_allowlist on auth.users;
create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function private.enforce_signup_allowlist();

-- Freigeschaltete Adressen. Hier weitere Zeilen ergänzen, wenn jemand
-- dazukommen soll (SQL Editor im Supabase-Dashboard):
--
--   insert into private.allowed_signups (email, note)
--   values ('neue.adresse@beispiel.de', 'Elternteil 2');
--
-- Und zum Entziehen:
--
--   delete from private.allowed_signups where email = 'adresse@beispiel.de';
--
-- Achtung: Das Entfernen aus der Liste verhindert nur neue Registrierungen.
-- Ein bereits bestehendes Konto löscht man in Supabase unter
-- Authentication -> Users.

insert into private.allowed_signups (email, note)
values ('aschwarzonline@gmail.com', 'Elternteil 1')
on conflict (email) do nothing;
