# Cookidoo anbinden — Befund und Plan

Ziel: Gerichte aus dem eigenen Cookidoo-Bestand im Essensplan auswählen können, zusätzlich zur
mitgelieferten Bibliothek und den erzeugten Rezepten. Und ein geplantes Gericht per Knopfdruck an
den Thermomix schicken.

Dieses Dokument hält fest, was technisch geht, wo die Grenzen liegen und in welcher Reihenfolge
wir vorgehen. Stand: August 2026.

## Befund

### Es gibt kein offizielles API

Vorwerk betreibt Cookidoo als geschlossenes Ökosystem, ohne Entwicklerprogramm und ohne
dokumentierte Schnittstelle. Was es gibt, sind rekonstruierte Clients: allen voran
[`miaucl/cookidoo-api`](https://github.com/miaucl/cookidoo-api) (Python, MIT), auf dem die
[offizielle Home-Assistant-Integration](https://www.home-assistant.io/integrations/cookidoo/)
aufsetzt. Die Endpunkte dort stammen aus dem mitgeschnittenen Verkehr der Android-App; das Repo
dokumentiert rund 51 rohe Anfragen.

### Die Endpunkte, auf die es ankommt

Aus `cookidoo_api/const.py`, gekürzt auf das für uns Relevante:

| Zweck | Pfad |
| --- | --- |
| Anmeldung | `ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login` |
| Rezeptdetails inkl. Zutaten | `recipes/recipe/{sprache}/{id}` |
| Eigene Sammlungen (Kochbücher) | `organize/{sprache}/api/managed-list` |
| Eigene Listen | `organize/{sprache}/api/custom-list` |
| **Wochenplan lesen** | `planning/{sprache}/api/my-week/{tag}` |
| **Rezept auf einen Tag legen** | `planning/{sprache}/api/my-day` |
| Rezept vom Tag entfernen | `planning/{sprache}/api/my-day/{tag}/recipes/{rezept}` |
| Zutaten eines Rezepts auf die Einkaufsliste | `shopping/{sprache}/recipes/add` |
| Abo-Status | `ownership/subscriptions` |

### Der Anmeldeflow, nachgemessen

Es gibt kein Bearer-Token; angemeldet wird über den Browser-Ablauf, und die Sitzung steckt danach
in Cookies. Die Kette ist am 01.08.2026 gegen die echte Seite nachgemessen worden (nur die
öffentlichen Schritte, ohne Zugangsdaten):

```
GET  cookidoo.de/profile/de-DE/login?redirectAfterLogin=…   → 302
     cookidoo.de/oauth2/start                                → 302
     ciam.prod.cookidoo.vorwerk-digital.com/authz-srv/authz  → 302
     eu.login.vorwerk.com/ciam/login                         → 200
```

Auf der Seite steht ein Formular mit genau drei Feldern — `requestId` (versteckt), `username`,
`password` — und dem Ziel `https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login`. Das
deckt sich mit der Referenzimplementierung. Eine Captcha- oder Turnstile-Hürde ist auf der Seite
nicht zu sehen; Cloudflare setzt lediglich ein `__cf_bm`-Cookie.

Für uns heißt das zweierlei: Der Ablauf lässt sich nachbauen, aber `fetch` allein reicht nicht —
es braucht einen eigenen Cookie-Speicher und Weiterleitungen von Hand, weil `fetch` unterwegs
gesetzte Cookies nicht aufhebt. Genau das tut
[`supabase/functions/cookidoo/client.ts`](../supabase/functions/cookidoo/client.ts).

### „An den Thermomix schicken" hat einen Weg

Es gibt keine Verbindung zum Gerät selbst — und es braucht auch keine. Der TM6 meldet sich am
Cookidoo-Konto an und **synchronisiert von dort automatisch**, unter anderem „Mein Wochenplan".
Ein Rezept auf einen Tag zu legen (`my-day`) ist also genau der Knopf, den wir wollen: Das Gericht
taucht nach der nächsten Synchronisierung auf dem Gerät auf.

Das heißt zugleich: Es ist kein sofortiges „Senden", sondern ein Eintrag, den das Gerät abholt.
Die Rückmeldung in der App muss das ehrlich benennen.

### Es gibt doch eine Suche

Ein erster Blick nur in die Konstanten der Referenzimplementierung legte nahe, dass es keine
Suche gibt. Das war falsch: Sie wird im Code zusammengesetzt statt als Konstante hinterlegt.

```
GET https://{host}/search/{sprache}?query=…&tmv=TM6&totalTime=…&pageSize=…
```

Mit Filtern für Zutaten, ausgeschlossene Zutaten, Bewertung, Schwierigkeit, Zubereitungs- und
Gesamtzeit, Portionen, Kategorien, Seitenzahl — und `tmv` für den **Gerätetyp**, damit nur
Rezepte kommen, die der eigene Thermomix auch kann.

**Konsequenz für die Rezeptauswahl:** Sie kann sich aus beidem speisen — der Suche über den
Katalog und den eigenen Sammlungen. Wir fangen mit den eigenen Sammlungen an (kuratiert, klein,
sofort brauchbar) und legen die Suche daneben.

### Grenzen, die wir einhalten

Die [Nutzungsbedingungen](https://cookidoo.de/consent/web/documents/de-DE/latest/tos) untersagen in
Ziffer 1.3.6 den „Download von Inhalten durch andere technische Mittel", die „Vervielfältigung von
Inhalten" und die „Übertragung von Inhalten an Dritte". Ein rekonstruierter Client bleibt damit im
Graubereich — Home Assistant liefert seit Jahren einen aus, ohne dass Vorwerk eingeschritten wäre,
aber eine Zusicherung ist das nicht.

Die Linie, die wir ziehen:

- **Nur das eigene Konto der Familie.** Keine fremden Konten, kein geteilter Zugang.
- **Keine Katalogsuche per Scraping.**
- **Keine Rezepttexte in unsere Datenbank.** Gespeichert wird eine Referenz: id, Titel, Bild-Adresse,
  Link. Wer das Rezept lesen will, landet in Cookidoo.
- **Nichts davon öffentlich.** Die Daten bleiben hinter der Anmeldung im Haushalt.

Wenn Vorwerk das API ändert oder den Zugang schließt, ist die Anbindung weg. Die App muss ohne sie
unverändert funktionieren — deshalb hängt alles hinter einem Schalter.

## Architektur

```
Browser (SPA)
   │  supabase.functions.invoke('cookidoo', { action, … })
   ▼
Edge Function 'cookidoo' (Deno)          ← läuft mit dem JWT des Nutzers,
   │  Zugriffstoken im Speicher,            Haushalt kommt aus dem Token
   │  Refresh-Token verschlüsselt in der DB
   ▼
cookidoo.de / ciam.prod.cookidoo.vorwerk-digital.com
```

Warum eine Edge Function: Der Browser kann Cookidoo nicht direkt aufrufen (CORS), und die
Zugangsdaten haben im Frontend ohnehin nichts verloren. Das Muster steht bereits — `generate-recipes`
arbeitet genauso.

### Zugangsdaten

Neue Tabelle `cookidoo_accounts`, ein Eintrag je Haushalt:

| Spalte | Inhalt |
| --- | --- |
| `household_id` | Primärschlüssel, verweist auf `households` |
| `email` | zur Anzeige („verbunden als …") |
| `refresh_token` | **verschlüsselt** (AES-GCM in der Funktion, Schlüssel als Edge-Secret `COOKIDOO_SECRET`) |
| `language` | z. B. `de-DE` |
| `linked_at`, `last_ok_at`, `last_error` | für die Statusanzeige |

**Das Passwort wird nicht gespeichert.** Es geht einmalig durch die Funktion, um den ersten Token
zu holen, und wird danach vergessen. Läuft der Refresh-Token ab, meldet die App „Bitte Cookidoo
neu verbinden". Das ist der Preis dafür, kein Dauerpasswort zu lagern — ein fairer Tausch.

Restrisiko, offen gesagt: Wer sowohl an den `service_role`-Key als auch an `COOKIDOO_SECRET`
kommt, kommt an das Cookidoo-Konto. Die Verschlüsselung schützt gegen ein Datenleck der Datenbank
allein, nicht gegen einen kompromittierten Supabase-Zugang.

### Rezepte im Datenmodell

Die Tabelle `recipes` kennt heute `source: 'ki' | 'eigen'`. Dazu kommt `'cookidoo'` und drei
Spalten: `cookidoo_id`, `url`, `image_url` (Migration 0006). Zutaten und Schritte bleiben bei
Cookidoo-Rezepten leer — siehe „Einkaufsliste" unten.

### Einkaufsliste

Die Zutaten eines Cookidoo-Rezepts könnten wir über `recipes/recipe/{sprache}/{id}` holen und in
unsere Mengenrechnung einbauen. Das wäre die schönere Integration (Portionsumrechnung, Kategorien,
Zusammenzählen) — und genau die Vervielfältigung, die Ziffer 1.3.6 nennt.

Der Weg, den wir stattdessen gehen: Wenn ein Gericht an den Thermomix geht, legt dieselbe Aktion
seine Zutaten über `shopping/{sprache}/recipes/add` auf **Cookidoos** Einkaufsliste. Unsere
Einkaufsliste holt diese Positionen und zeigt sie als eigene Gruppe „Aus Cookidoo" — abhakbar, aber
ohne eigene Mengenrechnung. Die Rezeptinhalte bleiben damit dort, wo sie hingehören, und die
Familie hat trotzdem eine Liste.

## Vorgehen

### Schritt 0 — Machbarkeitsnachweis ✅ gebaut, wartet auf euren Lauf

[`supabase/functions/cookidoo`](../supabase/functions/cookidoo/) ist da. Die Funktion speichert
**nichts**: Zugangsdaten kommen bei jedem Aufruf mit, gelten für die Dauer des Aufrufs und werden
danach vergessen. Weder Datenbank noch Protokoll sehen sie. Die verschlüsselte Ablage kommt erst
in Schritt 1 — was hier gebraucht wird, ist nur die Antwort auf eine Frage.

Aktionen: `status` (Anmeldung und Abo), `collections`, `search`, `recipe`, `week`, `plan`,
`unplan`.

**So führt ihr ihn aus — Weg 1, direkt vom eigenen Rechner:**

```bash
npm install          # einmalig
npm run cookidoo:spike
```

Kein Supabase nötig, nichts zu deployen. Das Skript bündelt den Client, fragt nach dem
Cookidoo-Konto und läuft die Schritte durch: anmelden, Abo prüfen, Sammlungen holen, suchen, ein
Rezept auf einen Tag legen. So beantwortet ihr die eigentliche Frage in einem Rutsch.

**Weg 2, über die Edge Function** — prüft zusätzlich genau den Pfad, den die App später nimmt:

```bash
supabase functions deploy cookidoo --project-ref <ref>
npm run cookidoo:spike -- --remote
```

Hier fragt das Skript zuerst nach dem Konto der App (für den Aufruf der Funktion) und danach nach
dem von Cookidoo.

Passwörter werden bei der Eingabe nicht angezeigt und landen weder in einer Datei noch in der
Shell-History. Wer keine Lust auf Tippen hat, kann `COOKIDOO_EMAIL` und `APP_EMAIL` als
Umgebungsvariable setzen — die Passwörter bleiben Eingabe.

**Wenn Weg 1 klappt und Weg 2 nicht,** liegt es vermutlich daran, dass Cookidoo hinter Cloudflare
sitzt: Ein Anschluss von zu Hause wird anders behandelt als ein Rechenzentrum. Das wäre ein
Ergebnis, kein Fehler — dann bräuchte die Anbindung einen anderen Weg nach draußen.

**Danach die entscheidende Prüfung:** Am Thermomix nachsehen, ob das Rezept unter „Mein
Wochenplan" auftaucht.

**Abbruchkriterium:** Scheitert die Anmeldung oder kommt am Gerät nichts an, hören wir hier auf und
bauen stattdessen die einfache Verlinkung (Feld `cookidooUrl` am Rezept, Knopf „In Cookidoo
öffnen"). Das kostet einen Abend und hat keinerlei Risiken.

**Was schon geprüft ist:** Der ganze Ablauf läuft gegen den echten Dienst — Weiterleitungskette,
Cookie-Speicher, Auslesen der `requestId` und auch das Abschicken der Zugangsdaten. Mit einem
erfundenen Konto endet er dort, wo er soll: Cookidoo setzt keine Sitzungs-Cookies, und das Skript
meldet das im Klartext, statt abzustürzen.

Ungeprüft bleibt damit nur der Fall **richtiger** Zugangsdaten: ob danach wirklich eine Sitzung
entsteht, ob Sammlungen und Suche etwas liefern und ob das Rezept am Gerät ankommt. Dafür braucht
es ein Konto mit Abo.

### Schritt 1 — Konto verbinden

Migration 0006, Einstellungen bekommen einen Abschnitt „Cookidoo": verbinden, Status („verbunden
als …, Abo bis …"), trennen. Fehler werden im Klartext angezeigt, nicht verschluckt.

### Schritt 2 — Rezeptauswahl

Der Reiter **Rezepte** bekommt eine Quelle „Cookidoo": die eigenen Sammlungen als Liste mit Bild
und Titel, durchsuchbar innerhalb der geladenen Liste. Dazu „Rezept per Link hinzufügen" für alles,
was in keiner Sammlung liegt. Übernommen wird eine Referenz, kein Rezepttext.

### Schritt 3 — Im Essensplan verwenden

Cookidoo-Gerichte stehen im Auswahldialog gleichberechtigt neben Bibliothek und erzeugten
Rezepten, erkennbar an einem Zeichen. In der Tageskarte ein Knopf „In Cookidoo öffnen".

### Schritt 4 — An den Thermomix schicken

Knopf am Tag: **„An Thermomix schicken"** → legt das Gericht auf das Datum in „Mein Wochenplan"
und seine Zutaten auf Cookidoos Einkaufsliste. Dazu „Ganze Woche schicken" im Essensplan. Wird ein
Gericht getauscht, verschwindet der alte Eintrag wieder. Die Rückmeldung nennt die Wahrheit:
„Steht im Wochenplan — der Thermomix holt es sich bei der nächsten Synchronisierung."

### Schritt 5 — Einkaufsliste zusammenführen (optional)

Die Positionen aus Cookidoos Einkaufsliste als eigene Gruppe in unserer Liste.

## Was wir dafür brauchen

- **Ein Cookidoo-Konto mit aktivem Abo.** Ohne Abo gibt es keinen Zugriff auf die Rezepte.
- **Den Machbarkeitsnachweis führt ihr selbst aus.** Ich baue die Funktion und die Anleitung; das
  Passwort gehört in euer Supabase-Projekt, nicht in eine Chat-Sitzung. Ihr spielt die Funktion
  ein, ruft sie mit euren Daten auf und meldet, was zurückkommt.
- **Sprache und Region** (vermutlich `de-DE`) — sie steckt in jedem Pfad.
- **Gerät:** TM6 oder TM5 mit Cook-Key? Der TM6 synchronisiert von sich aus; beim TM5 hängt es am
  Cook-Key.

## Aufwand, grob

| Schritt | Größe |
| --- | --- |
| 0 — Machbarkeitsnachweis | ✅ gebaut, euer Lauf steht aus |
| 1 — Konto verbinden | ein Abend |
| 2 — Rezeptauswahl | ein Wochenende |
| 3 — Essensplan | ein Abend |
| 4 — An den Thermomix | ein Abend |
| 5 — Einkaufsliste | ein Abend |

Wenn Schritt 0 scheitert: Verlinkung statt allem, ein Abend.
