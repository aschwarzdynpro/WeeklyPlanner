import { serviceWorkerRegistration } from '../lib/notifications'
import { getSupabase } from './supabase'

/**
 * Anmeldung beim Push-Dienst des Browsers.
 *
 * Damit erreichen Erinnerungen das Handy auch bei geschlossener App. Der
 * öffentliche VAPID-Schlüssel gehört ins Frontend – der private liegt
 * ausschließlich in den Secrets der Edge Function.
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushConfigured = Boolean(VAPID_PUBLIC_KEY)

/** Der Schlüssel steht als URL-sicheres Base64 in der Konfiguration. */
function decodeKey(base64: string): BufferSource {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (!key) return ''
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const reg = await serviceWorkerRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Meldet dieses Gerät für Push an und hinterlegt das Abo im Haushalt. */
export async function enablePush(householdId: string, onlyFor: string): Promise<void> {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Für Push fehlt der öffentliche VAPID-Schlüssel (VITE_VAPID_PUBLIC_KEY).')
  }
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase ist nicht eingerichtet.')

  const reg = await serviceWorkerRegistration()
  if (!reg) throw new Error('Dieses Gerät unterstützt keine Push-Nachrichten.')

  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // Ohne sichtbare Meldung erlauben Browser gar keine Push-Nachrichten.
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_PUBLIC_KEY),
    }))

  const { data: user } = await sb.auth.getUser()
  if (!user.user) throw new Error('Nicht angemeldet.')

  const { error } = await sb.from('push_subscriptions').upsert(
    {
      household_id: householdId,
      user_id: user.user.id,
      endpoint: subscription.endpoint,
      p256dh: keyToBase64(subscription.getKey('p256dh')),
      auth: keyToBase64(subscription.getKey('auth')),
      only_for: onlyFor,
      user_agent: navigator.userAgent.slice(0, 200),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(errorText(error.message))
}

/** Meldet dieses Gerät wieder ab. */
export async function disablePush(): Promise<void> {
  const subscription = await currentPushSubscription()
  if (!subscription) return
  const sb = getSupabase()
  if (sb) {
    const { error } = await sb
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
    if (error) console.warn('Push-Abo blieb in der Datenbank stehen:', error.message)
  }
  await subscription.unsubscribe()
}

/** Ändert, für wen dieses Gerät Erinnerungen bekommt. */
export async function updatePushAttendee(onlyFor: string): Promise<void> {
  const subscription = await currentPushSubscription()
  const sb = getSupabase()
  if (!subscription || !sb) return
  const { error } = await sb
    .from('push_subscriptions')
    .update({ only_for: onlyFor, updated_at: new Date().toISOString() })
    .eq('endpoint', subscription.endpoint)
  if (error) console.warn('Push-Einstellung nicht gespeichert:', error.message)
}

function errorText(message: string): string {
  // Die Tabelle kommt erst mit Migration 0004 – vorher ist sie schlicht nicht da.
  if (message.includes('push_subscriptions') && message.includes('does not exist')) {
    return 'Die Tabelle für Push-Abos fehlt noch. Bitte 0004_reminders.sql in Supabase ausführen.'
  }
  return message
}
