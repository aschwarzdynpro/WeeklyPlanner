/**
 * Verschickt Erinnerungen an anstehende Termine als Web-Push.
 *
 * Läuft per Cron alle paar Minuten (siehe supabase/migrations/0004_reminders.sql)
 * und schaut in jedem Lauf, welche Erinnerung seit dem letzten Mal fällig
 * geworden ist. Anders als die Erinnerungen in der App selbst erreichen
 * diese das Handy auch dann, wenn der Wochenplan gerade nicht offen ist.
 *
 * Die Funktion arbeitet mit dem service_role-Key, weil sie über alle
 * Haushalte hinweg lesen muss – sie ist deshalb nur für den Cron-Job
 * gedacht und nimmt keine Angaben aus dem Request entgegen.
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

/** Die App speichert Uhrzeiten ohne Zeitzone – gemeint ist die Ortszeit der Familie. */
const TIMEZONE = Deno.env.get('REMINDER_TIMEZONE') ?? 'Europe/Berlin'

const DAY_KEYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const
type DayKey = (typeof DAY_KEYS)[number]

const ATTENDEE_LABEL: Record<string, string> = { mama: 'Mama', papa: 'Papa', kind: 'Kind' }

interface CalendarEvent {
  id: string
  day: DayKey
  start: string
  end?: string
  title: string
  who?: string[]
  location?: string
  note?: string
  remindMinutes?: number
}

interface EventSeries extends CalendarEvent {
  everyWeeks: number
  from: string
  until?: string
  skipped?: string[]
}

interface Subscription {
  id: string
  household_id: string
  endpoint: string
  p256dh: string
  auth: string
  only_for: string
}

// --- Zeitrechnung ------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000

/** Verschiebung der Zeitzone gegenüber UTC zu diesem Zeitpunkt, in Millisekunden. */
function zoneOffset(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  return asUTC - at.getTime()
}

/** Ortszeit ("2026-07-28", "16:30") als echter Zeitpunkt. */
function zonedTime(isoDate: string, time: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h || 0, min || 0)
  // Zwei Durchläufe, damit auch die Umstellung auf Sommerzeit passt.
  let result = guess - zoneOffset(new Date(guess), timeZone)
  result = guess - zoneOffset(new Date(result), timeZone)
  return new Date(result)
}

/** Heutiges Datum in der Zeitzone der Familie, als "YYYY-MM-DD". */
function todayInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

/** Montag der Woche, in der `isoDate` liegt. */
function weekStartOf(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return addDaysISO(isoDate, -((date.getUTCDay() + 6) % 7))
}

function dateOfDay(weekStart: string, day: DayKey): string {
  return addDaysISO(weekStart, DAY_KEYS.indexOf(day))
}

// --- Serien ------------------------------------------------------------------

