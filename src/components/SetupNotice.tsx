/**
 * Ohne Supabase-Zugangsdaten gibt es keinen Login – und ohne Login keinen
 * Zugriff. Statt still auf lokale Speicherung auszuweichen, sagt die App
 * hier klar, was fehlt.
 */
export function SetupNotice() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>
          <span aria-hidden="true">🗓️</span> Familien-Wochenplan
        </h1>
        <p className="muted">Die App ist noch nicht mit der Datenbank verbunden.</p>
        <p>
          Lege eine Datei <code>.env</code> nach dem Vorbild von <code>.env.example</code> an und
          trage die beiden Werte aus deinem Supabase-Projekt ein:
        </p>
        <pre className="code-block">
          VITE_SUPABASE_URL=https://dein-projekt.supabase.co{'\n'}
          VITE_SUPABASE_ANON_KEY=…
        </pre>
        <p className="muted small">
          Die vollständige Anleitung steht in der README. Nach dem Eintragen die App neu starten
          bzw. neu bauen.
        </p>
      </div>
    </div>
  )
}
