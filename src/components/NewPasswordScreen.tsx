import { useState } from 'react'
import { signOut, updatePassword } from '../storage/supabase'

/** Wird angezeigt, wenn jemand über den „Passwort vergessen“-Link kommt. */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== repeat) {
      setError('Die beiden Passwörter stimmen nicht überein.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Es ist etwas schiefgelaufen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Neues Passwort setzen</h1>
        <form className="form" onSubmit={submit}>
          <label>
            Neues Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
            />
          </label>
          <label>
            Noch einmal zur Sicherheit
            <input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error && <p className="error-line">{error}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            Passwort speichern
          </button>
        </form>
        <div className="auth-switch">
          <button className="link-btn" onClick={() => void signOut()}>
            Abbrechen und abmelden
          </button>
        </div>
      </div>
    </div>
  )
}
