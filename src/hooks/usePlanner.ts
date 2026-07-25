import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '../types'
import type { Settings, WeekData } from '../types'
import { addDays, fromISODate, normalizeWeek, startOfWeek, toISODate } from '../lib/week'
import { localAdapter } from '../storage/local'
import type { StorageAdapter } from '../storage/types'

export type SyncState = 'lokal' | 'lädt' | 'gespeichert' | 'fehler'

const SETTINGS_KEY = 'settings'
const weekKey = (weekStart: string) => `week:${weekStart}`

export function usePlanner(adapter: StorageAdapter) {
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
      try {
        const stored = await adapter.load<Settings>(SETTINGS_KEY)
        if (!cancelled && stored) setSettings({ ...DEFAULT_SETTINGS, ...stored })
      } catch (err) {
        console.warn('Einstellungen konnten nicht geladen werden:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter])

  // --- Woche laden -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setSync('lädt')
    dirty.current = false
    ;(async () => {
      try {
        let raw = await adapter.load<WeekData>(weekKey(weekStart))
        if (raw === null && adapter.kind !== 'local') {
          // Offline-Kopie als Rückfallebene
          raw = await localAdapter.load<WeekData>(weekKey(weekStart))
        }
        if (cancelled) return
        setWeek(normalizeWeek(raw, weekStart, settingsRef.current))
        setSync(adapter.kind === 'local' ? 'lokal' : 'gespeichert')
      } catch (err) {
        console.warn('Woche konnte nicht geladen werden:', err)
        if (cancelled) return
        const fallback = await localAdapter.load<WeekData>(weekKey(weekStart))
        setWeek(normalizeWeek(fallback, weekStart, settingsRef.current))
        setSync('fehler')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, weekStart])

  // --- Woche speichern (entprellt) -------------------------------------------
  useEffect(() => {
    if (!week || !dirty.current) return
    const handle = setTimeout(async () => {
      const payload = { ...week, updatedAt: new Date().toISOString() }
      try {
        await adapter.save(weekKey(week.weekStart), payload)
        // Immer zusätzlich lokal spiegeln – dann ist die Woche auch offline da.
        if (adapter.kind !== 'local') await localAdapter.save(weekKey(week.weekStart), payload)
        dirty.current = false
        setSync(adapter.kind === 'local' ? 'lokal' : 'gespeichert')
      } catch (err) {
        console.warn('Speichern fehlgeschlagen:', err)
        await localAdapter.save(weekKey(week.weekStart), payload)
        setSync('fehler')
      }
    }, 400)
    return () => clearTimeout(handle)
  }, [adapter, week])

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
        void adapter.save(SETTINGS_KEY, next)
        if (adapter.kind !== 'local') void localAdapter.save(SETTINGS_KEY, next)
        return next
      })
    },
    [adapter],
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
