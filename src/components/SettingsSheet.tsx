import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Settings } from '../types'
import {
  ensureHousehold,
  joinHousehold,
  signInWithEmail,
  signOut,
  supabaseConfigured,
} from '../storage/supabase'
import { Modal } from './Modal'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  session: Session | null
  householdId: string | null
  onHouseholdChange: (id: string | null) => void
  onClose: () => void
}

export function SettingsSheet({
  settings,
  onChange,
  session,
  householdId,
  onHouseholdChange,
  onClose,
}: Props) {
  const [email, setEmail] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true)
    setStatus(null)
    try {
      await fn()
      setStatus(done)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Es ist ein Fehler aufgetreten.')
    } finally {
      setBusy(false)
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
        Der Dienst wechselt täglich und läuft über Wochengrenzen hinweg weiter. Wer wann dran ist,
        stellst du im Reiter <strong>Termine</strong> um: einzelne Tage per Tipp auf das
        Bettdienst-Feld, die gesamte Rotation über „Rotation tauschen“.
      </p>

      <h3>Synchronisierung</h3>
      {!supabaseConfigured ? (
        <p className="muted small">
          Aktuell wird alles nur auf diesem Gerät gespeichert. Für die Synchronisierung zwischen
          mehreren Geräten trage <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          in die Datei <code>.env</code> ein (siehe README).
        </p>
      ) : !session ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => signInWithEmail(email), 'Login-Link verschickt – schau in dein Postfach.')
          }}
        >
          <label className="form-label">
            E-Mail-Adresse
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mama@beispiel.de"
              required
            />
          </label>
          <button className="primary-btn" type="submit" disabled={busy}>
            Login-Link schicken
          </button>
        </form>
      ) : (
        <>
          <p className="muted small">Angemeldet als {session.user.email}</p>
          {householdId ? (
            <>
              <label className="form-label">
                Haushalts-Code (für das zweite Handy)
                <input readOnly value={householdId} onFocus={(e) => e.target.select()} />
              </label>
              <p className="muted small">
                Diesen Code persönlich weitergeben – wer ihn kennt und angemeldet ist, kann dem
                Haushalt beitreten.
              </p>
            </>
          ) : (
            <button
              className="primary-btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  onHouseholdChange(await ensureHousehold())
                }, 'Haushalt bereit.')
              }
            >
              Haushalt anlegen / laden
            </button>
          )}

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await joinHousehold(joinCode.trim())
                onHouseholdChange(joinCode.trim())
              }, 'Haushalt beigetreten.')
            }}
          >
            <label className="form-label">
              Einem bestehenden Haushalt beitreten
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Haushalts-Code einfügen"
              />
            </label>
            <button className="secondary-btn" type="submit" disabled={busy || !joinCode.trim()}>
              Beitreten
            </button>
          </form>

          <button
            className="secondary-btn"
            onClick={() =>
              void run(async () => {
                await signOut()
                onHouseholdChange(null)
              }, 'Abgemeldet.')
            }
          >
            Abmelden
          </button>
        </>
      )}

      {status && <p className="status-line">{status}</p>}
    </Modal>
  )
}
