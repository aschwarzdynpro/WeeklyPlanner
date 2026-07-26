# Roadmap

Was die App heute kann, steht im [README](../README.md): Essensplan, Rezepte, Einkaufsliste und
Termine mit Bettdienst, Serien und Erinnerungen — für einen Haushalt mit zwei Konten.

Diese Liste sammelt, was danach sinnvoll wäre. Sortiert ist sie nach dem, was im Alltag am
schnellsten spürbar wird, nicht nach technischer Eleganz. Jeder Punkt trägt eine grobe Größe
(**S** = ein Abend, **M** = ein Wochenende, **L** = mehrere) und den Hinweis, ob eine
Datenbank-Migration nötig ist. Nichts davon ist beschlossen — es ist eine Einkaufsliste, aus der
man sich bedient.

## Phase 1 — Fundament nachziehen ✅ erledigt

Kleine Dinge, die später viel Arbeit sparen. Zwei davon waren eigentlich Lücken, keine Features.

- **App-Manifest und Installation** ✅
  `public/manifest.webmanifest` samt Icons aus `scripts/generate-icons.ts` und den Apple-eigenen
  Meta-Angaben, die iOS statt des Manifests liest. Der Service Worker beantwortet Anfragen jetzt
  auch ohne Netz — das verlangt Chrome für die Installierbarkeit, und im Supermarkt ist es
  ohnehin praktisch.

- **Personen konfigurierbar machen** ✅
  Die Personen stehen als Liste im `settings`-Dokument, mit Name, Zeichen, Farbe und einem Haken
  für den Bettdienst. Die Rotation verteilt reihum, egal auf wie viele. Die mitgelieferten drei
  behalten die ids `mama`, `papa` und `kind` — deshalb war an vorhandenen Daten nichts
  umzuschreiben, nur `0005_people.sql` lockert die Prüfung an den Push-Abos.

- **Ganztägige und mehrtägige Termine** ✅
  Als eigener Begriff „Zeitraum" im Dokument `spans`, mit Anzeige über der Woche und in jedem
  betroffenen Tag. Läuft über Wochengrenzen hinaus, weil er nicht in den Wochendokumenten liegt.

- **Tests für die Rechenlogik** ✅
  Vitest, `npm test`: Kalenderwoche, Bettdienst-Rotation, Serien, Zeiträume, Einkaufsliste und die
  Migration alter Daten — die reinen Funktionen in `src/lib`. Nicht abgedeckt sind die
  React-Komponenten; dafür bräuchte es jsdom und eine Testbibliothek.

## Phase 2 — Alltag

Das, was jede Woche Zeit oder Diskussionen spart.

- **Aufgaben mit Rotation** (M, keine Migration)
  Müll rausbringen, Wäsche, Küche — dieselbe Frage wie beim Bettdienst, dieselbe Lösung. Die
  Rotationslogik ist da, sie muss nur von „ein Balken pro Tag" zu „mehrere benannte Aufgaben"
  wachsen. Wochenweise abhaken, Bilanz am Ende.

- **Einkaufsliste: Stammartikel und Läden** (M, keine Migration)
  Milch, Butter, Klopapier stehen ohnehin jede Woche drauf — die gehören auf eine Vorlage, die
  sich per Knopfdruck dazuholt. Dazu die Zuordnung zu Läden (Supermarkt, Drogerie, Bäcker),
  damit im Laden nur steht, was dort auch zu haben ist.

- **Mittag und Abend trennen** (M, keine Migration)
  Der Plan kennt ein Gericht pro Tag. Wer Kita- oder Schulessen hat, plant abends anders als
  mittags; am Wochenende ist es umgekehrt. Zwei Felder pro Tag, jedes optional, mit „Kita",
  „Reste" und „Auswärts" als schnelle Antworten.

- **Wetter im Tageskopf** (S, keine Migration)
  Zwei Zeilen Code gegen Open-Meteo, kein Konto und kein Schlüssel nötig. Beantwortet die Frage
  „Regenjacke oder nicht?" beim Blick auf den Plan, statt in einer zweiten App.

- **Anwesenheit** (M, braucht Phase-1-Personen)
  Wer ist diese Woche überhaupt da? Beeinflusst Portionen in der Einkaufsliste und macht sichtbar,
  wann jemand Abendtermine besser nicht legt.

## Phase 3 — Weniger tippen

Die Edge Function für Rezepte zeigt, dass der Weg funktioniert. Diese drei Punkte nutzen ihn dort,
wo Tippen am Handy wirklich lästig ist.

