import { useState } from 'react'
import {
  ATTENDEES,
  ATTENDEE_EMOJI,
  ATTENDEE_LABEL,
  DAYS,
  PARENT_EMOJI,
  PARENT_LABEL,
  REMINDER_CHOICES,
  REPEAT_CHOICES,
  attendeeLabel,
} from '../types'
import type {
  Attendee,
  CalendarEvent,
  DayKey,
  EventSeries,
  Parent,
  Settings,
  WeekData,
} from '../types'
import {
  dateForDay,
  defaultBedtime,
  formatDayDate,
  fromISODate,
  toISODate,
  uid,
} from '../lib/week'
import { eventsForWeek, occurrenceDate } from '../lib/series'
import { Modal } from './Modal'

interface Props {
  week: WeekData
  series: EventSeries[]
  settings: Settings
  onChange: (mutate: (draft: WeekData) => WeekData) => void
  onSeriesChange: (mutate: (current: EventSeries[]) => EventSeries[]) => void
  onSettingsChange: (patch: Partial<Settings>) => void
}

interface Draft {
  /** id des bearbeiteten Einzeltermins – leer bei einem neuen Termin. */
  id?: string
  /** Gesetzt, wenn der Termin aus einer Serie stammt. */
  seriesId?: string
  /** ISO-Datum des angetippten Serientermins, für „nur dieser Termin“. */
  occurrence?: string
  day: DayKey
  start: string
  end: string
  title: string
  who: Attendee[]
  location: string
  note: string
  remindMinutes: number
  /** 0 = einmalig, sonst der Abstand in Wochen. */
  everyWeeks: number
  /** Letzter Tag der Serie, ISO – leer heißt: läuft weiter. */
  until: string
  /** Bei Serienterminen: gilt die Änderung dem einen Tag oder allen? */
  scope: 'one' | 'all'
}

const emptyDraft = (day: DayKey): Draft => ({
  day,
  start: '16:00',
  end: '',
  title: '',
  who: [],
  location: '',
  note: '',
  remindMinutes: 0,
  everyWeeks: 0,
  until: '',
  scope: 'all',
})

/** Bestehenden Termin in das Formular übernehmen. */
function draftFromEvent(event: CalendarEvent, series: EventSeries[]): Draft {
  const source = event.seriesId ? series.find((s) => s.id === event.seriesId) : undefined
  return {
    id: event.seriesId ? undefined : event.id,
    seriesId: event.seriesId,
    occurrence: event.seriesId ? occurrenceDate(event.id) : undefined,
    day: event.day,
    start: event.start,
    end: event.end ?? '',
    title: event.title,
    who: event.who,
    location: event.location ?? '',
    note: event.note ?? '',
    remindMinutes: event.remindMinutes ?? 0,
    everyWeeks: source?.everyWeeks ?? 0,
    until: source?.until ?? '',
    scope: 'all',
  }
}

