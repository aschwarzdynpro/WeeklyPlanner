import { useCallback, useEffect, useState } from 'react'
import type { StorageAdapter } from '../storage/types'

/**
 * Ein Dokument, das dem ganzen Haushalt gehört und nicht zu einer einzelnen
 * Woche — Serientermine und Zeiträume. Beide laufen über Wochengrenzen
 * hinweg, deshalb liegen sie neben den Wochen und nicht in ihnen.
 *
 * Anders als die Wochendaten wird hier nicht entprellt: solche Einträge
 * ändern sich selten, wirken dafür aber auf jede Woche.
 *
 * `normalize` muss stabil sein (also außerhalb der Komponente stehen),
 * sonst lädt der Hook bei jedem Rendern neu.
 */
export function useHouseholdDoc<T>(
  adapter: StorageAdapter,
  cache: StorageAdapter,
  key: string,
  normalize: (raw: unknown) => T,
  onError?: (err: unknown) => void,
): [T, (mutate: (current: T) => T) => void] {
  const [value, setValue] = useState<T>(() => normalize(null))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let stored: unknown = null
      try {
        stored = await adapter.load<T>(key)
      } catch (err) {
        console.warn(`"${key}" konnte nicht geladen werden:`, err)
      }
      stored ??= await cache.load<T>(key)
      if (!cancelled) setValue(normalize(stored))
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, cache, key, normalize])

  // Änderungen vom anderen Gerät übernehmen.
  useEffect(() => {
    if (!adapter.subscribe) return
    return adapter.subscribe<T>(key, (incoming) => setValue(normalize(incoming)))
  }, [adapter, key, normalize])

  const update = useCallback(
    (mutate: (current: T) => T) => {
      setValue((current) => {
        const next = mutate(current)
        void cache.save(key, next)
        void adapter.save(key, next).catch((err) => {
          console.warn(`"${key}" konnte nicht gespeichert werden:`, err)
          onError?.(err)
        })
        return next
      })
    },
    [adapter, cache, key, onError],
  )

  return [value, update]
}