function seriesOccurrence(series: EventSeries, weekStart: string): CalendarEvent | null {
  const first = weekStartOf(series.from)
  const diffWeeks = Math.round(
    (Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / (7 * DAY_MS),
  )
  if (diffWeeks < 0) return null
  if (diffWeeks % Math.max(1, series.everyWeeks || 1) !== 0) return null

  const date = dateOfDay(weekStart, series.day)
  if (date < series.from) return null
  if (series.until && date > series.until) return null
  if (series.skipped?.includes(date)) return null

  return { ...series, id: `${series.id}@${date}` }
}

// --- Benachrichtigungstext ---------------------------------------------------

function relativeDay(eventDate: string, today: string): string {
  if (eventDate === today) return 'Heute'
  if (eventDate === addDaysISO(today, 1)) return 'Morgen'
  const [y, m, d] = eventDate.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

function bodyFor(event: CalendarEvent, eventDate: string, today: string): string {
  const parts = [`${relativeDay(eventDate, today)} um ${event.start} Uhr`]
  if (event.location) parts.push(`📍 ${event.location}`)
  const who = (event.who ?? []).map((w) => ATTENDEE_LABEL[w]).filter(Boolean)
  if (who.length > 0 && who.length < 3) parts.push(who.join(', '))
  if (event.note) parts.push(event.note)
  return parts.join(' · ')
}

// --- Hauptlauf ---------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405)

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const contact = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:wochenplan@example.com'
  if (!publicKey || !privateKey) {
    return json(
      {
        error:
          'Push ist nicht eingerichtet: In Supabase fehlen die Secrets VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY.',
      },
      503,
    )
  }
  webpush.setVapidDetails(contact, publicKey, privateKey)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('id, household_id, endpoint, p256dh, auth, only_for')
  if (subError) return json({ error: subError.message }, 500)
  if (!subscriptions || subscriptions.length === 0) return json({ sent: 0, note: 'Keine Abos.' })

  const now = new Date()
  const today = todayInZone(now, TIMEZONE)
  const thisWeek = weekStartOf(today)
  // Die kommende Woche gehört dazu: eine Erinnerung „einen Tag vorher“ für
  // Montag früh wird schon am Sonntag fällig.
  const weeks = [thisWeek, addDaysISO(thisWeek, 7)]

  const byHousehold = new Map<string, Subscription[]>()
  for (const sub of subscriptions as Subscription[]) {
    const list = byHousehold.get(sub.household_id) ?? []
    list.push(sub)
    byHousehold.set(sub.household_id, list)
  }

  const keys = [...weeks.map((w) => `week:${w}`), 'series']
  let sent = 0
  const stale: string[] = []

  for (const [householdId, subs] of byHousehold) {
    const { data: docs, error: docError } = await supabase
      .from('planner_docs')
      .select('key, data')
      .eq('household_id', householdId)
      .in('key', keys)
    if (docError) {
      console.warn('Dokumente nicht lesbar:', householdId, docError.message)
      continue
    }

    const docByKey = new Map((docs ?? []).map((d) => [d.key as string, d.data]))
    const series = (docByKey.get('series') ?? []) as EventSeries[]

    for (const weekStart of weeks) {
      const weekData = (docByKey.get(`week:${weekStart}`) ?? {}) as { events?: CalendarEvent[] }
      const occurrences = [
        ...(Array.isArray(weekData.events) ? weekData.events : []),
        ...(Array.isArray(series)
          ? series.flatMap((s) => seriesOccurrence(s, weekStart) ?? [])
          : []),
      ]

      for (const event of occurrences) {
        if (!event.remindMinutes || !event.start) continue
        const eventDate = dateOfDay(weekStart, event.day)
        const startAt = zonedTime(eventDate, event.start, TIMEZONE)
        const dueAt = startAt.getTime() - event.remindMinutes * 60_000
        // Nur im Fenster zwischen „fällig“ und „hat begonnen“.
        if (now.getTime() < dueAt || now.getTime() >= startAt.getTime()) continue

        const key = `${weekStart}:${event.id}:${event.remindMinutes}`
        // Einfügen gelingt nur beim ersten Mal – das ist die Sperre gegen Dubletten.
        const { data: claimed, error: claimError } = await supabase
          .from('reminder_sent')
          .upsert(
            { household_id: householdId, key },
            { onConflict: 'household_id,key', ignoreDuplicates: true },
          )
          .select('key')
        if (claimError) {
          console.warn('Merkliste nicht schreibbar:', claimError.message)
          continue
        }
        if (!claimed || claimed.length === 0) continue

        const payload = JSON.stringify({
          title: `⏰ ${event.title}`,
          body: bodyFor(event, eventDate, today),
          tag: key,
        })

        for (const sub of subs) {
          const who = event.who ?? []
          // 'alle' bekommt jeden Termin; sonst nur, was diese Person betrifft.
          if (sub.only_for !== 'alle' && who.length > 0 && !who.includes(sub.only_for)) continue
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            )
            sent += 1
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode
            // 404/410: Der Browser hat das Abo verworfen – Karteileiche.
            if (status === 404 || status === 410) stale.push(sub.id)
            else console.warn('Push fehlgeschlagen:', sub.endpoint, err)
          }
        }
      }
    }
  }

  if (stale.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', stale)
  }
  // Gelegentlich die Merkliste kürzen; sie wächst sonst unbegrenzt.
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
    await supabase.rpc('prune_reminder_sent')
  }

  return json({ sent, removed: stale.length })
})
