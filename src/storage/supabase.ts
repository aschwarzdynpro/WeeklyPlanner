import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import type { StorageAdapter } from './types'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(URL && KEY)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null
  if (!client) client = createClient(URL!, KEY!)
  return client
}

function requireSupabase(): SupabaseClient {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase ist nicht eingerichtet – siehe README.')
  return sb
}

// --- Anmeldung ---------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password })
  if (error) throw new Error(translateAuthError(error.message))
}

/**
 * Registrierung. Ist in Supabase die E-Mail-Bestätigung aktiv (Standard),
 * kommt noch keine Session zurück – dann muss erst der Link in der Mail
 * geklickt werden.
 */
export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  })
  if (error) throw new Error(translateAuthError(error.message))
  return { needsConfirmation: data.session === null }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  })
  if (error) throw new Error(translateAuthError(error.message))
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await requireSupabase().auth.updateUser({ password })
  if (error) throw new Error(translateAuthError(error.message))
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session
}

/**
 * Meldet Session-Wechsel. `recovery` ist true, wenn der Nutzer gerade über
 * einen „Passwort vergessen“-Link gekommen ist und ein neues Passwort setzen soll.
 */
export function onAuthChange(cb: (session: Session | null, recovery: boolean) => void): () => void {
  const sb = getSupabase()
  if (!sb) return () => {}
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    cb(session, event === 'PASSWORD_RECOVERY')
  })
  return () => data.subscription.unsubscribe()
}

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-Mail oder Passwort stimmt nicht.',
  'Email not confirmed': 'Bitte bestätige zuerst den Link in der Bestätigungs-E-Mail.',
  'User already registered': 'Für diese E-Mail gibt es bereits ein Konto – bitte anmelden.',
  'Password should be at least 6 characters':
    'Das Passwort muss mindestens 6 Zeichen lang sein.',
  'New password should be different from the old password':
    'Das neue Passwort muss sich vom alten unterscheiden.',
}

function translateAuthError(message: string): string {
  return AUTH_MESSAGES[message] ?? message
}

// --- Haushalt ----------------------------------------------------------------

/** Haushalt des angemeldeten Nutzers – oder null, wenn es noch keinen gibt. */
export async function getHousehold(): Promise<string | null> {
  const { data, error } = await requireSupabase().rpc('get_household')
  if (error) throw error
  return (data as string | null) ?? null
}

export async function createHousehold(): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_household')
  if (error) throw error
  return data as string
}

/** Zweites Elternteil tritt mit dem geteilten Haushalts-Code bei. */
export async function joinHousehold(householdId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('join_household', { p_household: householdId })
  if (error) {
    throw new Error(
      error.message.includes('nicht gefunden')
        ? 'Zu diesem Code gibt es keinen Haushalt. Bitte prüfe die Eingabe.'
        : error.message,
    )
  }
}

// --- Datenspeicher -----------------------------------------------------------

export function createSupabaseAdapter(householdId: string): StorageAdapter {
  const sb = requireSupabase()

  return {
    kind: 'supabase',

    async load<T>(key: string): Promise<T | null> {
      const { data, error } = await sb
        .from('planner_docs')
        .select('data')
        .eq('household_id', householdId)
        .eq('key', key)
        .maybeSingle()
      if (error) throw error
      return (data?.data as T) ?? null
    },

    async save<T>(key: string, payload: T): Promise<void> {
      const { error } = await sb
        .from('planner_docs')
        .upsert(
          { household_id: householdId, key, data: payload, updated_at: new Date().toISOString() },
          { onConflict: 'household_id,key' },
        )
      if (error) throw error
    },

    subscribe<T>(key: string, onChange: (data: T) => void): () => void {
      const channel = sb
        .channel(`planner_docs:${householdId}:${key}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'planner_docs',
            filter: `household_id=eq.${householdId}`,
          },
          (payload) => {
            const row = payload.new as { key?: string; data?: unknown } | null
            if (row?.key === key && row.data) onChange(row.data as T)
          },
        )
        .subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
