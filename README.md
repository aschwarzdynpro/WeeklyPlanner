# Familien-Wochenplan

Eine kleine Web-App für die Wochenplanung einer Familie: Essensplan von Montag bis Sonntag,
die passenden Rezepte, eine automatisch berechnete Einkaufsliste und ein Terminplan, in dem
abends der Bettdienst zwischen Mama und Papa rotiert.

Der Zugriff ist durch einen Login mit E-Mail und Passwort geschützt. Die Daten liegen in Supabase
und stehen dadurch auf allen Geräten der Familie zur Verfügung — Handy, Tablet und Laptop zeigen
denselben Plan, Änderungen erscheinen dank Realtime sofort auf dem jeweils anderen Gerät.

## Was drin ist

**Essensplan** — Montag bis Freitag alltagstaugliche Gerichte (25–40 Minuten, kindgerecht,
ausgewogen), Samstag und Sonntag etwas Kräftigeres. Jedes Gericht lässt sich gegen ein anderes
aus der Bibliothek tauschen, ebenso gegen „Reste-Essen“ oder „Auswärts essen“.

**Rezepte** — mit Zutaten, Schritt-für-Schritt-Anleitung und einem Hinweis, was das Kind
übernehmen kann. Alle Mengen rechnen sich automatisch auf die eingestellte Portionszahl um.

**Einkaufsliste** — wird aus den geplanten Gerichten der Woche berechnet. Gleiche Zutaten werden
zusammengezählt und nach Kategorien sortiert (Obst & Gemüse, Fleisch & Fisch …). Abhaken beim
Einkaufen, eigene Artikel ergänzen, per Knopfdruck als Text für WhatsApp kopieren.

