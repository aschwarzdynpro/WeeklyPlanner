import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { PERSON_COLORS } from '../types'
import type { Person, Settings } from '../types'
import { uid } from '../lib/week'
import { signOut, updatePassword } from '../storage/supabase'
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
} from '../lib/notifications'
import type { ReminderPrefs } from '../lib/notifications'
import { currentPushSubscription, disablePush, enablePush, pushConfigured, updatePushAttendee } from '../storage/push'
import { Modal } from './Modal'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  reminders: ReminderPrefs
  onRemindersChange: (patch: Partial<ReminderPrefs>) => void
  session: Session
  householdId: string
  onSignOut: () => void
  onClose: () => void
}

export function SettingsSheet({
  settings,
  onChange,
  reminders,
  onRemindersChange,
  session,
  householdId,
  onSignOut,
  onClose,
}: Props) {
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const supported = notificationsSupported()

  // Der Nutzer kann die Erlaubnis jederzeit im Browser zurücknehmen –
  // dann darf hier kein Haken stehen bleiben, der nichts mehr bewirkt.
  useEffect(() => {
    if (!supported) return
    if (reminders.enabled && notificationPermission() !== 'granted') {
      onRemindersChange({ enabled: false, push: false })
      return
    }
    if (!reminders.push) return
    void currentPushSubscription().then((sub) => {
      if (!sub) onRemindersChange({ push: false })
    })
  }, [supported, reminders.enabled, reminders.push, onRemindersChange])

  const toggleReminders = async (on: boolean) => {
    setReminderError(null)
    if (!on) {
      if (reminders.push) await disablePush().catch(() => undefined)
      onRemindersChange({ enabled: false, push: false })
      return
    }
    const permission = await requestNotificationPermission()
    if (permission !== 'granted') {
      setReminderError(
        'Der Browser zeigt keine Benachrichtigungen an. Die Erlaubnis lässt sich in den Website-Einstellungen des Browsers wieder erteilen.',
      )
      return
    }
    onRemindersChange({ enabled: true })
  }

  const togglePush = async (on: boolean) => {
    setReminderError(null)
    setPushBusy(true)
    try {
      if (on) {
        await enablePush(householdId, reminders.onlyFor)
        onRemindersChange({ push: true })
      } else {
        await disablePush()
        onRemindersChange({ push: false })
      }
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : 'Push ließ sich nicht einrichten.')
    } finally {
      setPushBusy(false)
    }
  }

  const changeOnlyFor = (value: string) => {
    onRemindersChange({ onlyFor: value })
    if (reminders.push) void updatePushAttendee(value)
  }

  const patchPerson = (id: string, fields: Partial<Person>) => {
    onChange({ people: settings.people.map((p) => (p.id === id ? { ...p, ...fields } : p)) })
  }

  const addPerson = () => {
    const used = new Set(settings.people.map((p) => p.color))
    const color = PERSON_COLORS.find((c) => !used.has(c)) ?? PERSON_COLORS[0]
    onChange({
      people: [
        ...settings.people,
        { id: uid(), name: 'Neue Person', emoji: '🙂', color, bedtime: false },
      ],
    })
  }

  const removePerson = (id: string) => {
    const people = settings.people.filter((p) => p.id !== id)
    if (people.length === 0) return
    const patch: Partial<Settings> = { people }
    // Die Rotation darf nicht bei jemandem beginnen, den es nicht mehr gibt.
    if (settings.bedtimeStart === id) {
      patch.bedtimeStart = people.find((p) => p.bedtime)?.id ?? people[0].id
    }
    onChange(patch)
    // Erinnerungen dieses Geräts hingen womöglich an der gelöschten Person.
    if (reminders.onlyFor === id) changeOnlyFor('alle')
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    setError(null)
    try {
      await updatePassword(password)
      setPassword('')
      setStatus('Passwort geändert.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Es ist etwas schiefgelaufen.')
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(householdId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal title="Einstellungen" onClose={onClose}>
      <h3>Haushalt</h3>
      <label className="form-label">
        Portionen (Mengen werden automatisch umgerechnet)
        <input
          type="number"
          min={1}
          max={12}
          value={settings.servings}
          onChange={(e) => onChange({ servings: Math.max(1, Number(e.target.value) || 1) })}
        />
      </label>

      <h3>Familie</h3>
      <ul className="person-list">
        {settings.people.map((person) => (
          <li key={person.id}>
            <div className="person-row">
              <input
                className="person-emoji"
                value={person.emoji}
                onChange={(e) => patchPerson(person.id, { emoji: e.target.value.slice(0, 4) })}
                aria-label={`Zeichen für ${person.name}`}
              />
              <input
                className="person-name"
                value={person.name}
                onChange={(e) => patchPerson(person.id, { name: e.target.value })}
                aria-label="Name"
              />
              {settings.people.length > 1 && (
                <button
                  className="icon-btn"
                  onClick={() => removePerson(person.id)}
                  aria-label={`${person.name} entfernen`}
                  title="Entfernen"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="person-row">
              <div className="color-choice">
                {PERSON_COLORS.map((color) => (
                  <button
                    key={color}
                    className={person.color === color ? 'color-dot on' : 'color-dot'}
                    style={{ background: color }}
                    onClick={() => patchPerson(person.id, { color })}
                    aria-label={`Farbe für ${person.name}`}
                    aria-pressed={person.color === color}
                  />
                ))}
              </div>
              <label className="switch-row person-bedtime">
                <input
                  type="checkbox"
                  checked={person.bedtime}
                  onChange={(e) => patchPerson(person.id, { bedtime: e.target.checked })}
                />
                <span>Bettdienst</span>
              </label>
            </div>
          </li>
        ))}
      </ul>
      <button className="secondary-btn" onClick={addPerson}>
        + Person
      </button>
      <p className="muted small">
        Diese Namen stehen im Termin zur Auswahl. Wer den Haken bei „Bettdienst“ hat, kommt in die
        abendliche Rotation — bei zwei Personen wechselt sie täglich, bei dreien reihum. Nimmt
        niemand teil, verschwindet der Balken aus der Wochenansicht.
      </p>

      <h3>Bettdienst</h3>
      <div className="form-row">
        <label className="form-label">
          Von
          <input
            type="time"
            value={settings.bedtimeFrom}
            onChange={(e) => onChange({ bedtimeFrom: e.target.value })}
          />
        </label>
        <label className="form-label">
          Bis
          <input
            type="time"
            value={settings.bedtimeTo}
            onChange={(e) => onChange({ bedtimeTo: e.target.value })}
          />
        </label>
      </div>
      <p className="muted small">
        Der Dienst läuft über Wochengrenzen hinweg weiter. Wer wann dran ist, stellst du im Reiter
        <strong> Termine</strong> um: einzelne Tage per Tipp auf das Bettdienst-Feld, die gesamte
        Rotation über „Rotation verschieben“.
      </p>

      <h3>Erinnerungen</h3>
      {!supported ? (
        <p className="muted small">
          Dieser Browser kann keine Benachrichtigungen anzeigen. Auf dem iPhone klappt es erst,
          wenn die App über „Zum Home-Bildschirm hinzufügen“ abgelegt wurde.
        </p>
      ) : (
        <>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={reminders.enabled}
              onChange={(e) => void toggleReminders(e.target.checked)}
            />
            <span>An anstehende Termine erinnern</span>
          </label>

          {reminders.enabled && (
            <>
              <label className="form-label">
                Welche Termine?
                <select
                  value={reminders.onlyFor}
                  onChange={(e) => changeOnlyFor(e.target.value)}
                >
                  <option value="alle">Alle Termine</option>
                  {settings.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      Nur Termine mit {person.name}
                    </option>
                  ))}
                </select>
              </label>

              {pushConfigured && (
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={reminders.push}
                    disabled={pushBusy}
                    onChange={(e) => void togglePush(e.target.checked)}
                  />
                  <span>Auch bei geschlossener App melden</span>
                </label>
              )}

              <p className="muted small">
                Die Vorlaufzeit steht am einzelnen Termin – vom „10 Minuten vorher“ bis zum
                „einen Tag vorher“.
                {reminders.push
                  ? ' Die Erinnerung kommt auch dann, wenn der Wochenplan gerade geschlossen ist.'
                  : ' Ohne Push meldet sich das Gerät nur, solange die App geöffnet ist – der Tab darf im Hintergrund liegen.'}{' '}
                Die Einstellung gilt nur für dieses Gerät.
              </p>
            </>
          )}

          {reminderError && <p className="error-line">{reminderError}</p>}
        </>
      )}

      <h3>Geräte verbinden</h3>
      <label className="form-label">
        Haushalts-Code
        <input readOnly value={householdId} onFocus={(e) => e.target.select()} />
      </label>
      <button className="secondary-btn" onClick={copyCode}>
        {copied ? 'Kopiert ✓' : 'Code kopieren'}
      </button>
      <p className="muted small">
        Das zweite Elternteil legt sich ein eigenes Konto an und gibt diesen Code beim ersten Start
        ein – danach sehen beide denselben Plan. Der Code ist ein Schlüssel: nur persönlich
        weitergeben.
      </p>

      <h3>Konto</h3>
      <p className="muted small">Angemeldet als {session.user.email}</p>

      <form className="form" onSubmit={changePassword}>
        <label>
          Neues Passwort
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            placeholder="mindestens 8 Zeichen"
          />
        </label>
        <button className="secondary-btn" type="submit" disabled={busy || password.length < 8}>
          Passwort ändern
        </button>
      </form>

      <button
        className="danger-btn full-width"
        onClick={() => {
          onSignOut()
          void signOut()
        }}
      >
        Abmelden
      </button>
      <p className="muted small">
        Beim Abmelden werden die auf diesem Gerät zwischengespeicherten Plandaten gelöscht – wichtig
        auf einem Tablet, das mehrere nutzen.
      </p>

      {status && <p className="status-line">{status}</p>}
      {error && <p className="error-line">{error}</p>}
    </Modal>
  )
}
