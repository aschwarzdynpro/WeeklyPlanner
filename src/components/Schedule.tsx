import { useState } from 'react'
import { DAYS, PARENT_EMOJI, PARENT_LABEL, WHO_LABEL } from '../types'
import type { CalendarEvent, DayKey, Parent, Settings, WeekData } from '../types'
import { dateForDay, defaultBedtime, formatDayDate, toISODate, uid } from '../lib/week'
import { Modal } from './Modal'

interface Props {
  week: WeekData
  settings: Settings
  onChange: (mutate: (draft: WeekData) => WeekData) => void
  onSettingsChange: (patch: Partial<Settings>) => void
}

type Draft = Omit<CalendarEvent, 'id'> & { id?: string }

const emptyDraft = (day: DayKey): Draft => ({
  day,
  start: '16:00',
  end: '',
  title: '',
  who: 'alle',
  note: '',
})

export function Schedule({ week, settings, onChange, onSettingsChange }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const today = toISODate(new Date())

  const saveEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft || !draft.title.trim()) return
    const event: CalendarEvent = {
      id: draft.id ?? uid(),
      day: draft.day,
      start: draft.start,
      end: draft.end || undefined,
      title: draft.title.trim(),
      who: draft.who,
      note: draft.note?.trim() || undefined,
    }
    onChange((week_) => ({
      ...week_,
      events: draft.id
        ? week_.events.map((x) => (x.id === draft.id ? event : x))
        : [...week_.events, event],
    }))
    setDraft(null)
  }

  const deleteEvent = (id: string) => {
    onChange((week_) => ({ ...week_, events: week_.events.filter((x) => x.id !== id) }))
    setDraft(null)
  }

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
          const events = week.events
            .filter((e) => e.day === day.key)
            .sort((a, b) => a.start.localeCompare(b.start))
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
                    <button className="event" onClick={() => setDraft({ ...event })}>
                      <span className="event-time">
                        {event.start}
                        {event.end ? `–${event.end}` : ''}
                      </span>
                      <span className="event-body">
                        <strong>{event.title}</strong>
                        <span className="event-meta">
                          {WHO_LABEL[event.who]}
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

      {draft && (
        <Modal
          title={draft.id ? 'Termin bearbeiten' : 'Neuer Termin'}
          onClose={() => setDraft(null)}
          footer={
            draft.id ? (
              <button className="danger-btn" onClick={() => deleteEvent(draft.id!)}>
                Löschen
              </button>
            ) : undefined
          }
        >
          <form className="form" onSubmit={saveEvent}>
            <label>
              Was?
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="z. B. Turnen, Elternabend, Zahnarzt"
                required
              />
            </label>

            <label>
              Tag
              <select
                value={draft.day}
                onChange={(e) => setDraft({ ...draft, day: e.target.value as DayKey })}
              >
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
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  required
                />
              </label>
              <label>
                Bis (optional)
                <input
                  type="time"
                  value={draft.end ?? ''}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </label>
            </div>

            <label>
              Wer?
              <select
                value={draft.who}
                onChange={(e) =>
                  setDraft({ ...draft, who: e.target.value as CalendarEvent['who'] })
                }
              >
                {(['alle', 'mama', 'papa', 'kind'] as const).map((w) => (
                  <option key={w} value={w}>
                    {WHO_LABEL[w]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Notiz (optional)
              <input
                value={draft.note ?? ''}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
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
