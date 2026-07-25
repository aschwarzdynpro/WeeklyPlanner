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

const HOUSEHOLD_STORAGE_KEY = 'wochenplan:householdId'

export function getStoredHouseholdId(): string | null {
  return localStorage.getItem(HOUSEHOLD_STORAGE_KEY)
}

export function setStoredHouseholdId(id: string | null): void {
  if (id) localStorage.setItem(HOUSEHOLD_STORAGE_KEY, id)
  else localStorage.removeItem(HOUSEHOLD_STORAGE_KEY)
}

/** Login per Magic Link – kein Passwort nötig. */
export async function signInWithEmail(email: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase ist nicht konfiguriert.')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

/**
 * Liefert den Haushalt des angemeldeten Nutzers. Existiert noch keiner,
 * wird über die RPC `ensure_household` einer angelegt.
 */
export async function ensureHousehold(): Promise<string> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase ist nicht konfiguriert.')
  const { data, error } = await sb.rpc('ensure_household')
  if (error) throw error
  const id = data as string
  setStoredHouseholdId(id)
  return id
}

/** Zweites Elternteil tritt mit dem geteilten Haushalts-Code bei. */
export async function joinHousehold(householdId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase ist nicht konfiguriert.')
  const { error } = await sb.rpc('join_household', { p_household: householdId })
  if (error) throw error
  setStoredHouseholdId(householdId)
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const sb = getSupabase()
  if (!sb) return () => {}
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session
}

export function createSupabaseAdapter(householdId: string): StorageAdapter {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase ist nicht konfiguriert.')

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
