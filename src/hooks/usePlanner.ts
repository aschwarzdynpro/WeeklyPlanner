import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '../types'
import type { Settings, WeekData } from '../types'
import {
  normalizeSeries,
  normalizeSettings,
  normalizeSpans,
  normalizeWeek,
  toISODate,
} from '../lib/week'
import { shiftDate, weekStartOf } from '../lib/calendar'
import { useHouseholdDoc } from './useHouseholdDoc'
import type { StorageAdapter } from '../storage/types'

export type SyncState = 'lädt' | 'gespeichert' | 'offline'

const SETTINGS_KEY = 'settings'
const WEEK_PREFIX = 'week:'
const weekKey = (weekStart: string) => `${WEEK_PREFIX}${weekStart}`

/**
 * Lädt und speichert die Plandaten.
 *
 * `adapter` ist der führende Speicher (Supabase), `cache` die lokale Kopie
 * für den Offline-Fall. Geschrieben wird immer in beide.
 *
 * Gehalten wird nicht eine einzelne Woche, sondern so viele, wie die
 * gerade sichtbare Ansicht braucht: Die Monatsansicht zeigt sechs, die
 * Agenda vier. Die Wochendokumente bleiben dabei die Einheit, in der
 * gespeichert wird — nur eben mehrere gleichzeitig.
 */