export function Schedule({
  week,
  series,
  settings,
  onChange,
  onSeriesChange,
  onSettingsChange,
}: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showSeries, setShowSeries] = useState(false)
  const today = toISODate(new Date())

  const patch = (fields: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...fields } : d))

  const addEvent = (event: CalendarEvent) =>
    onChange((week_) => ({ ...week_, events: [...week_.events, event] }))

  const skipOccurrence = (seriesId: string, date: string) =>
    onSeriesChange((all) =>
      all.map((s) =>
        s.id === seriesId && !s.skipped.includes(date)
          ? { ...s, skipped: [...s.skipped, date] }
          : s,
      ),
    )

  const saveEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft || !draft.title.trim()) return

    const base = {
      day: draft.day,
      start: draft.start,
      end: draft.end || undefined,
      title: draft.title.trim(),
      who: draft.who,
      location: draft.location.trim() || undefined,
      note: draft.note.trim() || undefined,
      remindMinutes: draft.remindMinutes || undefined,
    }

    if (draft.seriesId && draft.scope === 'all') {
      if (draft.everyWeeks === 0) {
        // Aus der Serie wird ein einzelner Termin in dieser Woche.
        onSeriesChange((all) => all.filter((s) => s.id !== draft.seriesId))
        addEvent({ id: uid(), ...base })
      } else {
        onSeriesChange((all) =>
          all.map((s) =>
            s.id === draft.seriesId
              ? { ...s, ...base, everyWeeks: draft.everyWeeks, until: draft.until || undefined }
              : s,
          ),
        )
      }
    } else if (draft.seriesId && draft.occurrence) {
      // Nur dieser eine Tag: aus der Serie ausnehmen, Kopie als Einzeltermin.
      skipOccurrence(draft.seriesId, draft.occurrence)
      addEvent({ id: uid(), ...base })
    } else if (draft.everyWeeks > 0) {
      // Neuer oder bisher einmaliger Termin, der sich künftig wiederholt.
      onSeriesChange((all) => [
        ...all,
        {
          id: uid(),
          ...base,
          everyWeeks: draft.everyWeeks,
          from: week.weekStart,
          until: draft.until || undefined,
          skipped: [],
        },
      ])
      if (draft.id) {
        onChange((week_) => ({ ...week_, events: week_.events.filter((x) => x.id !== draft.id) }))
      }
    } else {
      const event: CalendarEvent = { id: draft.id ?? uid(), ...base }
      onChange((week_) => ({
        ...week_,
        events: draft.id
          ? week_.events.map((x) => (x.id === draft.id ? event : x))
          : [...week_.events, event],
      }))
    }

    setDraft(null)
  }

  const deleteEvent = () => {
    if (!draft) return
    if (draft.seriesId) {
      if (draft.scope === 'all') {
        onSeriesChange((all) => all.filter((s) => s.id !== draft.seriesId))
      } else if (draft.occurrence) {
        skipOccurrence(draft.seriesId, draft.occurrence)
      }
    } else if (draft.id) {
      onChange((week_) => ({ ...week_, events: week_.events.filter((x) => x.id !== draft.id) }))
    }
    setDraft(null)
  }

  const toggleAttendee = (who: Attendee) =>
    setDraft((d) =>
      d
        ? { ...d, who: d.who.includes(who) ? d.who.filter((x) => x !== who) : [...d.who, who] }
        : d,
    )

  const toggleBedtime = (day: DayKey) => {
    onChange((week_) => ({
      ...week_,
      bedtime: { ...week_.bedtime, [day]: week_.bedtime[day] === 'mama' ? 'papa' : 'mama' },
    }))
  }

  const resetBedtime = () => {
    onChange((week_) => ({
      ...week_,
      bedtime: defaultBedtime(week_.weekStart, settings.bedtimeStart),
    }))
  }

  /**
   * Dreht die gesamte Rotation um – dauerhaft, also auch für alle
   * kommenden Wochen. Der tägliche Wechsel bleibt dabei erhalten.
   */
  const swapRotation = () => {
    const flipped: Parent = settings.bedtimeStart === 'mama' ? 'papa' : 'mama'
    onSettingsChange({ bedtimeStart: flipped })
    onChange((week_) => ({ ...week_, bedtime: defaultBedtime(week_.weekStart, flipped) }))
  }

  const counts = DAYS.reduce(
    (acc, d) => {
      acc[week.bedtime[d.key]] += 1
      return acc
    },
    { mama: 0, papa: 0 },
  )

  const allEvents = eventsForWeek(week.events, series, week.weekStart)
  /** Bei „nur dieser Termin“ ist die Wiederholung selbst nicht änderbar. */
  const editsSeries = Boolean(draft?.seriesId) && draft?.scope === 'all'

  return (
    <section>
      <div className="list-toolbar">
        <span className="muted">
          🌙 Bettdienst {settings.bedtimeFrom}–{settings.bedtimeTo} · Mama {counts.mama}× · Papa{' '}
          {counts.papa}×
        </span>
        <div className="toolbar-actions">
          <button className="link-btn" onClick={swapRotation}>
            Rotation tauschen
          </button>
          <button className="link-btn" onClick={resetBedtime}>
            Woche zurücksetzen
          </button>
        </div>
      </div>
      <p className="muted small rotation-hint">
        Der Dienst wechselt täglich und läuft über das Wochenende hinweg weiter – so kommen beide
        über zwei Wochen auf gleich viele Abende. Einzelne Tage lassen sich per Tipp auf das Feld
        tauschen.
      </p>

      <div className="day-grid">
        {DAYS.map((day) => {
          const date = dateForDay(week.weekStart, day.key)
          const isToday = toISODate(date) === today
          const events = allEvents.filter((e) => e.day === day.key)
          const parent = week.bedtime[day.key]
          const weekend = day.key === 'sa' || day.key === 'so'

          return (
            <article
              key={day.key}
              className={`day-card${weekend ? ' weekend' : ''}${isToday ? ' today' : ''}`}
            >
              <header>
                <span className="day-name">{day.long}</span>
                <span className="day-date">{formatDayDate(date)}</span>
              </header>

              <ul className="event-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <button className="event" onClick={() => setDraft(draftFromEvent(event, series))}>
                      <span className="event-time">
                        {event.start}
                        {event.end ? `–${event.end}` : ''}
                      </span>
                      <span className="event-body">
                        <strong>
                          {event.title}
                          {event.seriesId && (
                            <span className="event-flag" title="Serientermin">
                              {' '}
                              🔁
                            </span>
                          )}
                          {event.remindMinutes ? (
                            <span className="event-flag" title="Mit Erinnerung">
                              {' '}
                              🔔
                            </span>
                          ) : null}
                        </strong>
                        {event.location && (
                          <span className="event-place">📍 {event.location}</span>
                        )}
                        <span className="event-meta">
                          {attendeeLabel(event.who)}
                          {event.note ? ` · ${event.note}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {events.length === 0 && <li className="no-events">Keine Termine</li>}
              </ul>

              <button
                className={`bedtime bedtime-${parent}`}
                onClick={() => toggleBedtime(day.key)}
                title="Tippen, um zwischen Mama und Papa zu wechseln"
              >
                <span className="event-time">
                  {settings.bedtimeFrom}–{settings.bedtimeTo}
                </span>
                <span className="bedtime-body">
                  🌙 Bettdienst: {PARENT_EMOJI[parent]} <strong>{PARENT_LABEL[parent]}</strong>
                </span>
              </button>

              <button className="link-btn add-event" onClick={() => setDraft(emptyDraft(day.key))}>
                + Termin
              </button>
            </article>
          )
        })}
      </div>

      {series.length > 0 && (
        <div className="series-box">
          <button className="link-btn" onClick={() => setShowSeries((v) => !v)}>
            🔁 {series.length} {series.length === 1 ? 'Serientermin' : 'Serientermine'}{' '}
            {showSeries ? '▴' : '▾'}
          </button>
          {showSeries && (
            <ul className="series-list">
              {series.map((s) => {
                const day = DAYS.find((d) => d.key === s.day)
                const repeat =
                  REPEAT_CHOICES.find((r) => r.weeks === s.everyWeeks)?.label ??
                  `Alle ${s.everyWeeks} Wochen`
                return (
                  <li key={s.id}>
                    <span>
                      <strong>{s.title}</strong> · {day?.long} {s.start} · {repeat.toLowerCase()}
                      {s.until && ` · bis ${formatDayDate(fromISODate(s.until))}`}
                    </span>
                    <button
                      className="link-btn"
                      onClick={() =>
                        onSeriesChange((all) => all.filter((entry) => entry.id !== s.id))
                      }
                    >
                      Serie beenden
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {draft && (
        <Modal
          title={draft.id || draft.seriesId ? 'Termin bearbeiten' : 'Neuer Termin'}
          onClose={() => setDraft(null)}
          footer={
            draft.id || draft.seriesId ? (
              <button className="danger-btn" onClick={deleteEvent}>
                {draft.seriesId && draft.scope === 'all' ? 'Ganze Serie löschen' : 'Löschen'}
              </button>
            ) : undefined
          }
        >
          <form className="form" onSubmit={saveEvent}>
            {draft.seriesId && (
              <fieldset className="choice-group">
                <legend>Dieser Termin gehört zu einer Serie</legend>
                <div className="chip-choice">
                  <label className={draft.scope === 'all' ? 'chip-toggle on' : 'chip-toggle'}>
                    <input
                      type="radio"
                      name="scope"
                      checked={draft.scope === 'all'}
                      onChange={() => patch({ scope: 'all' })}
                    />
                    Ganze Serie
                  </label>
                  <label className={draft.scope === 'one' ? 'chip-toggle on' : 'chip-toggle'}>
                    <input
                      type="radio"
                      name="scope"
                      checked={draft.scope === 'one'}
                      onChange={() => patch({ scope: 'one' })}
                    />
                    Nur dieser Termin
                  </label>
                </div>
              </fieldset>
            )}

            <label>
              Was?
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="z. B. Turnen, Elternabend, Zahnarzt"
                required
              />
            </label>

            <label>
              Wo? (optional)
              <input
                value={draft.location}
                onChange={(e) => patch({ location: e.target.value })}
                placeholder="z. B. Turnhalle Grundschule"
              />
            </label>

            <label>
              Tag
              <select value={draft.day} onChange={(e) => patch({ day: e.target.value as DayKey })}>
                {DAYS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.long}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-row">
              <label>
                Von
                <input
                  type="time"
                  value={draft.start}
                  onChange={(e) => patch({ start: e.target.value })}
                  required
                />
              </label>
              <label>
                Bis (optional)
                <input
                  type="time"
                  value={draft.end}
                  onChange={(e) => patch({ end: e.target.value })}
                />
              </label>
            </div>

            <fieldset className="choice-group">
              <legend>Wer ist dabei?</legend>
              <div className="chip-choice">
                {ATTENDEES.map((a) => (
                  <label
                    key={a}
                    className={draft.who.includes(a) ? 'chip-toggle on' : 'chip-toggle'}
                  >
                    <input
                      type="checkbox"
                      checked={draft.who.includes(a)}
                      onChange={() => toggleAttendee(a)}
                    />
                    {ATTENDEE_EMOJI[a]} {ATTENDEE_LABEL[a]}
                  </label>
                ))}
              </div>
              <p className="muted small">Nichts ausgewählt heißt: alle sind dabei.</p>
            </fieldset>

            {draft.scope === 'all' && (
              <label>
                Wiederholung
                <select
                  value={draft.everyWeeks}
                  onChange={(e) => patch({ everyWeeks: Number(e.target.value) })}
                >
                  <option value={0}>Einmalig</option>
                  {REPEAT_CHOICES.map((r) => (
                    <option key={r.weeks} value={r.weeks}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {draft.scope === 'all' && draft.everyWeeks > 0 && (
              <label>
                Läuft bis (optional)
                <input
                  type="date"
                  value={draft.until}
                  min={week.weekStart}
                  onChange={(e) => patch({ until: e.target.value })}
                />
              </label>
            )}

            {editsSeries && draft.everyWeeks > 0 && (
              <p className="muted small">
                Die Änderung gilt für alle Termine dieser Serie – auch für die kommenden Wochen.
              </p>
            )}

            <label>
              Erinnerung
              <select
                value={draft.remindMinutes}
                onChange={(e) => patch({ remindMinutes: Number(e.target.value) })}
              >
                {REMINDER_CHOICES.map((r) => (
                  <option key={r.minutes} value={r.minutes}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Notiz (optional)
              <input
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder="Turnbeutel einpacken"
              />
            </label>

            <button className="primary-btn" type="submit">
              Speichern
            </button>
          </form>
        </Modal>
      )}
    </section>
  )
}
