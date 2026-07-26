/** Kategorien für die Einkaufsliste – bestimmen auch die Reihenfolge im Laden. */
export const CATEGORIES = [
  'Obst & Gemüse',
  'Fleisch & Fisch',
  'Milchprodukte & Eier',
  'Trockenwaren & Konserven',
  'Backwaren',
  'Tiefkühl',
  'Vorrat & Gewürze',
  'Sonstiges',
] as const

export type Category = (typeof CATEGORIES)[number]

export interface Ingredient {
  name: string
  /** Menge für die im Rezept hinterlegte Portionszahl. `null` = "nach Bedarf". */
  qty: number | null
  unit: string
  cat: Category
  /** Vorratsartikel (Salz, Öl …) – landen separat unter "Vorrat prüfen". */
  pantry?: boolean
}

export interface Recipe {
  id: string
  title: string
  subtitle: string
  /** Portionen, auf die sich `ingredients` beziehen. */
  servings: number
  minutes: number
  tags: string[]
  emoji: string
  ingredients: Ingredient[]
  steps: string[]
  /** Was das Kind mitmachen kann. */
  kidTip: string
  /** Für welchen Wochenabschnitt gedacht: Alltag oder Wochenende. */
  kind: 'alltag' | 'wochenende'
}

export type DayKey = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so'

export const DAYS: { key: DayKey; long: string; short: string }[] = [
  { key: 'mo', long: 'Montag', short: 'Mo' },
  { key: 'di', long: 'Dienstag', short: 'Di' },
  { key: 'mi', long: 'Mittwoch', short: 'Mi' },
  { key: 'do', long: 'Donnerstag', short: 'Do' },
  { key: 'fr', long: 'Freitag', short: 'Fr' },
  { key: 'sa', long: 'Samstag', short: 'Sa' },
  { key: 'so', long: 'Sonntag', short: 'So' },
]

/**
 * Ein Mitglied der Familie.
 *
 * Die `id` steht in Terminen, im Bettdienst und in den Push-Abos und darf
 * sich deshalb nie ändern — der angezeigte Name schon. Die drei
 * mitgelieferten Personen behalten die ids `mama`, `papa` und `kind`, die
 * schon in den bisherigen Daten stehen; deshalb braucht es für vorhandene
 * Haushalte keine Umschreibung.
 */
export interface Person {
  id: string
  name: string
  emoji: string
  /** Farbe für den Bettdienst-Balken und die Marker am Termin. */
  color: string
  /** Nimmt an der Bettdienst-Rotation teil. */
  bedtime: boolean
}

/** Auswahl in der Personenverwaltung – bewusst kurz gehalten. */
export const PERSON_COLORS = [
  '#c2569a',
  '#3f7fb5',
  '#3f9b6d',
  '#d97b3a',
  '#8a6bbf',
  '#c2554b',
] as const

export const DEFAULT_PEOPLE: Person[] = [
  { id: 'mama', name: 'Mama', emoji: '👩', color: '#c2569a', bedtime: true },
  { id: 'papa', name: 'Papa', emoji: '👨', color: '#3f7fb5', bedtime: true },
  { id: 'kind', name: 'Kind', emoji: '🧒', color: '#3f9b6d', bedtime: false },
]

/** Wer den Bettdienst übernimmt, in der Reihenfolge der Personenliste. */
export function bedtimeRotation(people: Person[]): Person[] {
  return people.filter((p) => p.bedtime)
}

export function personById(people: Person[], id: string): Person | undefined {
  return people.find((p) => p.id === id)
}

export interface MealSlot {
  /** Rezept-ID aus der Bibliothek, oder `null` wenn frei/eigener Text. */
  recipeId: string | null
  /** Freitext statt Rezept, z. B. "Reste" oder "Bei Oma". */
  custom?: string
  note?: string
}

export interface CalendarEvent {
  id: string
  day: DayKey
  /** "HH:MM" */
  start: string
  /** "HH:MM", optional */
  end?: string
  title: string
  /** Teilnehmer als Personen-ids – leere Liste heißt "alle". */
  who: string[]
  /** Wo der Termin stattfindet, z. B. "Turnhalle Grundschule". */
  location?: string
  note?: string
  /** Vorlauf der Erinnerung in Minuten; fehlt oder 0 = keine Erinnerung. */
  remindMinutes?: number
  /**
   * Bei Terminen, die aus einer Serie stammen: deren id. Solche Termine
   * stehen nicht in `WeekData.events`, sie werden beim Anzeigen erzeugt.
   */
  seriesId?: string
}

