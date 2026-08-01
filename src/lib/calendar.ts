import { DAYS } from '../types'
import type { CalendarEvent, DayKey, EventSeries, EventSpan, WeekData } from '../types'
import { addDays, fromISODate, startOfWeek, toISODate } from './week'
import { eventsForWeek } from './series'
import { spanCoversDay } from './spans'

/**
 * Rechnerei für die Kalenderansichten.
 *
 * Die Daten liegen weiterhin wochenweise (ein Dokument je Woche), die
 * Ansichten denken aber in Tagen und Monaten. Hier wird zwischen beidem
 * übersetzt: welche Wochendokumente ein Zeitraum braucht, welche Termine
 * auf einen Tag fallen und wie sich überlappende Termine die Breite teilen.
 */

export type CalendarView = 'tag' | 'arbeitswoche' | 'woche' | 'monat' | 'agenda'

export const VIEWS: { key: CalendarView; label: string; icon: string }[] = [
  { key: 'tag', label: 'Tag', icon: '▯' },
  { key: 'arbeitswoche', label: 'Arbeitswoche', icon: '▤' },
  { key: 'woche', label: 'Woche', icon: '▦' },
  { key: 'monat', label: 'Monat', icon: '▩' },
  { key: 'agenda', label: 'Agenda', icon: '☰' },
]

/** Ein Termin an einem konkreten Tag, samt Wochendokument zum Zurückschreiben. */
export interface Occurrence {
  event: CalendarEvent
  /** Montag des Wochendokuments, in dem der Termin steht. */
  weekStart: string
  /** Tag des Vorkommens, ISO "YYYY-MM-DD". */
  date: string
}

export function dayKeyOf(isoDate: string): DayKey {
  return DAYS[(fromISODate(isoDate).getDay() + 6) % 7].key
}

export function weekStartOf(isoDate: string): string {
  return toISODate(startOfWeek(fromISODate(isoDate)))
}

export function shiftDate(isoDate: string, days: number): string {
  return toISODate(addDays(fromISODate(isoDate), days))
}

/** Alle Montage, deren Wochendokument für den Zeitraum gebraucht wird. */
export function weekStartsBetween(fromISO: string, toISO: string): string[] {
  const result: string[] = []
  let cursor = weekStartOf(fromISO)
  const last = weekStartOf(toISO)
  while (cursor <= last) {
    result.push(cursor)
    cursor = shiftDate(cursor, 7)
  }
  return result
}

/** Die Tage, die eine Ansicht zeigt. */
export function daysForView(view: CalendarView, anchor: string): string[] {
  if (view === 'tag') return [anchor]
  if (view === 'agenda') return Array.from({ length: 28 }, (_, i) => shiftDate(anchor, i))
  if (view === 'monat') return monthGridDays(anchor)
  const monday = weekStartOf(anchor)
  const length = view === 'arbeitswoche' ? 5 : 7
  return Array.from({ length }, (_, i) => shiftDate(monday, i))
}

/**
 * Das Monatsraster: immer ganze Wochen ab Montag, damit die Spalten
 * stehen bleiben. Sechs Zeilen, sonst springt die Höhe von Monat zu Monat.
 */
export function monthGridDays(anchor: string): string[] {
  const first = fromISODate(anchor)
  const firstOfMonth = new Date(first.getFullYear(), first.getMonth(), 1)
  const start = toISODate(startOfWeek(firstOfMonth))
  return Array.from({ length: 42 }, (_, i) => shiftDate(start, i))
}

/** Wie viele Wochen die Ansicht überspannt – für das Nachladen der Dokumente. */
export function rangeForView(view: CalendarView, anchor: string): [string, string] {
  const days = daysForView(view, anchor)
  return [days[0], days[days.length - 1]]
}

