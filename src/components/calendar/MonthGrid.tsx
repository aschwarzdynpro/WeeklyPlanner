import type { EventSpan, Person } from '../../types'
import { fromISODate, toISODate } from '../../lib/week'
import { isSameMonth } from '../../lib/calendar'
import type { Occurrence } from '../../lib/calendar'

interface Props {
  /** 42 Tage, immer ganze Wochen ab Montag. */
  days: string[]
  /** Monat, der als „im Monat“ gilt; die übrigen Tage werden blass. */
  anchor: string
  people: Person[]
  occurrencesOn: (isoDate: string) => Occurrence[]
  spansOn: (isoDate: string) => EventSpan[]
  bedtimeOn: (isoDate: string) => Person | undefined
  onNew: (isoDate: string) => void
  onOpen: (occurrence: Occurrence) => void
  onOpenSpan: (span: EventSpan) => void
  onPickDay: (isoDate: string) => void
}

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

/** Mehr passt nicht in eine Zelle; der Rest steht unter „+n weitere“. */
const MAX_CHIPS = 3

function colorOf(who: string[], people: Person[]): string | undefined {
  return people.find((p) => who.includes(p.id))?.color
}

export function MonthGrid({
  days,
  anchor,
  people,
  occurrencesOn,
  spansOn,
  bedtimeOn,
  onNew,
  onOpen,
  onOpenSpan,
  onPickDay,
}: Props) {
  const today = toISODate(new Date())

  return (
    <div className="mg">
      <div className="mg-head">
        {WEEKDAYS.map((label) => (
          <div key={label} className="mg-weekday">
            <span className="mg-weekday-long">{label}</span>
            <span className="mg-weekday-short">{label.slice(0, 2)}</span>
          </div>
        ))}
      </div>

      <div className="mg-grid">
        {days.map((date) => {
          const events = occurrencesOn(date)
          const spans = spansOn(date)
          const onDuty = bedtimeOn(date)
          const day = Number(date.slice(8, 10))
          const classes = ['mg-cell']
          if (!isSameMonth(date, anchor)) classes.push('outside')
          if (date === today) classes.push('today')
          const weekday = fromISODate(date).getDay()
          if (weekday === 0 || weekday === 6) classes.push('weekend')

          return (
            <div key={date} className={classes.join(' ')} onDoubleClick={() => onNew(date)}>
              <div className="mg-cell-head">
                <button className="mg-daynum" onClick={() => onPickDay(date)} title="Tag zeigen">
                  {/* Der Monatswechsel ist die einzige Stelle, an der die Zahl allein nicht reicht. */}
                  {day === 1
                    ? fromISODate(date).toLocaleDateString('de-DE', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : day}
                </button>
                <button
                  className="mg-add"
                  onClick={() => onNew(date)}
                  aria-label={`Termin am ${date} anlegen`}
                >
                  +
                </button>
              </div>

              {spans.map((span) => (
                <button
                  key={span.id}
                  className="mg-span"
                  style={{ background: `${colorOf(span.who, people) ?? '#8a8079'}26` }}
                  onClick={() => onOpenSpan(span)}
                >
                  <span aria-hidden="true">{span.emoji}</span> {span.title}
                </button>
              ))}

              {events.slice(0, MAX_CHIPS).map(({ event, ...rest }) => (
                <button
                  key={event.id}
                  className="mg-chip"
                  onClick={() => onOpen({ event, ...rest })}
                >
                  <span
                    className="mg-dot"
                    style={{ background: colorOf(event.who, people) ?? 'var(--accent)' }}
                  />
                  <span className="mg-chip-time">{event.start}</span>
                  <span className="mg-chip-title">{event.title}</span>
                </button>
              ))}

              {events.length > MAX_CHIPS && (
                <button className="mg-more" onClick={() => onPickDay(date)}>
                  +{events.length - MAX_CHIPS} weitere
                </button>
              )}

              {onDuty && (
                <div className="mg-bedtime" title={`Bettdienst: ${onDuty.name}`}>
                  <span className="mg-dot" style={{ background: onDuty.color }} />
                  🌙 {onDuty.name}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