/**
 * Ein Termin, der sich wiederholt – z. B. Turnen jeden Dienstag.
 *
 * Serien liegen bewusst nicht in den Wochendokumenten, sondern in einem
 * eigenen Dokument des Haushalts: eine Änderung an der Serie wirkt damit
 * sofort auf alle Wochen, auch auf die, die noch niemand geöffnet hat.
 */
export interface EventSeries {
  id: string
  day: DayKey
  /** "HH:MM" */
  start: string
  /** "HH:MM", optional */
  end?: string
  title: string
  who: string[]
  location?: string
  note?: string
  remindMinutes?: number
  /** Wiederholung alle n Wochen: 1 = wöchentlich, 2 = 14-tägig … */
  everyWeeks: number
  /** Montag der ersten Woche, ISO "YYYY-MM-DD". */
  from: string
  /** Letzter Tag einschließlich, ISO. Fehlt = läuft weiter. */
  until?: string
  /** Einzeln abgesagte Termine, ISO-Datum des jeweiligen Tages. */
  skipped: string[]
}

/**
 * Ein Zeitraum ohne Uhrzeit: Urlaub, Kita-Schließtage, eine Dienstreise.
 *
 * Zeiträume liegen wie die Serien in einem eigenen Dokument des Haushalts,
 * denn sie laufen über Wochengrenzen hinweg — ein zweiwöchiger Urlaub steht
 * sonst in zwei Wochendokumenten und müsste beim Verschieben in beiden
 * geändert werden.
 */
export interface EventSpan {
  id: string
  title: string
  /** Zeichen für die Anzeige, z. B. 🏖️ oder 🏫. */
  emoji: string
  /** Erster Tag, ISO "YYYY-MM-DD". */
  from: string
  /** Letzter Tag einschließlich, ISO. */
  until: string
  who: string[]
  note?: string
}

/** Schnellauswahl im Zeitraum-Formular. */
export const SPAN_PRESETS: { emoji: string; title: string }[] = [
  { emoji: '🏖️', title: 'Urlaub' },
  { emoji: '🏫', title: 'Kita/Schule zu' },
  { emoji: '✈️', title: 'Dienstreise' },
  { emoji: '🤒', title: 'Krank' },
  { emoji: '🎉', title: 'Besuch' },
]

/** Auswahl für die Wiederholung im Termin-Formular. */
export const REPEAT_CHOICES: { weeks: number; label: string }[] = [
  { weeks: 1, label: 'Jede Woche' },
  { weeks: 2, label: 'Alle 2 Wochen' },
  { weeks: 3, label: 'Alle 3 Wochen' },
  { weeks: 4, label: 'Alle 4 Wochen' },
]

/** Vorlaufzeiten für die Erinnerung, in Minuten. */
export const REMINDER_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'Keine Erinnerung' },
  { minutes: 10, label: '10 Minuten vorher' },
  { minutes: 30, label: '30 Minuten vorher' },
  { minutes: 60, label: '1 Stunde vorher' },
  { minutes: 120, label: '2 Stunden vorher' },
  { minutes: 720, label: '12 Stunden vorher' },
  { minutes: 1440, label: 'Einen Tag vorher' },
]

export interface ShoppingItem {
  id: string
  name: string
  qty: number | null
  unit: string
  cat: Category
  checked: boolean
  /** Manuell ergänzt – wird beim Neu-Berechnen nicht gelöscht. */
  manual?: boolean
  pantry?: boolean
}

/** Alles, was zu einer Kalenderwoche gehört – ein Dokument pro Woche. */
export interface WeekData {
  weekStart: string // ISO "YYYY-MM-DD", immer ein Montag
  meals: Record<DayKey, MealSlot>
  events: CalendarEvent[]
  /** Wer an welchem Tag den Bettdienst hat, als Personen-id. */
  bedtime: Record<DayKey, string>
  shopping: ShoppingItem[]
  /** Zeitpunkt der letzten Änderung (ISO), für Sync-Konflikte. */
  updatedAt: string
}

export interface Settings {
  servings: number
  /** Die Mitglieder des Haushalts, in der Reihenfolge der Anzeige. */
  people: Person[]
  /** Person, mit der die Bettdienst-Rotation beginnt. */
  bedtimeStart: string
  bedtimeFrom: string
  bedtimeTo: string
}

export const DEFAULT_SETTINGS: Settings = {
  servings: 3,
  people: DEFAULT_PEOPLE,
  bedtimeStart: 'mama',
  bedtimeFrom: '19:00',
  bedtimeTo: '20:00',
}

/** "Mama, Kind" bzw. "Alle", wenn niemand ausdrücklich ausgewählt wurde. */
export function attendeeLabel(who: string[], people: Person[]): string {
  const named = people.filter((p) => who.includes(p.id))
  if (named.length === 0 || named.length === people.length) return 'Alle'
  return named.map((p) => p.name).join(', ')
}
