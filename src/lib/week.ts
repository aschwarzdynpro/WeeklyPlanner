import { DAYS, DEFAULT_PEOPLE, DEFAULT_SETTINGS, PERSON_COLORS, bedtimeRotation } from '../types'
import type {
  CalendarEvent,
  DayKey,
  EventSeries,
  EventSpan,
  Person,
  Settings,
  WeekData,
} from '../types'
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

/** Ganzer Zeitpunkt eines Termins: Wochentag plus "HH:MM". */
export function dateTimeForDay(weekStart: string, day: DayKey, time: string): Date {
  const date = dateForDay(weekStart, day)
  const [h, m] = time.split(':').map(Number)
  date.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0)
  return date
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

/**
 * Verteilt den Bettdienst auf die Woche: reihum, einen Tag je Person, und
 * über Wochengrenzen hinweg weiterlaufend. Bei zwei Personen kommen beide
 * über zwei Wochen auf gleich viele Abende, bei dreien über drei Wochen.
 *
 * Nimmt niemand teil, bleibt der Dienst leer – dann zeigt die Woche gar
 * keinen Balken an.
 */
export function defaultBedtime(
  weekStart: string,
  start: string,
  people: Person[] = DEFAULT_PEOPLE,
): Record<DayKey, string> {
  const result = {} as Record<DayKey, string>
  const rotation = bedtimeRotation(people).map((p) => p.id)
  if (rotation.length === 0) {
    DAYS.forEach((d) => {
      result[d.key] = ''
    })
    return result
  }

  const daysSinceAnchor = Math.round(
    (fromISODate(weekStart).getTime() - ANCHOR_MONDAY.getTime()) / (24 * 3600 * 1000),
  )
  const size = rotation.length
  const offset = ((daysSinceAnchor % size) + size) % size
  // Wer gestrichen wurde, kann die Rotation nicht mehr anführen.
  const first = Math.max(0, rotation.indexOf(start))
  DAYS.forEach((d, i) => {
    result[d.key] = rotation[(first + offset + i) % size]
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
    bedtime: defaultBedtime(weekStart, settings.bedtimeStart, settings.people),
    shopping: [],
    updatedAt: new Date().toISOString(),
  }
}

const isDayKey = (value: unknown): value is DayKey => DAYS.some((d) => d.key === value)

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)

const text = (value: unknown): string | undefined => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : undefined
}

const isISODate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/**
 * Teilnehmer einlesen. In der ersten Fassung stand hier ein einzelner Wert,
 * wobei "alle" für den ganzen Haushalt stand – das ist heute die leere Liste.
 *
 * Unbekannte Personen-ids bleiben absichtlich stehen: Wer eine Person aus
 * Versehen löscht und neu anlegt, findet seine Termine wieder.
 */
function normalizeAttendees(raw: unknown): string[] {
  const ids = Array.isArray(raw) ? raw : typeof raw === 'string' && raw !== 'alle' ? [raw] : []
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

/** Personenliste aus dem Speicher – defensiv, sie kommt aus der Datenbank. */
export function normalizePeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return DEFAULT_PEOPLE
  const people = raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const data = entry as Record<string, unknown>
    const id = text(data.id)
    if (!id) return []
    return [
      {
        id,
        name: text(data.name) ?? id,
        emoji: text(data.emoji) ?? '🙂',
        color: text(data.color) ?? PERSON_COLORS[index % PERSON_COLORS.length],
        bedtime: data.bedtime === true,
      },
    ]
  })
  // Doppelte ids würden Termine mehrfach zuordnen; die erste gewinnt.
  const seen = new Set<string>()
  const unique = people.filter((p) => !seen.has(p.id) && seen.add(p.id))
  return unique.length > 0 ? unique : DEFAULT_PEOPLE
}

/** Einstellungen samt Personen einlesen und fehlende Felder ergänzen. */
export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS
  const data = raw as Partial<Settings>
  const people = normalizePeople(data.people)
  const servings = Number(data.servings)
  return {
    servings: Number.isFinite(servings) && servings > 0 ? Math.round(servings) : DEFAULT_SETTINGS.servings,
    people,
    bedtimeStart:
      typeof data.bedtimeStart === 'string' && people.some((p) => p.id === data.bedtimeStart)
        ? data.bedtimeStart
        : (bedtimeRotation(people)[0]?.id ?? people[0].id),
    bedtimeFrom: isTime(data.bedtimeFrom) ? data.bedtimeFrom : DEFAULT_SETTINGS.bedtimeFrom,
    bedtimeTo: isTime(data.bedtimeTo) ? data.bedtimeTo : DEFAULT_SETTINGS.bedtimeTo,
  }
}

function normalizeMinutes(raw: unknown): number | undefined {
  return typeof raw === 'number' && raw > 0 ? Math.round(raw) : undefined
}

/** Gemeinsame Felder von Einzeltermin und Serie. */
function normalizeCommon(data: Record<string, unknown>) {
  return {
    day: isDayKey(data.day) ? data.day : ('mo' as DayKey),
    start: isTime(data.start) ? data.start : '12:00',
    end: isTime(data.end) ? data.end : undefined,
    title: text(data.title) ?? 'Termin',
    who: normalizeAttendees(data.who),
    location: text(data.location),
    note: text(data.note),
    remindMinutes: normalizeMinutes(data.remindMinutes),
  }
}

export function normalizeEvents(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const data = entry as Record<string, unknown>
    const id = text(data.id)
    if (!id) return []
    return [{ id, ...normalizeCommon(data) }]
  })
}

export function normalizeSeries(raw: unknown): EventSeries[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const data = entry as Record<string, unknown>
    const id = text(data.id)
    if (!id || !isISODate(data.from)) return []
    const everyWeeks = typeof data.everyWeeks === 'number' ? Math.round(data.everyWeeks) : 1
    return [
      {
        id,
        ...normalizeCommon(data),
        everyWeeks: everyWeeks >= 1 ? everyWeeks : 1,
        from: data.from,
        until: isISODate(data.until) ? data.until : undefined,
        skipped: Array.isArray(data.skipped) ? data.skipped.filter(isISODate) : [],
      },
    ]
  })
}

export function normalizeSpans(raw: unknown): EventSpan[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const data = entry as Record<string, unknown>
    const id = text(data.id)
    if (!id || !isISODate(data.from) || !isISODate(data.until)) return []
    return [
      {
        id,
        title: text(data.title) ?? 'Zeitraum',
        emoji: text(data.emoji) ?? '🏖️',
        // Verdrehte Angaben geraderücken, statt den Eintrag zu verlieren.
        from: data.from <= data.until ? data.from : data.until,
        until: data.from <= data.until ? data.until : data.from,
        who: normalizeAttendees(data.who),
        note: text(data.note),
      },
    ]
  })
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
  // Gespeicherte Bettdienste nur übernehmen, solange es die Person noch gibt –
  // sonst stünde nach dem Löschen ein leeres Feld in der Woche.
  const bedtime = { ...base.bedtime }
  DAYS.forEach((d) => {
    const p = data.bedtime?.[d.key]
    if (typeof p === 'string' && settings.people.some((person) => person.id === p)) {
      bedtime[d.key] = p
    }
  })
  return {
    weekStart,
    meals,
    bedtime,
    events: normalizeEvents(data.events),
    shopping: Array.isArray(data.shopping) ? data.shopping : [],
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : base.updatedAt,
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