**Termine** — pro Tag Termine mit Uhrzeit, Ort, Notiz und den Teilnehmern (Mama, Papa, Kind —
mehrere gleichzeitig, ohne Auswahl gilt der Termin für alle). Was sich regelmäßig wiederholt,
wird zum **Serientermin**: wöchentlich bis vierwöchentlich, auf Wunsch mit Enddatum. Ein
einzelner Tag einer Serie lässt sich verschieben oder absagen, ohne die übrigen anzufassen.
Zu jedem Termin lässt sich eine **Erinnerung** stellen, von zehn Minuten bis einen Tag vorher —
siehe [Erinnerungen](#erinnerungen). In jedem Tag steht fest der
Bettdienst-Balken von 19:00 bis 20:00 Uhr, farbig nach 👩 Mama bzw. 👨 Papa. Der Dienst wechselt
täglich und läuft über das Wochenende hinweg weiter, sodass beide über zwei Wochen auf gleich
viele Abende kommen. Ein Tipp auf den Balken tauscht einen einzelnen Tag, „Rotation tauschen“
dreht die ganze Reihenfolge um.

Eine ausdruckbare Fassung von Plan, Rezepten und Einkaufsliste liegt unter
[`docs/Wochenplan.md`](docs/Wochenplan.md).

## Einrichten

### 1. Supabase-Projekt vorbereiten

1. **Projekt anlegen** auf [supabase.com](https://supabase.com) (der kostenlose Tarif genügt).

2. **Schema einspielen:** Im Supabase-Dashboard `SQL Editor` öffnen, den Inhalt von
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) einfügen und
   ausführen. Das legt die Tabellen `households`, `household_members` und `planner_docs` an,
   schaltet Row Level Security ein und aktiviert Realtime. Das Skript ist so geschrieben, dass
   es sich gefahrlos erneut ausführen lässt.

3. **Registrierung freischalten:** Ebenfalls im `SQL Editor`
   [`supabase/migrations/0002_signup_allowlist.sql`](supabase/migrations/0002_signup_allowlist.sql)
   ausführen. Damit kann sich **nur** registrieren, wessen Adresse in der Liste steht — wichtig,
   weil die App öffentlich erreichbar ist. Am Ende der Datei stehen die beiden Einzeiler zum
   Ergänzen und Entziehen von Adressen.

4. **Anmeldung konfigurieren:** Unter `Authentication → Providers` muss `Email` aktiv sein.
   Standardmäßig verlangt Supabase eine Bestätigung der E-Mail-Adresse; für zwei Konten in der
   Familie ist das gut so. Wer es sich einfacher machen will, schaltet unter
   `Authentication → Sign In / Providers → Email` die Bestätigung ab — dann kann man sich
   sofort nach der Registrierung anmelden.

### 2. Zugangsdaten

Die Werte des Projekts stehen in [`.env.production`](.env.production) und liegen bewusst im
Repository: Vite backt sie beim Build in das JavaScript ein, sie sind für jeden Besucher der Seite
ohnehin sichtbar. Genau dafür ist der `anon`-Key gedacht — er erlaubt für sich genommen nichts,
weil jede Tabelle durch Row Level Security geschützt ist. Der `service_role`-Key gehört niemals in
eine Frontend-App und taucht hier auch nirgends auf.

Für ein anderes Supabase-Projekt einfach die beiden Werte in dieser Datei austauschen.

### 3. Lokal starten

```bash
npm install
cp .env.production .env   # der Entwicklungsserver liest .env, nicht .env.production
npm run dev
```

Die App läuft dann auf <http://localhost:5173>.

### 4. Auf Vercel veröffentlichen

Repository in Vercel importieren — durch [`vercel.json`](vercel.json) sind Framework, Build-Befehl
und Ausgabeordner gesetzt, und die Zugangsdaten kommen aus `.env.production`. Es ist also nichts
weiter zu konfigurieren.

Danach einmal in Supabase unter `Authentication → URL Configuration` die Vercel-Adresse eintragen:
als **Site URL** die Produktionsdomain, unter **Redirect URLs** zusätzlich
`https://dein-projekt.vercel.app/**` und `http://localhost:5173/**`. Ohne diesen Schritt laufen die
Links aus den Bestätigungs- und „Passwort vergessen“-Mails ins Leere.

### 5. Auf Handy und Tablet

Adresse im Browser öffnen, anmelden und über „Zum Home-Bildschirm hinzufügen“ ablegen — dann
verhält sich die App wie eine installierte App. Die Anmeldung bleibt bestehen, bis man sich
abmeldet.

## Wöchentlich neue Rezepte

Die mitgelieferte Bibliothek deckt zwei Monate ohne Wiederholung ab. Damit es danach nicht
langweilig wird, kann die App neue Rezepte erzeugen lassen: Im Reiter **Rezepte** holt
„3 neue Rezepte holen" passende Vorschläge, die sofort im Essensplan und in der Einkaufsliste
nutzbar sind. Zeigt der Kasten „Es ist über eine Woche her", ist Nachschub fällig.

Technisch läuft das über die Edge Function
[`supabase/functions/generate-recipes`](supabase/functions/generate-recipes/index.ts): Sie ruft
Claude Opus 5 mit einem festen JSON-Schema auf, sodass Zutaten, Mengen, Kategorien und Schritte
im selben Format ankommen wie die eingebauten Rezepte. Der Haushalt wird aus dem Token des
angemeldeten Nutzers abgeleitet, nicht aus dem Request — fremde Haushalte sind damit nicht
ansprechbar. Antworten werden geprüft, bevor sie gespeichert werden: zu kurze oder unvollständige
Rezepte fliegen raus, Dubletten ebenso.

### Einrichten

1. **Schema:** [`supabase/migrations/0003_recipes.sql`](supabase/migrations/0003_recipes.sql)
   im SQL-Editor ausführen. Legt die Tabelle `recipes` je Haushalt an, mit Row Level Security
   und Realtime.

2. **API-Key:** In Supabase unter `Edge Functions` → `Secrets` den Eintrag `ANTHROPIC_API_KEY`
   anlegen (Key aus der [Anthropic Console](https://console.anthropic.com)). Fehlt er, meldet die
   App das im Klartext statt zu scheitern.

3. **Funktion deployen:** Mit der Supabase CLI
   `supabase functions deploy generate-recipes --project-ref <ref>`.

### Kosten

Ein Aufruf erzeugt drei Rezepte und kostet grob 3–10 Cent. Wer wöchentlich nachlegt, landet bei
etwa 15–40 Cent im Monat. Die Abrechnung läuft über dein Anthropic-Konto, nicht über Supabase.

### Bibliothek erweitern

Kommen eigene Rezepte in `src/data/recipes.ts` dazu, gehören ihre Titel auch in die Liste
`BUILTIN_TITLES` in der Edge Function — sonst kann Claude sie erneut vorschlagen. Neue Zutaten
gehören entsprechend nach `BUILTIN_INGREDIENTS` (mit Einheit) bzw. `BUILTIN_PANTRY`: Die Funktion
schickt diese Namen mit und verlangt, dass Claude sie wortgleich übernimmt. Sonst stehen
„Paprika“ und „Paprika (rot/gelb)“ als zwei Zeilen in der Einkaufsliste, weil nur zusammengezählt
wird, was gleich heißt. Zutaten aus bereits erzeugten Rezepten kommen automatisch dazu.

## Erinnerungen

Jeder Termin kann eine Vorlaufzeit bekommen — „30 Minuten vorher“, „einen Tag vorher“ und was
dazwischen liegt. Wann es klingelt, steht am Termin; **ob** es klingelt, entscheidet jedes Gerät
für sich in den Einstellungen (⚙️ → Erinnerungen). Dort lässt sich auch einstellen, dass nur
Termine mit einer bestimmten Person gemeldet werden — praktisch, wenn Papas Handy nicht bei
jedem Kindergeburtstag von Mama piept.

Es gibt zwei Wege, und der erste funktioniert ohne jede Einrichtung:

1. **Solange die App läuft.** Der Wochenplan prüft jede Minute, was ansteht, und zeigt die
   Erinnerung über den Service Worker an. Der Tab darf dabei im Hintergrund liegen. Nichts
   einzurichten — Benachrichtigungen im Browser erlauben, fertig.

2. **Auch bei geschlossener App** (echtes Web-Push). Dafür verschickt die Edge Function
   [`send-reminders`](supabase/functions/send-reminders/index.ts) die Erinnerungen, angestoßen
   von einem Cron-Job in Supabase. Das braucht die Einrichtung unten.

Auf dem iPhone zeigt Safari Benachrichtigungen erst, wenn die Seite über „Zum Home-Bildschirm
hinzufügen“ abgelegt wurde — auf Android und am Rechner geht es direkt.

### Push einrichten

1. **Schema:** [`supabase/migrations/0004_reminders.sql`](supabase/migrations/0004_reminders.sql)
   im SQL-Editor ausführen. Legt `push_subscriptions` (ein Eintrag je Gerät) und `reminder_sent`
   (was schon rausging) an, beide mit Row Level Security.

2. **Schlüsselpaar erzeugen:**

   ```bash
   npx web-push generate-vapid-keys
   ```

   Der Aufruf gibt einen öffentlichen und einen privaten Schlüssel aus. Sie identifizieren den
   Absender gegenüber den Push-Diensten von Google, Apple und Mozilla.

3. **Schlüssel hinterlegen:** Den öffentlichen Schlüssel in [`.env.production`](.env.production)
   als `VITE_VAPID_PUBLIC_KEY` eintragen (er landet im Frontend und darf das auch). In Supabase
   unter `Edge Functions` → `Secrets` kommen `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` und
   `VAPID_SUBJECT` (eine `mailto:`-Adresse für Rückfragen der Push-Dienste) dazu. Der private
   Schlüssel gehört ausschließlich dorthin.

4. **Funktion deployen:**

   ```bash
   supabase functions deploy send-reminders --project-ref <ref>
   ```

5. **Zeitplan einrichten:** Am Ende von `0004_reminders.sql` steht der fertige `cron.schedule`-
   Aufruf zum Kopieren — alle fünf Minuten reicht, weil die kürzeste Vorlaufzeit zehn Minuten
   beträgt.

Danach erscheint in den Einstellungen der Schalter „Auch bei geschlossener App melden“. Ein
Gerät, das der Browser abgemeldet hat, räumt die Funktion beim nächsten Lauf selbst aus der
Tabelle. Beim Abmelden aus der App verschwindet das Abo ebenfalls — auf einem gemeinsam
genutzten Tablet bekommt niemand die Termine des vorherigen Kontos.

Uhrzeiten stehen im Plan ohne Zeitzone, gemeint ist die Ortszeit der Familie. Die Funktion rechnet
mit `Europe/Berlin`; wer anderswo wohnt, setzt das Secret `REMINDER_TIMEZONE`.

## Konten und Haushalt

Beim ersten Start nach der Registrierung fragt die App, ob ein **neuer Haushalt** angelegt werden
soll oder ob man einem bestehenden **beitritt**. Ein Haushalt bündelt den Plan; beide Elternteile
haben ein eigenes Konto mit eigenem Passwort und arbeiten im selben Haushalt.

So läuft es zu zweit ab:

1. Elternteil A registriert sich und legt einen Haushalt an.
2. In den Einstellungen (⚙️) steht der **Haushalts-Code**. Kopieren und persönlich weitergeben.
3. Elternteil B registriert sich auf dem eigenen Gerät und gibt den Code beim ersten Start ein.

Der Code ist ein Schlüssel: Wer ihn kennt und ein Konto hat, kann dem Haushalt beitreten — also
nicht in einen öffentlichen Chat stellen. Ein Konto bekommt ohnehin nur, wessen Adresse in der
Freischaltliste steht (siehe Schritt 3 oben).

Fällt das Netz aus, arbeitet die App mit einer lokalen Kopie weiter und schreibt beim nächsten
erfolgreichen Speichern zurück. Beim Abmelden wird diese Kopie vom Gerät gelöscht — praktisch für
ein Tablet, das mehrere in die Hand nehmen.

## Aufbau

```
public/sw.js            Service Worker: zeigt Erinnerungen an, nimmt Push entgegen
src/
  data/recipes.ts       Rezeptbibliothek (Zutaten, Schritte, Kinder-Tipps)
  lib/week.ts           Wochenlogik: Kalenderwoche, Datumsrechnung, Bettdienst-Rotation
  lib/series.ts         Serientermine in die Termine einer Woche ausklappen
  lib/shopping.ts       Einkaufsliste aus dem Wochenplan berechnen und gruppieren
  lib/notifications.ts  Erlaubnis, Service Worker und Einstellungen je Gerät
  storage/local.ts      Offline-Kopie im Browser, getrennt je Haushalt
  storage/supabase.ts   Login, Haushalte und Datenspeicher inkl. Realtime
  storage/push.ts       An- und Abmelden beim Push-Dienst des Browsers
  hooks/usePlanner.ts   Laden, Speichern (entprellt) und Wochenwechsel
  hooks/useReminders.ts Prüft im Minutentakt, welche Erinnerung fällig ist
  components/           Oberfläche: Login, Essensplan, Einkauf, Termine, Rezepte, Einstellungen
supabase/migrations/    SQL-Schema für Supabase
supabase/functions/     Edge Functions: Rezepte erzeugen, Erinnerungen verschicken
scripts/generate-plan.ts  Erzeugt docs/Wochenplan.md aus den Rezeptdaten (`npm run plan`)
```

Alle Daten liegen als benannte JSON-Dokumente (`week:2026-07-27`, `settings`, `series`). Das hält
beide Speicher-Backends simpel und erlaubt spätere Erweiterungen ohne Datenbank-Migration.
Serientermine stehen bewusst in einem eigenen Dokument statt in jeder Woche: eine Änderung wirkt
damit sofort auf alle Wochen, auch auf die, die noch niemand geöffnet hat. Beim Anzeigen werden
sie in die jeweilige Woche ausgeklappt; ein einzeln abgesagter Tag steht als Ausnahme in der Serie.

## Eigene Rezepte ergänzen

In `src/data/recipes.ts` einen weiteren Eintrag anlegen — wichtig sind eine eindeutige `id`,
`servings` (auf welche Portionszahl sich die Mengen beziehen) und die `cat`-Angabe je Zutat,
damit die Zutat in der Einkaufsliste in der richtigen Abteilung landet. Zutaten wie Salz oder Öl
bekommen `pantry: true` und erscheinen dann unter „Vorrat prüfen“ statt mit einer Menge.

## Wie es weitergehen könnte

Ideen für den weiteren Ausbau — nach Nutzen im Alltag sortiert, mit grober Größe und dem Hinweis,
was davon eine Datenbank-Migration braucht — stehen in [`docs/Roadmap.md`](docs/Roadmap.md).