- **Termin als Freitext anlegen** (M, keine Migration)
  „Freitag 15 Uhr Zahnarzt fürs Kind in der Hauptstraße" in ein Feld, fertiger Termin heraus —
  mit Tag, Uhrzeit, Ort und Teilnehmer. Zusammen mit der Diktierfunktion der Handytastatur ist das
  der schnellste Weg, den es gibt. Wichtig: Ergebnis vor dem Speichern zeigen, nicht blind
  übernehmen.

- **Rezept aus einem Link übernehmen** (M, keine Migration)
  Rezeptseiten sind voller Werbung und Lebensgeschichten. Adresse einwerfen, Zutaten und Schritte
  im Format der Bibliothek herausbekommen — inklusive der Schreibweisen, auf die die
  Einkaufsliste beim Zusammenzählen angewiesen ist.

- **Wochenvorschlag, der die Termine kennt** (L, keine Migration)
  Der Unterschied zu „3 neue Rezepte holen": nicht Nachschub für die Bibliothek, sondern ein
  Vorschlag für genau diese Woche. Dienstag ist Turnen bis 17:30 — also etwas, das in zwanzig
  Minuten fertig ist. Sonntag ist Zeit, also etwas mit Ofen. Was letzte Woche schon dran war,
  fällt weg.

## Phase 4 — Zusammenspiel mit dem Rest der Welt

- **Fremde Kalender abonnieren** (M, Migration für die Abo-Liste)
  Kita, Schule und Verein veröffentlichen ihre Termine oft als ICS-Adresse. Nur lesend einbinden,
  farblich abgesetzt, nicht bearbeitbar — dann stehen Schließtage und Elternabende von allein im
  Plan.

- **Eigene Termine als Kalender-Abo herausgeben** (M, Migration für den Zugriffsschlüssel)
  Die Gegenrichtung: eine ICS-Adresse mit langem Zufallsschlüssel, die sich im Handykalender
  abonnieren lässt. Damit taucht der Familienplan neben den Arbeitsterminen auf, ohne dass beide
  Welten verheiratet werden müssen.

- **Einkaufsliste per Link teilen** (M, Migration für die Freigabe)
  Wenn Oma unterwegs mitbringt, soll sie die Liste sehen und abhaken können — ohne Konto, ohne
  Zugriff auf den Rest des Haushalts.

- **Druckansicht für den Kühlschrank** (S, keine Migration)
  `docs/Wochenplan.md` gibt es schon, aber nur über die Kommandozeile. Dieselbe Ansicht aus der
  App heraus, auf eine Seite gesetzt.

## Querschnitt

Nichts davon sieht man, alles davon merkt man, wenn es fehlt.

- **Sync-Konflikte behandeln** (M, keine Migration)
  Heute gewinnt, wer zuletzt speichert. Ändern beide Elternteile gleichzeitig denselben Tag, geht
  eine Änderung verloren — still. Mindestens erkennen und melden; besser feldweise
  zusammenführen, weil sich Termine, Essen und Einkaufsliste ohnehin selten überschneiden.

- **Papierkorb und Rückgängig** (S, keine Migration)
  Ein Fehlgriff löscht einen Termin sofort und endgültig. Gelöschtes vierzehn Tage aufheben reicht
  völlig.

- **Datenexport und -import** (S, keine Migration)
  Alles als JSON herunterladen. Beruhigt bei einem Dienst, dessen kostenloser Tarif Projekte nach
  längerer Untätigkeit pausiert — und macht einen Umzug jederzeit möglich.

- **Schema-Version in den Dokumenten** (S, keine Migration)
  Beim Laden wird heute defensiv repariert, was nicht passt. Eine Versionsnummer im Dokument macht
  aus dem Reparieren ein gezieltes Migrieren — sinnvoll spätestens beim übernächsten Umbau am
  Datenmodell.

## Bewusst nicht

- **Vollständiger Zwei-Wege-Abgleich mit Google- oder Apple-Kalender.** Klingt naheliegend, ist in
  der Pflege aber ein Fass ohne Boden: Konflikte, wiederkehrende Termine mit Ausnahmen, abgelaufene
  Tokens. Das Abo in beide Richtungen (Phase 4) deckt den Nutzen zu einem Bruchteil der Kosten.
- **Chat oder Nachrichten in der App.** Dafür gibt es das Familien-Telefon. Eine Pinnwand für
  Notizen am Wochenplan ist etwas anderes und darf gern kommen.
- **Standort der Kinder.** Technisch einfach, in einer Wochenplan-App aber am falschen Platz.
- **Punkte, Sterne und Wettbewerb für alle.** Ein Sticker fürs Zähneputzen ist charmant; ein
  Punktestand zwischen den Eltern ist es nicht.