/** Um wie viel „vor“ und „zurück“ springen. */
export function stepForView(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === 'tag') return shiftDate(anchor, direction)
  if (view === 'agenda') return shiftDate(anchor, direction * 7)
  if (view === 'monat') {
    const date = fromISODate(anchor)
    // Auf den Ersten setzen, sonst rutscht der 31. beim Monatswechsel weiter.
    return toISODate(new Date(date.getFullYear(), date.getMonth() + direction, 1))
  }
  return shiftDate(anchor, direction * 7)
}

// --- Termine eines Tages -----------------------------------------------------

/**
 * Termine eines Tages: aus dem Wochendokument, ergänzt um die Serien.
 * `weeks` enthält die geladenen Wochen; fehlt eine, bleibt der Tag leer.
 */
export function occurrencesOn(
  isoDate: string,
  weeks: Record<string, WeekData | undefined>,
  series: EventSeries[],
): Occurrence[] {
  const weekStart = weekStartOf(isoDate)
  const week = weeks[weekStart]
  if (!week) return []
  const day = dayKeyOf(isoDate)
  return eventsForWeek(week.events, series, weekStart)
    .filter((event) => event.day === day)
    .map((event) => ({ event, weekStart, date: isoDate }))
}

export function spansOn(spans: EventSpan[], isoDate: string): EventSpan[] {
  return spans.filter((span) => spanCoversDay(span, isoDate))
}

/** Termine, die diese Person betreffen. Leere Auswahl heißt „alle“. */
export function matchesPeople(who: string[], visible: Set<string>): boolean {
  return who.length === 0 || who.some((id) => visible.has(id))
}

// --- Zeitraster --------------------------------------------------------------

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

export function formatMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Ohne Ende dauert ein Termin für die Darstellung eine Stunde. */
const DEFAULT_DURATION = 60
/** Kürzer sieht man den Balken nicht mehr. */
const MIN_DURATION = 30

export function eventSpanMinutes(event: CalendarEvent): { start: number; end: number } {
  const start = minutesOf(event.start)
  const end = event.end ? minutesOf(event.end) : start + DEFAULT_DURATION
  return { start, end: Math.max(end, start + MIN_DURATION) }
}

export interface PositionedEvent<T> {
  item: T
  start: number
  end: number
  /** Spalte innerhalb der Gruppe sich überschneidender Termine. */
  column: number
  /** Wie viele Spalten die Gruppe insgesamt braucht. */
  columns: number
}

/**
 * Verteilt sich überschneidende Termine nebeneinander, wie es Kalender
 * üblicherweise tun: Was sich zeitlich berührt, bildet eine Gruppe, und
 * innerhalb der Gruppe bekommt jeder Termin die erste freie Spalte.
 */
export function layoutDay<T>(
  items: T[],
  extent: (item: T) => { start: number; end: number },
): PositionedEvent<T>[] {
  const sorted = items
    .map((item) => ({ item, ...extent(item) }))
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const result: PositionedEvent<T>[] = []
  let group: PositionedEvent<T>[] = []
  let groupEnd = -1

  const closeGroup = () => {
    const columns = group.reduce((max, e) => Math.max(max, e.column + 1), 0)
    for (const entry of group) entry.columns = columns
    result.push(...group)
    group = []
    groupEnd = -1
  }

  for (const entry of sorted) {
    if (group.length > 0 && entry.start >= groupEnd) closeGroup()

    // Erste Spalte, in der zu dieser Zeit nichts steht.
    const taken = new Set(group.filter((e) => e.end > entry.start).map((e) => e.column))
    let column = 0
    while (taken.has(column)) column += 1

    group.push({ ...entry, column, columns: 1 })
    groupEnd = Math.max(groupEnd, entry.end)
  }
  if (group.length > 0) closeGroup()

  return result
}

// --- Beschriftungen ----------------------------------------------------------

export function formatDayLabel(isoDate: string): string {
  return fromISODate(isoDate).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })
}

export function formatMonthYear(isoDate: string): string {
  return fromISODate(isoDate).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

export function isSameMonth(isoDate: string, anchor: string): boolean {
  return isoDate.slice(0, 7) === anchor.slice(0, 7)
}
