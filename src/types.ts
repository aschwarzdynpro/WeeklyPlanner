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

export type Parent = 'mama' | 'papa'

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
  who: 'mama' | 'papa' | 'kind' | 'alle'
  note?: string
}

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
  bedtime: Record<DayKey, Parent>
  shopping: ShoppingItem[]
  /** Zeitpunkt der letzten Änderung (ISO), für Sync-Konflikte. */
  updatedAt: string
}

export interface Settings {
  servings: number
  /** Startet die Bettdienst-Rotation mit Mama oder Papa. */
  bedtimeStart: Parent
  bedtimeFrom: string
  bedtimeTo: string
}

export const DEFAULT_SETTINGS: Settings = {
  servings: 3,
  bedtimeStart: 'mama',
  bedtimeFrom: '19:00',
  bedtimeTo: '20:00',
}

export const PARENT_LABEL: Record<Parent, string> = { mama: 'Mama', papa: 'Papa' }
export const PARENT_EMOJI: Record<Parent, string> = { mama: '👩', papa: '👨' }
export const WHO_LABEL: Record<CalendarEvent['who'], string> = {
  mama: 'Mama',
  papa: 'Papa',
  kind: 'Kind',
  alle: 'Alle',
}
