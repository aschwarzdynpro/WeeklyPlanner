import { DAYS, DEFAULT_SETTINGS } from '../types'
import type { DayKey, Parent, Settings, WeekData } from '../types'
import { DEFAULT_WEEK_PLAN } from '../data/recipes'

/** ISO-Datum "YYYY-MM-DD" in lokaler Zeit (nicht UTC – sonst rutscht der Tag). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Montag der Woche, in der `d` liegt. */
export function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const weekday = (copy.getDay() + 6) % 7 // Mo = 0 … So = 6
  copy.setDate(copy.getDate() - weekday)
  return copy
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export function dateForDay(weekStart: string, day: DayKey): Date {
  const index = DAYS.findIndex((x) => x.key === day)
  return addDays(fromISODate(weekStart), index)
}

/** Kalenderwoche nach ISO 8601. */
export function isoWeekNumber(d: Date): number {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // Auf den Donnerstag derselben Woche schieben – der bestimmt das KW-Jahr.
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3)
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}

export function formatDayDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export function formatRange(weekStart: string): string {
  const start = fromISODate(weekStart)
  const end = addDays(start, 6)
  const fmt = (x: Date) => x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
  return `${fmt(start)} – ${fmt(end)}`
}

/**
 * Bettdienst wechselt täglich. Damit der Wechsel auch über Wochengrenzen
 * hinweg stimmt, wird ab einem festen Ankermontag durchgezählt.
 */
const ANCHOR_MONDAY = new Date(2024, 0, 1) // Montag, 01.01.2024

export function defaultBedtime(weekStart: string, start: Parent): Record<DayKey, Parent> {
  const daysSinceAnchor = Math.round(
    (fromISODate(weekStart).getTime() - ANCHOR_MONDAY.getTime()) / (24 * 3600 * 1000),
  )
  const offset = ((daysSinceAnchor % 2) + 2) % 2
  const order: Parent[] = start === 'mama' ? ['mama', 'papa'] : ['papa', 'mama']
  const result = {} as Record<DayKey, Parent>
  DAYS.forEach((d, i) => {
    result[d.key] = order[(i + offset) % 2]
  })
  return result
}

export function emptyWeek(weekStart: string, settings: Settings = DEFAULT_SETTINGS): WeekData {
  const meals = {} as WeekData['meals']
  DAYS.forEach((d) => {
    meals[d.key] = { recipeId: DEFAULT_WEEK_PLAN[d.key] ?? null }
  })
  return {
    weekStart,
    meals,
    events: [],
    bedtime: defaultBedtime(weekStart, settings.bedtimeStart),
    shopping: [],
    updatedAt: new Date().toISOString(),
  }
}

/** Fehlende Felder ergänzen – schützt vor alten/kaputten gespeicherten Daten. */
export function normalizeWeek(raw: unknown, weekStart: string, settings: Settings): WeekData {
  const base = emptyWeek(weekStart, settings)
  if (!raw || typeof raw !== 'object') return base
  const data = raw as Partial<WeekData>
  const meals = { ...base.meals }
  DAYS.forEach((d) => {
    const slot = data.meals?.[d.key]
    if (slot && typeof slot === 'object') meals[d.key] = slot
  })
  const bedtime = { ...base.bedtime }
  DAYS.forEach((d) => {
    const p = data.bedtime?.[d.key]
    if (p === 'mama' || p === 'papa') bedtime[d.key] = p
  })
  return {
    weekStart,
    meals,
    bedtime,
    events: Array.isArray(data.events) ? data.events : [],
    shopping: Array.isArray(data.shopping) ? data.shopping : [],
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : base.updatedAt,
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
