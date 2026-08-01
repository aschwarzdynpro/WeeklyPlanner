import type { EventSpan, Person } from '../../types'
import { attendeeLabel } from '../../types'
import { fromISODate, toISODate } from '../../lib/week'
import type { Occurrence } from '../../lib/calendar'

interface Props {
  days: string[]
  people: Person[]
  occurrencesOn: (isoDate: string) => Occurrence[]
  spansOn: (isoDate: string) => EventSpan[]
  bedtimeOn: (isoDate: string) => Person | undefined
  onOpen: (occurrence: Occurrence) => void
  onOpenSpan: (span: EventSpan) => void
}

function colorOf(who: string[], people: Person[]): string | undefined {
  return people.find((p) => who.includes(p.id))?.color
}

/**
 * Die Agenda: alles Anstehende als eine Liste, ohne leere Stunden
 * dazwischen. Tage ohne Eintrag fallen ganz heraus — auf dem Handy ist das
 * die Ansicht, die am schnellsten die Frage „was ist heute noch?“ beantwortet.
 */
export function AgendaList({
  days,
  people,
  occurrencesOn,
  spansOn,
  bedtimeOn,
  onOpen,
  onOpenSpan,
}: Props) {
  const today = toISODate(new Date())
  const filled = days
    .map((date) => ({ date, events: occurrencesOn(date), spans: spansOn(date) }))
    .filter((day) => day.events.length > 0 || day.spans.length > 0)

  if (filled.length === 0) {
    return <p className="muted agenda-empty">In den nächsten vier Wochen steht nichts an.</p>
  }

  return (
    <div className="agenda">
      {filled.map(({ date, events, spans }) => {
        const onDuty = bedtimeOn(date)
        return (
          <section key={date} className={`agenda-day${date === today ? ' today' : ''}`}>
            <header>
              <span className="agenda-date">
                {fromISODate(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              </span>
              <span className="agenda-weekday">
                {date === today
                  ? 'Heute'
                  : fromISODate(date).toLocaleDateString('de-DE', { weekday: 'long' })}
              </span>
            </header>

            <ul>
              {spans.map((span) => (
                <li key={span.id}>
                  <button className="agenda-row" onClick={() => onOpenSpan(span)}>
                    <span className="agenda-time">ganztägig</span>
                    <span
                      className="agenda-bar"
                      style={{ background: colorOf(span.who, people) ?? '#8a8079' }}
                    />
                    <span className="agenda-body">
                      <strong>
                        {span.emoji} {span.title}
                      </strong>
                      <span className="agenda-meta">{attendeeLabel(span.who, people)}</span>
                    </span>
                  </button>
                </li>
              ))}

              {events.map((occurrence) => {
                const { event } = occurrence
                return (
                  <li key={event.id}>
                    <button className="agenda-row" onClick={() => onOpen(occurrence)}>
                      <span className="agenda-time">
                        {event.start}
                        {event.end ? `–${event.end}` : ''}
                      </span>
                      <span
                        className="agenda-bar"
                        style={{ background: colorOf(event.who, people) ?? 'var(--accent)' }}
                      />
                      <span className="agenda-body">
                        <strong>
                          {event.title}
                          {event.seriesId && ' 🔁'}
                          {event.remindMinutes ? ' 🔔' : ''}
                        </strong>
                        <span className="agenda-meta">
                          {attendeeLabel(event.who, people)}
                          {event.location && ` · 📍 ${event.location}`}
                          {event.note && ` · ${event.note}`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}

              {onDuty && (
                <li>
                  <div className="agenda-row muted">
                    <span className="agenda-time">Bettdienst</span>
                    <span className="agenda-bar" style={{ background: onDuty.color }} />
                    <span className="agenda-body">
                      🌙 {onDuty.emoji} {onDuty.name}
                    </span>
                  </div>
                </li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
