import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { usePlanner } from './hooks/usePlanner'
import { localAdapter } from './storage/local'
import {
  createSupabaseAdapter,
  ensureHousehold,
  getSession,
  getStoredHouseholdId,
  onAuthChange,
  setStoredHouseholdId,
  supabaseConfigured,
} from './storage/supabase'
import type { StorageAdapter } from './storage/types'
import { fromISODate, formatRange, isoWeekNumber } from './lib/week'
import { MealPlan } from './components/MealPlan'
import { ShoppingList } from './components/ShoppingList'
import { Schedule } from './components/Schedule'
import { RecipeLibrary } from './components/RecipeLibrary'
import { SettingsSheet } from './components/SettingsSheet'

type Tab = 'essen' | 'einkauf' | 'termine' | 'rezepte'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'essen', label: 'Essensplan', icon: '🍽️' },
  { key: 'einkauf', label: 'Einkauf', icon: '🛒' },
  { key: 'termine', label: 'Termine', icon: '📅' },
  { key: 'rezepte', label: 'Rezepte', icon: '📖' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('essen')
  const [showSettings, setShowSettings] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [householdId, setHouseholdId] = useState<string | null>(() => getStoredHouseholdId())

  // Supabase-Session beobachten und Haushalt sicherstellen.
  useEffect(() => {
    if (!supabaseConfigured) return
    void getSession().then(setSession)
    return onAuthChange(setSession)
  }, [])

  useEffect(() => {
    if (!supabaseConfigured || !session || householdId) return
    ensureHousehold()
      .then(setHouseholdId)
      .catch((err) => console.warn('Haushalt konnte nicht geladen werden:', err))
  }, [session, householdId])

  const adapter: StorageAdapter = useMemo(() => {
    if (supabaseConfigured && session && householdId) {
      try {
        return createSupabaseAdapter(householdId)
      } catch (err) {
        console.warn('Supabase nicht verfügbar, nutze lokale Speicherung:', err)
      }
    }
    return localAdapter
  }, [session, householdId])

  const { weekStart, week, settings, sync, updateWeek, updateSettings, goToWeek, goToToday } =
    usePlanner(adapter)

  const handleHouseholdChange = (id: string | null) => {
    setStoredHouseholdId(id)
    setHouseholdId(id)
  }

  return (
    <div className="app">
      <header className="app-head">
        <div className="head-top">
          <h1>
            <span aria-hidden="true">🗓️</span> Familien-Wochenplan
          </h1>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Einstellungen"
          >
            ⚙️
          </button>
        </div>

        <div className="week-nav">
          <button className="icon-btn" onClick={() => goToWeek(-1)} aria-label="Vorherige Woche">
            ‹
          </button>
          <button className="week-label" onClick={goToToday} title="Zur aktuellen Woche">
            <strong>KW {isoWeekNumber(fromISODate(weekStart))}</strong>
            <span>{formatRange(weekStart)}</span>
          </button>
          <button className="icon-btn" onClick={() => goToWeek(1)} aria-label="Nächste Woche">
            ›
          </button>
        </div>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {!week ? (
          <p className="muted">Wird geladen …</p>
        ) : tab === 'essen' ? (
          <MealPlan week={week} settings={settings} onChange={updateWeek} />
        ) : tab === 'einkauf' ? (
          <ShoppingList week={week} settings={settings} onChange={updateWeek} />
        ) : tab === 'termine' ? (
          <Schedule
            week={week}
            settings={settings}
            onChange={updateWeek}
            onSettingsChange={updateSettings}
          />
        ) : (
          <RecipeLibrary settings={settings} />
        )}
      </main>

      <footer className="app-foot">
        <span className={`sync sync-${sync}`}>
          {sync === 'lokal' && 'Auf diesem Gerät gespeichert'}
          {sync === 'gespeichert' && 'Mit Supabase synchronisiert'}
          {sync === 'lädt' && 'Lädt …'}
          {sync === 'fehler' && 'Offline – lokal gesichert'}
        </span>
      </footer>

      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={updateSettings}
          session={session}
          householdId={householdId}
          onHouseholdChange={handleHouseholdChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
