import type { StorageAdapter } from './types'

const PREFIX = 'wochenplan:'

/**
 * Offline-Kopie im Browser. Sie ist kein eigenständiger Speicher, sondern
 * ein Cache: Ohne Netz bleibt die App bedienbar, gespeichert wird trotzdem
 * in Supabase. Der Haushalt steckt im Schlüssel, damit auf einem geteilten
 * Tablet keine Daten aus einem anderen Konto durchscheinen.
 */
export function createLocalCache(namespace: string): StorageAdapter {
  const prefixed = (key: string) => `${PREFIX}${namespace}:${key}`

  return {
    kind: 'local',

    async load<T>(key: string): Promise<T | null> {
      try {
        const raw = localStorage.getItem(prefixed(key))
        return raw ? (JSON.parse(raw) as T) : null
      } catch {
        return null
      }
    },

    async save<T>(key: string, data: T): Promise<void> {
      try {
        localStorage.setItem(prefixed(key), JSON.stringify(data))
      } catch (err) {
        console.warn('Konnte nicht lokal zwischenspeichern:', err)
      }
    },

    subscribe<T>(key: string, onChange: (data: T) => void): () => void {
      // Reagiert auf Änderungen in einem zweiten Tab desselben Browsers.
      const handler = (e: StorageEvent) => {
        if (e.key !== prefixed(key) || !e.newValue) return
        try {
          onChange(JSON.parse(e.newValue) as T)
        } catch {
          /* ignorieren */
        }
      }
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },
  }
}

/** Beim Abmelden alle zwischengespeicherten Plandaten vom Gerät entfernen. */
export function clearLocalCache(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch (err) {
    console.warn('Konnte den lokalen Zwischenspeicher nicht leeren:', err)
  }
}
