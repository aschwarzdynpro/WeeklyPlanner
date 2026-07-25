import type { StorageAdapter } from './types'

const PREFIX = 'wochenplan:'

/** Speichert im Browser des Geräts – funktioniert offline und ohne Setup. */
export const localAdapter: StorageAdapter = {
  kind: 'local',

  async load<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  },

  async save<T>(key: string, data: T): Promise<void> {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(data))
    } catch (err) {
      console.warn('Konnte nicht lokal speichern:', err)
    }
  },

  subscribe<T>(key: string, onChange: (data: T) => void): () => void {
    // Reagiert auf Änderungen in einem zweiten Tab desselben Browsers.
    const handler = (e: StorageEvent) => {
      if (e.key !== PREFIX + key || !e.newValue) return
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
