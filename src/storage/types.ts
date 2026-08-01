/**
 * Alle Daten werden als benannte Dokumente gespeichert:
 *   "week:2026-07-27"  → WeekData
 *   "settings"         → Settings
 *
 * Das hält beide Backends (localStorage und Supabase) simpel und
 * macht spätere Erweiterungen ohne Migration möglich.
 */
export interface StorageAdapter {
  readonly kind: 'local' | 'supabase'
  load<T>(key: string): Promise<T | null>
  save<T>(key: string, data: T): Promise<void>
  /** Optional: Änderungen von anderen Geräten live empfangen. */
  subscribe?<T>(key: string, onChange: (data: T) => void): () => void
  /**
   * Wie `subscribe`, aber für alle Dokumente auf einmal. Der Kalender hält
   * mehrere Wochen gleichzeitig offen – ein Kanal für alle ist sparsamer
   * als einer je Woche.
   */
  subscribeAll?(onChange: (key: string, data: unknown) => void): () => void
}
