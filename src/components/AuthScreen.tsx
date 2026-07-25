import { useState } from 'react'
import { requestPasswordReset, signIn, signUp } from '../storage/supabase'

type Mode = 'anmelden' | 'registrieren' | 'passwort-vergessen'

const TITLES: Record<Mode, string> = {
  anmelden: 'Anmelden',
  registrieren: 'Konto anlegen',
  'passwort-vergessen': 'Passwort zurücksetzen',
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('anmelden')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'anmelden') {
        await signIn(email.trim(), password)
        // Bei Erfolg übernimmt der Auth-Listener in App.tsx.
      } else if (mode === 'registrieren') {
        const { needsConfirmation } = await signUp(email.trim(), password)
        if (needsConfirmation) {
          setNotice(
            'Fast geschafft: Wir haben dir eine E-Mail geschickt. Klick den Link darin, danach kannst du dich anmelden.',
          )
        }
      } else {
        await requestPasswordReset(email.trim())
        setNotice(
          'Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail zum Zurücksetzen unterwegs.',
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Es ist etwas schiefgelaufen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>
          <span aria-hidden="true">🗓️</span> Familien-Wochenplan
        </h1>
        <p className="muted">
          Essensplan, Einkaufsliste und Termine – auf allen Geräten der Familie.
        </p>

        <h2>{TITLES[mode]}</h2>

        <form className="form" onSubmit={submit}>
          <label>
            E-Mail-Adresse
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="mama@beispiel.de"
              required
            />
          </label>

          {mode !== 'passwort-vergessen' && (
            <label>
              Passwort
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'anmelden' ? 'current-password' : 'new-password'}
                minLength={8}
                required
              />
            </label>
          )}

          {mode === 'registrieren' && (
            <p className="muted small">Mindestens 8 Zeichen.</p>
          )}

          {error && <p className="error-line">{error}</p>}
          {notice && <p className="status-line">{notice}</p>}

          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Einen Moment …' : TITLES[mode]}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'anmelden' ? (
            <>
              <button className="link-btn" onClick={() => switchTo('registrieren')}>
                Neues Konto anlegen
              </button>
              <button className="link-btn" onClick={() => switchTo('passwort-vergessen')}>
                Passwort vergessen?
              </button>
            </>
          ) : (
            <button className="link-btn" onClick={() => switchTo('anmelden')}>
              Zurück zur Anmeldung
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
