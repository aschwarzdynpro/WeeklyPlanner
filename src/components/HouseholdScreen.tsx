import { useState } from 'react'
import { createHousehold, joinHousehold, signOut } from '../storage/supabase'

interface Props {
  email: string | undefined
  onReady: (householdId: string) => void
}

/**
 * Erster Start nach der Registrierung: entweder einen Haushalt anlegen
 * (erstes Elternteil) oder mit dem Code beitreten (zweites Elternteil).
 */
export function HouseholdScreen({ email, onReady }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setError(null)
    try {
      onReady(await fn())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Es ist etwas schiefgelaufen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Willkommen{email ? `, ${email}` : ''}</h1>
        <p className="muted">
          Ein Haushalt bündelt euren Plan. Beide Elternteile arbeiten im selben Haushalt und sehen
          dieselben Daten – auf Handy, Tablet und Laptop.
        </p>

        <h2>Zum ersten Mal hier?</h2>
        <button className="primary-btn" disabled={busy} onClick={() => void run(createHousehold)}>
          Neuen Haushalt anlegen
        </button>

        <h2>Oder dazukommen</h2>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            const value = code.trim()
            void run(async () => {
              await joinHousehold(value)
              return value
            })
          }}
        >
          <label>
            Haushalts-Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="z. B. 3f1c8a2e-…"
            />
          </label>
          <button className="secondary-btn" type="submit" disabled={busy || !code.trim()}>
            Haushalt beitreten
          </button>
        </form>

        <p className="muted small">
          Den Code findet das andere Elternteil in der App unter ⚙️ Einstellungen.
        </p>

        {error && <p className="error-line">{error}</p>}

        <div className="auth-switch">
          <button className="link-btn" onClick={() => void signOut()}>
            Abmelden
          </button>
        </div>
      </div>
    </div>
  )
}
