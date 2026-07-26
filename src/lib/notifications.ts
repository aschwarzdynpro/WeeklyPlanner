/**
 * Erinnerungen sind Sache des einzelnen Geräts: Ob das Tablet in der Küche
 * abends klingelt, geht das Handy nichts an. Deshalb liegen die
 * Einstellungen im localStorage und nicht im Haushaltsdokument.
 */
export interface ReminderPrefs {
  /** Erinnerungen auf diesem Gerät anzeigen. */
  enabled: boolean
  /** Personen-id: nur Termine mit dieser Person. 'alle' zeigt jeden Termin. */
  onlyFor: string
  /** Zusätzlich per Push, also auch bei geschlossener App. */
  push: boolean
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: false,
  onlyFor: 'alle',
  push: false,
}

const PREFS_KEY = 'wochenplan:reminder-prefs'
/** Schon gezeigte Erinnerungen, damit dieselbe nicht jede Minute erneut klingelt. */
const FIRED_KEY = 'wochenplan:reminder-fired'

export function loadReminderPrefs(): ReminderPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_REMINDER_PREFS
    return { ...DEFAULT_REMINDER_PREFS, ...(JSON.parse(raw) as Partial<ReminderPrefs>) }
  } catch {
    return DEFAULT_REMINDER_PREFS
  }
}

export function saveReminderPrefs(prefs: ReminderPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch (err) {
    console.warn('Erinnerungs-Einstellungen konnten nicht gesichert werden:', err)
  }
}

export const notificationsSupported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator

export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied'
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null

/**
 * Registriert den Service Worker. Ohne ihn gibt es auf Android und in der
 * installierten iOS-App keine Benachrichtigungen.
 */
export function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!notificationsSupported()) return Promise.resolve(null)
  registration ??= navigator.serviceWorker
    .register(new URL('sw.js', new URL(import.meta.env.BASE_URL, location.href)).toString())
    .then((reg) => reg)
    .catch((err) => {
      console.warn('Service Worker konnte nicht registriert werden:', err)
      return null
    })
  return registration
}

/** Zeigt eine Erinnerung an – bevorzugt über den Service Worker. */
export async function showReminder(title: string, body: string, tag: string): Promise<void> {
  if (notificationPermission() !== 'granted') return
  const options: NotificationOptions = { body, tag, data: { url: './' } }
  const reg = await serviceWorkerRegistration()
  if (reg) {
    await reg.showNotification(title, options)
    return
  }
  try {
    new Notification(title, options)
  } catch (err) {
    console.warn('Erinnerung konnte nicht angezeigt werden:', err)
  }
}

// --- Merkliste bereits gezeigter Erinnerungen --------------------------------

type FiredMap = Record<string, number>

function loadFired(): FiredMap {
  try {
    const raw = localStorage.getItem(FIRED_KEY)
    return raw ? (JSON.parse(raw) as FiredMap) : {}
  } catch {
    return {}
  }
}

const TWO_WEEKS = 14 * 24 * 3600 * 1000

export function wasFired(key: string): boolean {
  return key in loadFired()
}

export function markFired(key: string): void {
  const now = Date.now()
  const fired = loadFired()
  fired[key] = now
  // Alte Einträge wegräumen, sonst wächst der Eintrag endlos.
  for (const [k, at] of Object.entries(fired)) {
    if (now - at > TWO_WEEKS) delete fired[k]
  }
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired))
  } catch {
    /* Ohne Merkliste klingelt es einmal zu oft – kein Grund abzubrechen. */
  }
}
