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
import { occurrencesOn, spansOn } from './lib/calendar'
import type { CalendarView as ViewKey } from './lib/calendar'
import { MealPlan } from './components/MealPlan'
import { ShoppingList } from './components/ShoppingList'
import { CalendarView } from './components/calendar/CalendarView'
import { MiniMonth } from './components/calendar/MiniMonth'
import { RecipeLibrary } from './components/RecipeLibrary'
import { SettingsSheet } from './components/SettingsSheet'
import { AuthScreen } from './components/AuthScreen'
import { HouseholdScreen } from './components/HouseholdScreen'
import { NewPasswordScreen } from './components/NewPasswordScreen'
import { SetupNotice } from './components/SetupNotice'

type Tab = 'termine' | 'essen' | 'einkauf' | 'rezepte'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'termine', label: 'Kalender', icon: '📅' },
  { key: 'essen', label: 'Essensplan', icon: '🍽️' },
  { key: 'einkauf', label: 'Einkauf', icon: '🛒' },
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
  const [tab, setTab] = useState<Tab>('termine')
  const [view, setView] = useState<ViewKey>(() =>
    // Auf dem Handy ist die Woche zu eng; dort startet der Kalender als Agenda.
    typeof window !== 'undefined' && window.innerWidth < 720 ? 'agenda' : 'woche',
  )
  const [showSettings, setShowSettings] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [reminders, setReminders] = useState<ReminderPrefs>(loadReminderPrefs)

  const adapter = useMemo(() => createSupabaseAdapter(householdId), [householdId])
  const cache = useMemo(() => createLocalCache(householdId), [householdId])

  const planner = usePlanner(adapter, cache)
  const { anchor, setAnchor, weekStart, week, weeks, series, spans, settings, sync } = planner
  const library = useRecipes(householdId)

  const visible = useMemo(
    () => new Set(settings.people.map((p) => p.id).filter((id) => !hidden.has(id))),
    [settings.people, hidden],
  )

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

  /** Punkte im kleinen Kalender – nur für Wochen, die ohnehin geladen sind. */
  const hasEntries = useCallback(
    (date: string) =>
      occurrencesOn(date, weeks, series).length > 0 || spansOn(spans, date).length > 0,
    [weeks, series, spans],
  )

  const pick = (next: Tab) => {
    setTab(next)
    setSideOpen(false)
  }

  return (
    <div className="shell">
      {sideOpen && <div className="side-scrim" onClick={() => setSideOpen(false)} />}

      <aside className={sideOpen ? 'side open' : 'side'}>
        <div className="side-head">
          <span className="side-logo" aria-hidden="true">
            🗓️
          </span>
          <span className="side-title">Wochenplan</span>
          <button
            className="icon-btn side-close"
            onClick={() => setSideOpen(false)}
            aria-label="Menü schließen"
          >
            ✕
          </button>
        </div>

        <nav className="side-nav" aria-label="Bereiche">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'side-item on' : 'side-item'}
              onClick={() => pick(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>

        {tab === 'termine' && (
          <>
            <MiniMonth
              selected={anchor}
              onSelect={setAnchor}
              hasEntries={hasEntries}
              highlightWeek={view === 'monat' || view === 'agenda' ? null : weekStart}
            />

            <div className="side-section">
              <h3>Meine Kalender</h3>
              <ul className="side-people">
                {settings.people.map((person) => (
                  <li key={person.id}>
                    <label className="switch-row">
                      <input
                        type="checkbox"
                        checked={!hidden.has(person.id)}
                        style={{ accentColor: person.color }}
                        onChange={(e) =>
                          setHidden((current) => {
                            const next = new Set(current)
                            if (e.target.checked) next.delete(person.id)
                            else next.add(person.id)
                            return next
                          })
                        }
                      />
                      <span>
                        {person.emoji} {person.name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                Termine ohne ausdrückliche Auswahl gelten für alle und bleiben immer sichtbar.
              </p>
            </div>
          </>
        )}

        <button className="side-item side-foot" onClick={() => setShowSettings(true)}>
          <span aria-hidden="true">⚙️</span> Einstellungen
        </button>
      </aside>

      <div className="pane">
        <header className="topbar">
          <button
            className="icon-btn topbar-menu"
            onClick={() => setSideOpen(true)}
            aria-label="Menü öffnen"
          >
            ☰
          </button>
          <h1 className="topbar-title">{TABS.find((t) => t.key === tab)?.label}</h1>

          {tab !== 'termine' && (
            <div className="topbar-week">
              <button
                className="icon-btn"
                onClick={() => planner.goToWeek(-1)}
                aria-label="Vorherige Woche"
              >
                ‹
              </button>
              <button
                className="week-label"
                onClick={planner.goToToday}
                title="Zur aktuellen Woche"
              >
                <strong>KW {isoWeekNumber(fromISODate(weekStart))}</strong>
                <span>{formatRange(weekStart)}</span>
              </button>
              <button
                className="icon-btn"
                onClick={() => planner.goToWeek(1)}
                aria-label="Nächste Woche"
              >
                ›
              </button>
            </div>
          )}

          <span className={`topbar-sync${sync === 'offline' ? ' offline' : ''}`}>
            {sync === 'gespeichert' && '✓ Synchron'}
            {sync === 'lädt' && 'Lädt …'}
            {sync === 'offline' && 'Offline'}
          </span>
        </header>

        <main className={tab === 'termine' ? 'pane-body flush' : 'pane-body'}>
          {tab === 'termine' ? (
            <CalendarView planner={planner} visible={visible} view={view} onViewChange={setView} />
          ) : !week ? (
            <p className="muted">Wird geladen …</p>
          ) : tab === 'essen' ? (
            <MealPlan
              week={week}
              settings={settings}
              recipes={library.all}
              recipeById={library.byId}
              onChange={planner.updateWeek}
            />
          ) : tab === 'einkauf' ? (
            <ShoppingList
              week={week}
              settings={settings}
              recipeById={library.byId}
              onChange={planner.updateWeek}
            />
          ) : (
            <RecipeLibrary settings={settings} library={library} />
          )}
        </main>
      </div>

      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={planner.updateSettings}
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