export function usePlanner(adapter: StorageAdapter, cache: StorageAdapter) {
  /** Ausgewählter Tag; alle Ansichten hängen daran. */
  const [anchor, setAnchor] = useState(() => toISODate(new Date()))
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [weeks, setWeeks] = useState<Record<string, WeekData>>({})
  const [sync, setSync] = useState<SyncState>('lädt')

  const offline = useCallback(() => setSync('offline'), [])
  // Serientermine und Zeiträume gelten über alle Wochen hinweg und liegen
  // deshalb je in einem eigenen Dokument des Haushalts.
  const [series, updateSeries] = useHouseholdDoc(adapter, cache, 'series', normalizeSeries, offline)
  const [spans, updateSpans] = useHouseholdDoc(adapter, cache, 'spans', normalizeSpans, offline)

  // Wochen mit noch nicht gespeicherten Änderungen – die dürfen weder von
  // einem anderen Gerät noch vom erneuten Laden überschrieben werden.
  const dirty = useRef(new Set<string>())
  const weeksRef = useRef(weeks)
  weeksRef.current = weeks
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  /** Bereits angefragte Wochen, damit nichts doppelt geladen wird. */
  const requested = useRef(new Set<string>())

  const weekStart = weekStartOf(anchor)

  // --- Einstellungen laden ---------------------------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let stored: unknown = null
      try {
        stored = await adapter.load<Settings>(SETTINGS_KEY)
      } catch (err) {
        console.warn('Einstellungen konnten nicht geladen werden:', err)
      }
      stored ??= await cache.load<Settings>(SETTINGS_KEY)
      if (!cancelled && stored) setSettings(normalizeSettings(stored))
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, cache])

  // --- Wochen laden ----------------------------------------------------------

  const loadWeek = useCallback(
    async (start: string): Promise<WeekData> => {
      let raw: unknown = null
      let failed = false
      try {
        raw = await adapter.load<WeekData>(weekKey(start))
      } catch (err) {
        console.warn('Woche konnte nicht geladen werden:', err)
        failed = true
      }
      raw ??= await cache.load<WeekData>(weekKey(start))
      const data = normalizeWeek(raw, start, settingsRef.current)
      // Zwischenzeitliche eigene Änderungen haben Vorrang vor dem Server.
      setWeeks((current) => (dirty.current.has(start) ? current : { ...current, [start]: data }))
      setSync(failed ? 'offline' : 'gespeichert')
      return data
    },
    [adapter, cache],
  )

  /**
   * Sagt dem Speicher, welche Wochen die Ansicht braucht. Fehlende werden
   * nachgeladen, bereits geladene bleiben liegen — sie sind klein, und der
   * Nutzer blättert oft zwischen denselben hin und her.
   */
  const requestWeeks = useCallback(
    (starts: string[]) => {
      for (const start of starts) {
        if (requested.current.has(start)) continue
        requested.current.add(start)
        void loadWeek(start)
      }
    },
    [loadWeek],
  )

  // Der Speicher gehört zum Haushalt: bei einem Wechsel alles vergessen.
  useEffect(() => {
    requested.current = new Set()
    dirty.current = new Set()
    setWeeks({})
    setSync('lädt')
  }, [adapter, cache])

  // Die Woche des ausgewählten Tages wird immer gebraucht.
  useEffect(() => {
    requestWeeks([weekStart])
  }, [requestWeeks, weekStart])

  // --- Speichern (entprellt) -------------------------------------------------
  useEffect(() => {
    if (dirty.current.size === 0) return
    const handle = setTimeout(() => {
      void (async () => {
        for (const start of [...dirty.current]) {
          const data = weeksRef.current[start]
          if (!data) continue
          const payload = { ...data, updatedAt: new Date().toISOString() }
          void cache.save(weekKey(start), payload)
          try {
            await adapter.save(weekKey(start), payload)
            dirty.current.delete(start)
            if (dirty.current.size === 0) setSync('gespeichert')
          } catch (err) {
            console.warn('Speichern fehlgeschlagen:', err)
            setSync('offline')
          }
        }
      })()
    }, 400)
    return () => clearTimeout(handle)
  }, [adapter, cache, weeks])

  // --- Änderungen von anderen Geräten ----------------------------------------
  useEffect(() => {
    if (!adapter.subscribeAll) return
    return adapter.subscribeAll((key, data) => {
      if (!key.startsWith(WEEK_PREFIX)) return
      const start = key.slice(WEEK_PREFIX.length)
      // Nur was ohnehin offen ist, und nichts, was hier gerade geändert wird.
      if (!requested.current.has(start) || dirty.current.has(start)) return
      setWeeks((current) => ({
        ...current,
        [start]: normalizeWeek(data, start, settingsRef.current),
      }))
    })
  }, [adapter])

  // --- Ändern ----------------------------------------------------------------

  /**
   * Ändert eine beliebige Woche – auch eine, die gerade nicht auf dem
   * Bildschirm steht. Beim Verschieben eines Termins über den Monatsrand
   * hinaus muss das Zieldokument erst geladen werden, sonst würde eine
   * leere Woche über die gespeicherte geschrieben.
   */
  const editWeek = useCallback(
    async (start: string, mutate: (draft: WeekData) => WeekData) => {
      let base = weeksRef.current[start]
      if (!base) {
        requested.current.add(start)
        base = await loadWeek(start)
      }
      setWeeks((current) => {
        dirty.current.add(start)
        return { ...current, [start]: mutate(current[start] ?? base) }
      })
    },
    [loadWeek],
  )

  const updateWeek = useCallback(
    (mutate: (draft: WeekData) => WeekData) => void editWeek(weekStart, mutate),
    [editWeek, weekStart],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch }
        void cache.save(SETTINGS_KEY, next)
        void adapter.save(SETTINGS_KEY, next).catch((err) => {
          console.warn('Einstellungen konnten nicht gespeichert werden:', err)
        })
        return next
      })
    },
    [adapter, cache],
  )

  // --- Navigation ------------------------------------------------------------

  const goToWeek = useCallback((offset: number) => {
    setAnchor((current) => shiftDate(current, offset * 7))
  }, [])

  const goToToday = useCallback(() => setAnchor(toISODate(new Date())), [])

  const week = weeks[weekStart] ?? null

  return useMemo(
    () => ({
      anchor,
      setAnchor,
      weekStart,
      week,
      weeks,
      requestWeeks,
      series,
      spans,
      settings,
      sync,
      updateWeek,
      editWeek,
      updateSeries,
      updateSpans,
      updateSettings,
      goToWeek,
      goToToday,
    }),
    [
      anchor,
      weekStart,
      week,
      weeks,
      requestWeeks,
      series,
      spans,
      settings,
      sync,
      updateWeek,
      editWeek,
      updateSeries,
      updateSpans,
      updateSettings,
      goToWeek,
      goToToday,
    ],
  )
}
