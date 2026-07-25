import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '../types'
import type { Settings, WeekData } from '../types'
import { addDays, fromISODate, normalizeWeek, startOfWeek, toISODate } from '../lib/week'
import type { StorageAdapter } from '../storage/types'

export type SyncState = 'lädt' | 'gespeichert' | 'offline'

const SETTINGS_KEY = 'settings'
const weekKey = (weekStart: string) => `week:${weekStart}`

/**
 * Lädt und speichert die Wochendaten.
 *
 * `adapter` ist der führende Speicher (Supabase), `cache` die lokale Kopie
 * für den Offline-Fall. Geschrieben wird immer in beide.
 */
export function usePlanner(adapter: StorageAdapter, cache: StorageAdapter) {
  const [weekStart, setWeekStart] = useState(() => toISODate(startOfWeek(new Date())))
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [week, setWeek] = useState<WeekData | null>(null)
  const [sync, setSync] = useState<SyncState>('lädt')

  // Verhindert, dass frisch geladene Daten sofort wieder zurückgeschrieben werden.
  const dirty = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // --- Einstellungen laden ---------------------------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let stored: Settings | null = null
      try {
        stored = await adapter.load<Settings>(SETTINGS_KEY)
      } catch (err) {
        console.warn('Einstellungen konnten nicht geladen werden:', err)
      }
      stored ??= await cache.load<Settings>(SETTINGS_KEY)
      if (!cancelled && stored) setSettings({ ...DEFAULT_SETTINGS, ...stored })
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, cache])

  // --- Woche laden -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setSync('lädt')
    dirty.current = false
    ;(async () => {
      try {
        const raw =
          (await adapter.load<WeekData>(weekKey(weekStart))) ??
          (await cache.load<WeekData>(weekKey(weekStart)))
        if (cancelled) return
        setWeek(normalizeWeek(raw, weekStart, settingsRef.current))
        setSync('gespeichert')
      } catch (err) {
        console.warn('Woche konnte nicht geladen werden:', err)
        const fallback = await cache.load<WeekData>(weekKey(weekStart))
        if (cancelled) return
        setWeek(normalizeWeek(fallback, weekStart, settingsRef.current))
        setSync('offline')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, cache, weekStart])

  // --- Woche speichern (entprellt) -------------------------------------------
  useEffect(() => {
    if (!week || !dirty.current) return
    const handle = setTimeout(async () => {
      const payload = { ...week, updatedAt: new Date().toISOString() }
      void cache.save(weekKey(week.weekStart), payload)
      try {
        await adapter.save(weekKey(week.weekStart), payload)
        dirty.current = false
        setSync('gespeichert')
      } catch (err) {
        console.warn('Speichern fehlgeschlagen:', err)
        setSync('offline')
      }
    }, 400)
    return () => clearTimeout(handle)
  }, [adapter, cache, week])

  // --- Änderungen von anderen Geräten ----------------------------------------
  useEffect(() => {
    if (!adapter.subscribe) return
    return adapter.subscribe<WeekData>(weekKey(weekStart), (incoming) => {
      // Eigene, noch nicht gespeicherte Änderungen nicht überschreiben.
      if (dirty.current) return
      setWeek(normalizeWeek(incoming, weekStart, settingsRef.current))
    })
  }, [adapter, weekStart])

  const updateWeek = useCallback((mutate: (draft: WeekData) => WeekData) => {
    setWeek((current) => {
      if (!current) return current
      dirty.current = true
      return mutate(current)
    })
  }, [])

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

  const goToWeek = useCallback((offset: number) => {
    setWeekStart((current) => toISODate(addDays(fromISODate(current), offset * 7)))
  }, [])

  const goToToday = useCallback(() => {
    setWeekStart(toISODate(startOfWeek(new Date())))
  }, [])

  return useMemo(
    () => ({ weekStart, week, settings, sync, updateWeek, updateSettings, goToWeek, goToToday }),
    [weekStart, week, settings, sync, updateWeek, updateSettings, goToWeek, goToToday],
  )
}
