import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { usePlanner } from './hooks/usePlanner'
import { useRecipes } from './hooks/useRecipes'
import { useReminders } from './hooks/useReminders'
import { clearLocalCache, createLocalCache } from './storage/local'
import { disablePush } from './storage/push'
import {
  loadReminderPrefs,
  saveReminderPrefs,
  serviceWorkerRegistration,
} from './lib/notifications'
import type { ReminderPrefs } from './lib/notifications'
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

  const [reminders, setReminders] = useState<ReminderPrefs>(loadReminderPrefs)

  const adapter = useMemo(() => createSupabaseAdapter(householdId), [householdId])
  const cache = useMemo(() => createLocalCache(householdId), [householdId])

  const {
    weekStart,
    week,
    series,
    spans,
    settings,
    sync,
    updateWeek,
    updateSeries,
    updateSpans,
    updateSettings,
    goToWeek,
    goToToday,
  } = usePlanner(adapter, cache)
  const library = useRecipes(householdId)

  const updateReminders = useCallback((patch: Partial<ReminderPrefs>) => {
    setReminders((current) => {
      const next = { ...current, ...patch }
      saveReminderPrefs(next)
      return next
    })
  }, [])

  // Der Service Worker hält die App ohne Netz startklar und zeigt die
  // Erinnerungen an – deshalb immer registrieren, nicht erst bei Bedarf.
  useEffect(() => {
    void serviceWorkerRegistration()
  }, [])

  useReminders(adapter, cache, series, settings, reminders)

  const handleSignOut = useCallback(() => {
    setShowSettings(false)
    // Auf einem gemeinsam genutzten Tablet soll das nächste Konto keine
    // Erinnerungen des vorherigen bekommen.
    if (reminders.push) void disablePush().catch(() => undefined)
    setReminders((current) => {
      const next = { ...current, enabled: false, push: false }
      saveReminderPrefs(next)
      return next
    })
  }, [reminders.push])

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
          <MealPlan
            week={week}
            settings={settings}
            recipes={library.all}
            recipeById={library.byId}
            onChange={updateWeek}
          />
        ) : tab === 'einkauf' ? (
          <ShoppingList
            week={week}
            settings={settings}
            recipeById={library.byId}
            onChange={updateWeek}
          />
        ) : tab === 'termine' ? (
          <Schedule
            week={week}
            series={series}
            spans={spans}
            settings={settings}
            onChange={updateWeek}
            onSeriesChange={updateSeries}
            onSpansChange={updateSpans}
            onSettingsChange={updateSettings}
          />
        ) : (
          <RecipeLibrary settings={settings} library={library} />
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
          reminders={reminders}
          onRemindersChange={updateReminders}
          session={session}
          householdId={householdId}
          onSignOut={handleSignOut}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
