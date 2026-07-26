import { useEffect, useRef } from 'react'
import type { CalendarEvent, EventSeries, Settings, WeekData } from '../types'
import { addDays, dateTimeForDay, fromISODate, normalizeWeek, startOfWeek, toISODate } from '../lib/week'
import { eventsForWeek } from '../lib/series'
import { markFired, showReminder, wasFired } from '../lib/notifications'
import type { ReminderPrefs } from '../lib/notifications'
import type { StorageAdapter } from '../storage/types'

/** Wie oft geprüft wird, ob eine Erinnerung fällig ist. */
const TICK_MS = 60 * 1000
/** So lange gilt ein geladenes Wochendokument als frisch genug. */
const WEEK_TTL_MS = 5 * 60 * 1000

function relativeDay(date: Date, now: Date): string {
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      (24 * 3600 * 1000),
  )
  if (days === 0) return 'Heute'
  if (days === 1) return 'Morgen'
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function reminderBody(event: CalendarEvent, startAt: Date, now: Date): string {
  const parts = [`${relativeDay(startAt, now)} um ${event.start} Uhr`]
  if (event.location) parts.push(`📍 ${event.location}`)
  if (event.note) parts.push(event.note)
  return parts.join(' · ')
}

/**
 * Erinnert an anstehende Termine, solange die App auf dem Gerät läuft –
 * der Tab darf dabei im Hintergrund sein.
 *
 * Bewusst unabhängig von der Woche, die gerade auf dem Bildschirm steht:
 * geladen werden immer die laufende und die kommende Woche, damit ein
 * Termin am Montagmorgen auch dann erinnert wird, wenn man am Sonntag
 * durch den Plan geblättert hat.
 *
 * Für Erinnerungen bei geschlossener App gibt es zusätzlich Web-Push
 * (siehe supabase/functions/send-reminders).
 */
export function useReminders(
  adapter: StorageAdapter,
  cache: StorageAdapter,
  series: EventSeries[],
  settings: Settings,
  prefs: ReminderPrefs,
): void {
  const weekCache = useRef(new Map<string, { data: WeekData; at: number }>())
  // Ohne Ref würde jede Planänderung den Timer neu aufsetzen.
  const seriesRef = useRef(series)
  seriesRef.current = series
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    if (!prefs.enabled) return
    let cancelled = false

    const loadWeek = async (weekStart: string): Promise<WeekData> => {
      const hit = weekCache.current.get(weekStart)
      if (hit && Date.now() - hit.at < WEEK_TTL_MS) return hit.data
      let raw: unknown = null
      try {
        raw = await adapter.load<WeekData>(`week:${weekStart}`)
      } catch {
        raw = null
      }
      raw ??= await cache.load<WeekData>(`week:${weekStart}`)
      const data = normalizeWeek(raw, weekStart, settingsRef.current)
      weekCache.current.set(weekStart, { data, at: Date.now() })
      return data
    }

    const tick = async () => {
      const now = new Date()
      const thisWeek = toISODate(startOfWeek(now))
      const weeks = [thisWeek, toISODate(addDays(fromISODate(thisWeek), 7))]

      for (const weekStart of weeks) {
        const data = await loadWeek(weekStart)
        if (cancelled) return

        for (const event of eventsForWeek(data.events, seriesRef.current, weekStart)) {
          if (!event.remindMinutes) continue
          if (
            prefs.onlyFor !== 'alle' &&
            event.who.length > 0 &&
            !event.who.includes(prefs.onlyFor)
          ) {
            continue
          }

          const startAt = dateTimeForDay(weekStart, event.day, event.start)
          const dueAt = startAt.getTime() - event.remindMinutes * 60 * 1000
          // Nur zwischen "fällig" und "hat begonnen" – hinterher ist es keine
          // Erinnerung mehr, sondern nur noch Lärm.
          if (now.getTime() < dueAt || now.getTime() >= startAt.getTime()) continue

          const key = `${weekStart}:${event.id}:${event.remindMinutes}`
          if (wasFired(key)) continue
          markFired(key)
          void showReminder(`⏰ ${event.title}`, reminderBody(event, startAt, now), key)
        }
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), TICK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        weekCache.current.clear()
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [adapter, cache, prefs.enabled, prefs.onlyFor])
}
