# Familien-Wochenplan

Eine kleine Web-App für die Wochenplanung einer Familie: Essensplan von Montag bis Sonntag,
die passenden Rezepte, eine automatisch berechnete Einkaufsliste und ein Terminplan, in dem
abends der Bettdienst zwischen Mama und Papa rotiert.

Die App läuft sofort ohne jede Einrichtung — dann wird alles im Browser des Geräts gespeichert.
Wer den Plan auf mehreren Geräten synchron haben möchte, hängt optional Supabase an.

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

## Starten

```bash
npm install
npm run dev
```

Die App läuft dann auf <http://localhost:5173>. Ein Produktions-Build entsteht mit `npm run build`
im Ordner `dist/` und lässt sich auf jedem Static-Hosting (Netlify, Vercel, GitHub Pages,
Supabase Hosting) ablegen.

Auf dem Handy: Seite im Browser öffnen und über „Zum Home-Bildschirm hinzufügen“ ablegen —
dann verhält sie sich wie eine App.

## Synchronisierung mit Supabase (optional)

Ohne diesen Schritt speichert die App alles lokal im Browser. Das reicht, wenn nur ein Gerät
im Spiel ist. Für zwei Handys plus Laptop:

1. **Projekt anlegen** auf [supabase.com](https://supabase.com) (der kostenlose Tarif genügt).

2. **Schema einspielen:** Im Supabase-Dashboard `SQL Editor` öffnen, den Inhalt von
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) einfügen und
   ausführen. Das legt die Tabellen `households`, `household_members` und `planner_docs` an,
   schaltet Row Level Security ein und aktiviert Realtime.

3. **Zugangsdaten eintragen:** `.env.example` nach `.env` kopieren und die beiden Werte aus
   `Project Settings → API` einsetzen:

   ```
   VITE_SUPABASE_URL=https://dein-projekt.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```

   Nur den `anon`-Key verwenden — er ist für den Browser gedacht. Der `service_role`-Key gehört
   niemals in eine Frontend-App.

4. **Anmelden:** App neu starten, ⚙️ öffnen, E-Mail eintragen, „Login-Link schicken“. Supabase
   verschickt einen Magic Link; nach dem Klick ist man angemeldet und ein Haushalt wird angelegt.

5. **Zweites Gerät dazuholen:** Der Haushalts-Code (eine UUID) steht in den Einstellungen. Auf dem
   zweiten Gerät anmelden, den Code unter „Einem bestehenden Haushalt beitreten“ einfügen —
   fertig. Änderungen erscheinen dank Realtime sofort auf dem anderen Gerät.

   Der Code ist wie ein Schlüssel: Wer ihn kennt und angemeldet ist, kann dem Haushalt beitreten.
   Also nur persönlich weitergeben, nicht in einen öffentlichen Chat stellen.

Fällt das Netz aus, arbeitet die App mit der lokalen Kopie weiter und schreibt beim nächsten
erfolgreichen Speichern zurück.

## Aufbau

```
src/
  data/recipes.ts       Rezeptbibliothek (Zutaten, Schritte, Kinder-Tipps)
  lib/week.ts           Wochenlogik: Kalenderwoche, Datumsrechnung, Bettdienst-Rotation
  lib/shopping.ts       Einkaufsliste aus dem Wochenplan berechnen und gruppieren
  storage/local.ts      Speicherung im Browser (Standard)
  storage/supabase.ts   Speicherung in Supabase inkl. Login und Realtime
  hooks/usePlanner.ts   Laden, Speichern (entprellt) und Wochenwechsel
  components/           Oberfläche: Essensplan, Einkauf, Termine, Rezepte, Einstellungen
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
