-- Frei wählbare Personen statt der festen Rollen Mama, Papa und Kind.
--
-- Die Personen selbst brauchen keine eigene Tabelle: sie stehen im
-- Einstellungs-Dokument des Haushalts (`planner_docs`, key = 'settings').
-- Die drei mitgelieferten behalten die ids 'mama', 'papa' und 'kind', mit
-- denen bereits gespeicherte Termine und Bettdienste weiterhin passen.
--
-- Zu ändern ist deshalb nur eine Stelle: Die Push-Abos merken sich, für
-- wen ein Gerät Erinnerungen bekommt, und akzeptierten bisher ausschließlich
-- die drei bekannten Werte.

alter table public.push_subscriptions
  drop constraint if exists push_only_for_check;

-- 'alle' heißt weiterhin "jeder Termin"; sonst steht hier eine Personen-id
-- aus den Einstellungen. Welche das sind, weiß nur die App — die Datenbank
-- prüft daher nur noch, dass überhaupt etwas dasteht.
alter table public.push_subscriptions
  drop constraint if exists push_only_for_not_blank;

alter table public.push_subscriptions
  add constraint push_only_for_not_blank check (length(only_for) > 0);
