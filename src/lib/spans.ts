import { DAYS } from '../types'
import type { EventSpan } from '../types'
import { addDays, dateForDay, fromISODate, toISODate } from './week'

/**
 * Zeiträume laufen über Wochengrenzen hinweg. Verglichen wird deshalb über
 * die ISO-Schreibweise der Daten – die sortiert sich als Text genauso wie
 * als Datum, ganz ohne Zeitzonen-Rechnerei.
 */
export function spanCoversDay(span: EventSpan, isoDate: string): boolean {
  return isoDate >= span.from && isoDate <= span.until
}

/** Alle Zeiträume, die diese Woche berühren – nach Beginn sortiert. */
export function spansForWeek(spans: EventSpan[], weekStart: string): EventSpan[] {
  const weekEnd = toISODate(addDays(fromISODate(weekStart), 6))
  return spans
    .filter((span) => span.from <= weekEnd && span.until >= weekStart)
    .sort((a, b) => a.from.localeCompare(b.from) || a.title.localeCompare(b.title))
}

export function spansForDay(spans: EventSpan[], weekStart: string, day: (typeof DAYS)[number]['key']) {
  const date = toISODate(dateForDay(weekStart, day))
  return spans.filter((span) => spanCoversDay(span, date))
}

/** "27.07. – 09.08." bzw. nur ein Datum, wenn der Zeitraum einen Tag lang ist. */
export function formatSpanRange(span: EventSpan): string {
  const fmt = (iso: string) =>
    fromISODate(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  return span.from === span.until ? fmt(span.from) : `${fmt(span.from)} – ${fmt(span.until)}`
}
