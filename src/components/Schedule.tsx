import { useState } from 'react'
import {
  DAYS,
  REMINDER_CHOICES,
  REPEAT_CHOICES,
  SPAN_PRESETS,
  attendeeLabel,
  bedtimeRotation,
} from '../types'
import type {
  CalendarEvent,
  DayKey,
  EventSeries,
  EventSpan,
  Person,
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
import { formatSpanRange, spanCoversDay, spansForWeek } from '../lib/spans'
import { Modal } from './Modal'

interface Props {
  week: WeekData
  series: EventSeries[]
  spans: EventSpan[]
  settings: Settings
  onChange: (mutate: (draft: WeekData) => WeekData) => void
  onSeriesChange: (mutate: (current: EventSeries[]) => EventSeries[]) => void
  onSpansChange: (mutate: (current: EventSpan[]) => EventSpan[]) => void
  onSettingsChange: (patch: Partial<Settings>) => void
}

/** Zeitraum im Formular; `id` fehlt, solange er neu ist. */
interface SpanDraft {
  id?: string
  title: string
  emoji: string
  from: string
  until: string
  who: string[]
  note: string
}

/** Farbe eines Zeitraums: die der ersten beteiligten Person, sonst neutral. */
function spanColor(span: EventSpan, people: Person[]): string {
  return people.find((p) => span.who.includes(p.id))?.color ?? '#8a8079'
}

/** Die Teilnehmerauswahl steht im Termin- wie im Zeitraum-Formular. */
function AttendeePicker({
  people,
  who,
  onToggle,
}: {
  people: Person[]
  who: string[]
  onToggle: (id: string) => void
}) {
  return (
    <fieldset className="choice-group">
      <legend>Wer ist dabei?</legend>
      <div className="chip-choice">
        {people.map((person) => (
          <label
            key={person.id}
            className={who.includes(person.id) ? 'chip-toggle on' : 'chip-toggle'}
            style={
              who.includes(person.id)
                ? { borderColor: person.color, background: `${person.color}26` }
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={who.includes(person.id)}
              onChange={() => onToggle(person.id)}
            />
            {person.emoji} {person.name}
          </label>
        ))}
      </div>
      <p className="muted small">Nichts ausgewählt heißt: alle sind dabei.</p>
    </fieldset>
  )
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
  who: string[]
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
  spans,
  settings,
  onChange,
  onSeriesChange,
  onSpansChange,
  onSettingsChange,
}: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [spanDraft, setSpanDraft] = useState<SpanDraft | null>(null)
  const [showSeries, setShowSeries] = useState(false)
  const today = toISODate(new Date())
  const people = settings.people
  const rotation = bedtimeRotation(people)

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

  // --- Zeiträume -------------------------------------------------------------

  const saveSpan = (e: React.FormEvent) => {
    e.preventDefault()
    if (!spanDraft || !spanDraft.title.trim()) return
    const span: EventSpan = {
      id: spanDraft.id ?? uid(),
      title: spanDraft.title.trim(),
      emoji: spanDraft.emoji.trim() || '🏖️',
      // Wer das Ende vor den Anfang legt, meint offensichtlich den Tag selbst.
      from: spanDraft.from <= spanDraft.until ? spanDraft.from : spanDraft.until,
      until: spanDraft.from <= spanDraft.until ? spanDraft.until : spanDraft.from,
      who: spanDraft.who,
      note: spanDraft.note.trim() || undefined,
    }
    onSpansChange((all) =>
      spanDraft.id ? all.map((x) => (x.id === spanDraft.id ? span : x)) : [...all, span],
    )
    setSpanDraft(null)
  }

  const deleteSpan = () => {
    if (spanDraft?.id) onSpansChange((all) => all.filter((x) => x.id !== spanDraft.id))
    setSpanDraft(null)
  }

  const toggleSpanAttendee = (who: string) =>
    setSpanDraft((d) =>
      d
        ? { ...d, who: d.who.includes(who) ? d.who.filter((x) => x !== who) : [...d.who, who] }
        : d,
    )

  const toggleAttendee = (who: string) =>
    setDraft((d) =>
      d
        ? { ...d, who: d.who.includes(who) ? d.who.filter((x) => x !== who) : [...d.who, who] }
        : d,
    )

  /** Ein Tipp auf das Feld reicht den Dienst an die nächste Person weiter. */
  const nextOnDuty = (day: DayKey) => {
    if (rotation.length === 0) return
    onChange((week_) => {
      const current = rotation.findIndex((p) => p.id === week_.bedtime[day])
      const next = rotation[(current + 1) % rotation.length]
      return { ...week_, bedtime: { ...week_.bedtime, [day]: next.id } }
    })
  }

  const resetBedtime = () => {
    onChange((week_) => ({
      ...week_,
      bedtime: defaultBedtime(week_.weekStart, settings.bedtimeStart, settings.people),
    }))
  }

  /**
   * Verschiebt die Rotation um eine Person – dauerhaft, also auch für alle
   * kommenden Wochen. Der tägliche Wechsel bleibt dabei erhalten. Bei zwei
   * Personen ist das genau der Tausch von vorher.
   */
  const advanceRotation = () => {
    if (rotation.length === 0) return
    const current = rotation.findIndex((p) => p.id === settings.bedtimeStart)
    const next = rotation[(current + 1) % rotation.length].id
    onSettingsChange({ bedtimeStart: next })
    onChange((week_) => ({
      ...week_,
      bedtime: defaultBedtime(week_.weekStart, next, settings.people),
    }))
  }

  const counts = rotation.map((person) => ({
    person,
    days: DAYS.filter((d) => week.bedtime[d.key] === person.id).length,
  }))

  const allEvents = eventsForWeek(week.events, series, week.weekStart)
  const weekSpans = spansForWeek(spans, week.weekStart)
  /** Bei „nur dieser Termin“ ist die Wiederholung selbst nicht änderbar. */
  const editsSeries = Boolean(draft?.seriesId) && draft?.scope === 'all'

  return (
    <section>
      {rotation.length > 0 && (
        <>
          <div className="list-toolbar">
            <span className="muted">
              🌙 Bettdienst {settings.bedtimeFrom}–{settings.bedtimeTo}
              {counts.map((c) => ` · ${c.person.name} ${c.days}×`)}
            </span>
            <div className="toolbar-actions">
              {rotation.length > 1 && (
                <button className="link-btn" onClick={advanceRotation}>
                  Rotation verschieben
                </button>
              )}
              <button className="link-btn" onClick={resetBedtime}>
                Woche zurücksetzen
              </button>
            </div>
          </div>
          <p className="muted small rotation-hint">
            Der Dienst wechselt täglich und läuft über das Wochenende hinweg weiter – so kommen
            {rotation.length === 2 ? ' beide über zwei Wochen ' : ` alle über ${rotation.length} Wochen `}
            auf gleich viele Abende. Einzelne Tage lassen sich per Tipp auf das Feld weiterreichen.
          </p>
        </>
      )}

      <div className="span-bar">
        {weekSpans.map((span) => (
          <button
            key={span.id}
            className="span-chip"
            style={{ borderColor: `${spanColor(span, people)}66` }}
            onClick={() =>
              setSpanDraft({
                id: span.id,
                title: span.title,
                emoji: span.emoji,
                from: span.from,
                until: span.until,
                who: span.who,
                note: span.note ?? '',
              })
            }
          >
            <span aria-hidden="true">{span.emoji}</span>
            <strong>{span.title}</strong>
            <span className="span-range">
              {formatSpanRange(span)}
              {span.who.length > 0 && ` · ${attendeeLabel(span.who, people)}`}
            </span>
          </button>
        ))}
        <button
          className="link-btn"
          onClick={() =>
            setSpanDraft({
              title: '',
              emoji: '🏖️',
              from: toISODate(dateForDay(week.weekStart, 'mo')),
              until: toISODate(dateForDay(week.weekStart, 'so')),
              who: [],
              note: '',
            })
          }
        >
          + Zeitraum
        </button>
      </div>

      <div className="day-grid">
        {DAYS.map((day) => {
          const date = dateForDay(week.weekStart, day.key)
          const isToday = toISODate(date) === today
          const events = allEvents.filter((e) => e.day === day.key)
          const onDuty = rotation.find((p) => p.id === week.bedtime[day.key])
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

              {weekSpans
                .filter((span) => spanCoversDay(span, toISODate(date)))
                .map((span) => (
                  <div key={span.id} className="day-span">
                    <span aria-hidden="true">{span.emoji}</span> {span.title}
                    {span.who.length > 0 && (
                      <span className="muted"> · {attendeeLabel(span.who, people)}</span>
                    )}
                  </div>
                ))}

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
                          {attendeeLabel(event.who, people)}
                          {event.note ? ` · ${event.note}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {events.length === 0 && <li className="no-events">Keine Termine</li>}
              </ul>

              {onDuty && (
                <button
                  className="bedtime"
                  style={{ borderColor: onDuty.color, background: `${onDuty.color}26` }}
                  onClick={() => nextOnDuty(day.key)}
                  title="Tippen, um den Dienst weiterzureichen"
                >
                  <span className="event-time">
                    {settings.bedtimeFrom}–{settings.bedtimeTo}
                  </span>
                  <span className="bedtime-body">
                    🌙 Bettdienst: {onDuty.emoji} <strong>{onDuty.name}</strong>
                  </span>
                </button>
              )}

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

            <AttendeePicker people={people} who={draft.who} onToggle={toggleAttendee} />

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

      {spanDraft && (
        <Modal
          title={spanDraft.id ? 'Zeitraum bearbeiten' : 'Neuer Zeitraum'}
          onClose={() => setSpanDraft(null)}
          footer={
            spanDraft.id ? (
              <button className="danger-btn" onClick={deleteSpan}>
                Löschen
              </button>
            ) : undefined
          }
        >
          <form className="form" onSubmit={saveSpan}>
            <div className="chip-choice">
              {SPAN_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  className="chip-toggle"
                  onClick={() =>
                    setSpanDraft((d) =>
                      d ? { ...d, emoji: preset.emoji, title: preset.title } : d,
                    )
                  }
                >
                  {preset.emoji} {preset.title}
                </button>
              ))}
            </div>

            <div className="form-row">
              <label className="span-emoji-field">
                Zeichen
                <input
                  value={spanDraft.emoji}
                  onChange={(e) =>
                    setSpanDraft((d) => (d ? { ...d, emoji: e.target.value.slice(0, 4) } : d))
                  }
                />
              </label>
              <label>
                Was?
                <input
                  autoFocus
                  value={spanDraft.title}
                  onChange={(e) => setSpanDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                  placeholder="z. B. Urlaub, Kita zu"
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Von
                <input
                  type="date"
                  value={spanDraft.from}
                  onChange={(e) => setSpanDraft((d) => (d ? { ...d, from: e.target.value } : d))}
                  required
                />
              </label>
              <label>
                Bis
                <input
                  type="date"
                  value={spanDraft.until}
                  min={spanDraft.from}
                  onChange={(e) => setSpanDraft((d) => (d ? { ...d, until: e.target.value } : d))}
                  required
                />
              </label>
            </div>

            <AttendeePicker
              people={people}
              who={spanDraft.who}
              onToggle={toggleSpanAttendee}
            />

            <label>
              Notiz (optional)
              <input
                value={spanDraft.note}
                onChange={(e) => setSpanDraft((d) => (d ? { ...d, note: e.target.value } : d))}
                placeholder="Schlüssel bei den Nachbarn"
              />
            </label>

            <p className="muted small">
              Zeiträume haben keine Uhrzeit und dürfen über Wochen hinausgehen — sie erscheinen in
              jeder Woche, die sie berühren.
            </p>

            <button className="primary-btn" type="submit">
              Speichern
            </button>
          </form>
        </Modal>
      )}
    </section>
  )
}
