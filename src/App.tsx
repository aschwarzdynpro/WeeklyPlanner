import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { usePlanner } from './hooks/usePlanner'
import { clearLocalCache, createLocalCache } from './storage/local'
import {
  createSupabaseAdapter,
  getHousehold,
  getSession,
  onAuthChange,
  supabaseConfigured,
} from './storage/supabase'
import { fromISODate, formatRange, isoWeekNumber } from './lib/week'
import { MealPlan } from './components/MealPlan'
import { ShoppingList } from './components/ShoppingList'
import { Schedule } from './components/Schedule'
import { RecipeLibrary } from './components/RecipeLibrary'
import { SettingsSheet } from './components/SettingsSheet'
import { AuthScreen } from './components/AuthScreen'
import { HouseholdScreen } from './components/HouseholdScreen'
import { NewPasswordScreen } from './components/NewPasswordScreen'
import { SetupNotice } from './components/SetupNotice'

type Tab = 'essen' | 'einkauf' | 'termine' | 'rezepte'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'essen', label: 'Essensplan', icon: '🍽️' },
  { key: 'einkauf', label: 'Einkauf', icon: '🛒' },
  { key: 'termine', label: 'Termine', icon: '📅' },
  { key: 'rezepte', label: 'Rezepte', icon: '📖' },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [householdLoading, setHouseholdLoading] = useState(false)

  // --- Anmeldung im Blick behalten -------------------------------------------
  useEffect(() => {
    if (!supabaseConfigured) {
      setCheckingSession(false)
      return
    }
    void getSession().then((s) => {
      setSession(s)
      setCheckingSession(false)
    })
    return onAuthChange((s, isRecovery) => {
      setSession(s)
      setCheckingSession(false)
      if (isRecovery) setRecovery(true)
      if (!s) {
        // Abgemeldet: nichts Verwertbares auf dem Gerät zurücklassen.
        setHouseholdId(null)
        setRecovery(false)
        clearLocalCache()
      }
    })
  }, [])

  // --- Haushalt des Kontos ermitteln -----------------------------------------
  useEffect(() => {
    if (!session) return
    setHouseholdLoading(true)
    getHousehold()
      .then(setHouseholdId)
      .catch((err) => console.warn('Haushalt konnte nicht geladen werden:', err))
      .finally(() => setHouseholdLoading(false))
  }, [session])

  if (!supabaseConfigured) return <SetupNotice />
  if (checkingSession) return <SplashScreen />
  if (recovery) return <NewPasswordScreen onDone={() => setRecovery(false)} />
  if (!session) return <AuthScreen />
  if (householdLoading) return <SplashScreen />
  if (!householdId) {
    return <HouseholdScreen email={session.user.email} onReady={setHouseholdId} />
  }

  return <Planner session={session} householdId={householdId} />
}

function SplashScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="muted">Einen Moment …</p>
      </div>
    </div>
  )
}

function Planner({ session, householdId }: { session: Session; householdId: string }) {
  const [tab, setTab] = useState<Tab>('essen')
  const [showSettings, setShowSettings] = useState(false)

  const adapter = useMemo(() => createSupabaseAdapter(householdId), [householdId])
  const cache = useMemo(() => createLocalCache(householdId), [householdId])

  const { weekStart, week, settings, sync, updateWeek, updateSettings, goToWeek, goToToday } =
    usePlanner(adapter, cache)

  const handleSignOut = useCallback(() => {
    setShowSettings(false)
  }, [])

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
        <span className={sync === 'offline' ? 'sync-offline' : undefined}>
          {sync === 'gespeichert' && 'Gespeichert und auf allen Geräten synchron'}
          {sync === 'lädt' && 'Lädt …'}
          {sync === 'offline' && 'Offline – Änderungen liegen auf diesem Gerät bereit'}
        </span>
      </footer>

      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={updateSettings}
          session={session}
          householdId={householdId}
          onSignOut={handleSignOut}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
