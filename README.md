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

**Termine** — pro Tag Termine mit Uhrzeit, Person und Notiz. In jedem Tag steht fest der
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

Kommen eigene Rezepte in `src/data/recipes.ts` dazu, gehört ihr Titel auch in die Liste
`BUILTIN_TITLES` in der Edge Function — sonst kann Claude sie erneut vorschlagen.

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
src/
  data/recipes.ts       Rezeptbibliothek (Zutaten, Schritte, Kinder-Tipps)
  lib/week.ts           Wochenlogik: Kalenderwoche, Datumsrechnung, Bettdienst-Rotation
  lib/shopping.ts       Einkaufsliste aus dem Wochenplan berechnen und gruppieren
  storage/local.ts      Offline-Kopie im Browser, getrennt je Haushalt
  storage/supabase.ts   Login, Haushalte und Datenspeicher inkl. Realtime
  hooks/usePlanner.ts   Laden, Speichern (entprellt) und Wochenwechsel
  components/           Oberfläche: Login, Essensplan, Einkauf, Termine, Rezepte, Einstellungen
supabase/migrations/    SQL-Schema für Supabase
scripts/generate-plan.ts  Erzeugt docs/Wochenplan.md aus den Rezeptdaten (`npm run plan`)
```

Alle Daten liegen als benannte JSON-Dokumente (`week:2026-07-27`, `settings`). Das hält beide
Speicher-Backends simpel und erlaubt spätere Erweiterungen ohne Datenbank-Migration.

## Eigene Rezepte ergänzen

In `src/data/recipes.ts` einen weiteren Eintrag anlegen — wichtig sind eine eindeutige `id`,
`servings` (auf welche Portionszahl sich die Mengen beziehen) und die `cat`-Angabe je Zutat,
damit die Zutat in der Einkaufsliste in der richtigen Abteilung landet. Zutaten wie Salz oder Öl
bekommen `pantry: true` und erscheinen dann unter „Vorrat prüfen“ statt mit einer Menge.
