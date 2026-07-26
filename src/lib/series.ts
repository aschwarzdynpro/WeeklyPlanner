import type { CalendarEvent, EventSeries } from '../types'
import { dateForDay, fromISODate, startOfWeek, toISODate } from './week'

const DAY_MS = 24 * 3600 * 1000

/** Trennt Serien-id und Datum in der id eines ausgeklappten Termins. */
const OCCURRENCE_SEP = '@'

export function occurrenceId(seriesId: string, isoDate: string): string {
  return `${seriesId}${OCCURRENCE_SEP}${isoDate}`
}

/** Der Tag, an dem ein ausgeklappter Serientermin stattfindet. */
export function occurrenceDate(id: string): string {
  return id.slice(id.lastIndexOf(OCCURRENCE_SEP) + 1)
}

/**
 * Fällt eine Serie in die Woche ab `weekStart`?
 *
 * Gezählt wird in ganzen Wochen ab dem Start der Serie – so bleibt der
 * 14-tägige Rhythmus auch über Monats- und Jahresgrenzen hinweg stabil.
 */
export function seriesOccursInWeek(series: EventSeries, weekStart: string): boolean {
  const first = startOfWeek(fromISODate(series.from))
  const diffDays = Math.round((fromISODate(weekStart).getTime() - first.getTime()) / DAY_MS)
  if (diffDays < 0) return false
  return Math.round(diffDays / 7) % Math.max(1, series.everyWeeks) === 0
}

/** Der konkrete Termin, den eine Serie in dieser Woche erzeugt – falls überhaupt. */
export function occurrenceFor(series: EventSeries, weekStart: string): CalendarEvent | null {
  if (!seriesOccursInWeek(series, weekStart)) return null

  const date = toISODate(dateForDay(weekStart, series.day))
  // Vor dem Start bzw. nach dem Ende der Serie – der Tag kann in der ersten
  // und letzten Woche noch bzw. schon außerhalb liegen.
  if (date < series.from) return null
  if (series.until && date > series.until) return null
  if (series.skipped.includes(date)) return null

  return {
    id: occurrenceId(series.id, date),
    day: series.day,
    start: series.start,
    end: series.end,
    title: series.title,
    who: series.who,
    location: series.location,
    note: series.note,
    remindMinutes: series.remindMinutes,
    seriesId: series.id,
  }
}

/** Alle Serientermine einer Woche. */
export function expandSeries(series: EventSeries[], weekStart: string): CalendarEvent[] {
  return series.flatMap((s) => occurrenceFor(s, weekStart) ?? [])
}

/** Einzeltermine und Serientermine der Woche, nach Uhrzeit sortiert. */
export function eventsForWeek(
  events: CalendarEvent[],
  series: EventSeries[],
  weekStart: string,
): CalendarEvent[] {
  return [...events, ...expandSeries(series, weekStart)].sort(
    (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  )
}
