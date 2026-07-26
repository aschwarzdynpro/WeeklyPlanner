/*
 * Service Worker des Familien-Wochenplans.
 *
 * Er hat drei Aufgaben:
 *  1. Erinnerungen anzeigen, während die App auf dem Gerät läuft. Die App
 *     schickt sie über `registration.showNotification()` – nötig, weil
 *     Android und installierte iOS-Apps Benachrichtigungen nur aus einem
 *     Service Worker heraus erlauben.
 *  2. Echte Push-Nachrichten entgegennehmen, die die Edge Function
 *     "send-reminders" verschickt – die kommen auch an, wenn die App
 *     geschlossen ist.
 *  3. Die App auch ohne Netz starten lassen. Die Daten liegen ohnehin als
 *     Kopie im localStorage; ohne die Programmdateien nützt das aber
 *     nichts, wenn im Supermarkt das Netz wegbleibt.
 */

const CACHE = 'wochenplan-v1'

self.addEventListener('install', (event) => {
  // Die Startseite mitnehmen – der Rest kommt beim ersten Laden dazu.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request('./', { cache: 'reload' })))
      .catch(() => undefined),
  )
  // Neue Fassung sofort übernehmen, statt auf das Schließen aller Tabs zu warten.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Nur eigene Dateien: alles Richtung Supabase muss unangetastet durchlaufen.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // Beim Seitenaufruf zuerst das Netz fragen, damit eine neue Fassung der
    // App auch wirklich ankommt; die Kopie ist nur der Notnagel ohne Netz.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put('./', copy))
          return response
        })
        .catch(() => caches.match('./').then((hit) => hit ?? Response.error())),
    )
    return
  }

  // Skripte, Stile und Bilder tragen einen Inhalts-Hash im Namen: Was einmal
  // unter diesem Namen geladen wurde, ändert sich nie wieder.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
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
