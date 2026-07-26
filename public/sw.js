/*
 * Service Worker des Familien-Wochenplans.
 *
 * Er hat zwei Aufgaben:
 *  1. Erinnerungen anzeigen, während die App auf dem Gerät läuft. Die App
 *     schickt sie über `registration.showNotification()` – nötig, weil
 *     Android und installierte iOS-Apps Benachrichtigungen nur aus einem
 *     Service Worker heraus erlauben.
 *  2. Echte Push-Nachrichten entgegennehmen, die die Edge Function
 *     "send-reminders" verschickt – die kommen auch an, wenn die App
 *     geschlossen ist.
 *
 * Bewusst kein Caching von App-Dateien: der Plan soll immer der aktuelle
 * sein, und die Offline-Kopie der Daten liegt bereits im localStorage.
 */

self.addEventListener('install', () => {
  // Neue Fassung sofort übernehmen, statt auf das Schließen aller Tabs zu warten.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Wochenplan', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Anstehender Termin'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      tag: payload.tag || title,
      // Gleiche Erinnerung von mehreren Geräten überschreibt sich, statt sich zu stapeln.
      renotify: false,
      icon: payload.icon,
      badge: payload.icon,
      data: { url: payload.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || './'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Ist die App schon offen, dorthin springen statt einen zweiten Tab zu öffnen.
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
