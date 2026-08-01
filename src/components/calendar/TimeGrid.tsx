import { useEffect, useRef, useState } from 'react'
import type { EventSpan, Person, Settings } from '../../types'
import { attendeeLabel } from '../../types'
import { fromISODate, toISODate } from '../../lib/week'
import { eventSpanMinutes, formatMinutes, layoutDay, minutesOf } from '../../lib/calendar'
import type { Occurrence } from '../../lib/calendar'

interface Props {
  days: string[]
  people: Person[]
  settings: Settings
  occurrencesOn: (isoDate: string) => Occurrence[]
  spansOn: (isoDate: string) => EventSpan[]
  bedtimeOn: (isoDate: string) => Person | undefined
  onBedtime: (isoDate: string) => void
  onNew: (isoDate: string, minutes: number) => void
  onOpen: (occurrence: Occurrence) => void
  onOpenSpan: (span: EventSpan) => void
  onPickDay: (isoDate: string) => void
}

/** Höhe einer Stunde in Pixeln – bestimmt zugleich die Genauigkeit der Anzeige. */
const HOUR_HEIGHT = 48
const PX_PER_MINUTE = HOUR_HEIGHT / 60
/** Beim Öffnen wird hierhin gescrollt; davor ist selten etwas los. */
const SCROLL_TO_HOUR = 7
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function colorOf(who: string[], people: Person[]): string | undefined {
  return people.find((p) => who.includes(p.id))?.color
}

/**
 * Das Zeitraster für Tag, Arbeitswoche und Woche: links die Stunden, oben
 * die Ganztags-Zeile, darunter die Termine an ihrem Platz. Was sich
 * überschneidet, teilt sich die Spaltenbreite.
 */
export function TimeGrid({
  days,
  people,
  settings,
  occurrencesOn,
  spansOn,
  bedtimeOn,
  onBedtime,
  onNew,
  onOpen,
  onOpenSpan,
  onPickDay,
}: Props) {
  const body = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => new Date())
  const today = toISODate(now)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (body.current) body.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT
  }, [])

  const columns = { '--cols': days.length } as React.CSSProperties
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const bedtimeStart = minutesOf(settings.bedtimeFrom)
  const bedtimeEnd = Math.max(minutesOf(settings.bedtimeTo), bedtimeStart + 30)

  /** Klick auf freie Fläche: Uhrzeit aus der Position, auf halbe Stunden gerundet. */
  const pickTime = (e: React.MouseEvent<HTMLDivElement>, date: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const minutes = (e.clientY - rect.top) / PX_PER_MINUTE
    onNew(date, Math.max(0, Math.min(23 * 60 + 30, Math.round(minutes / 30) * 30)))
  }

  return (
    <div className="tg" style={columns}>
      <div className="tg-head">
        <div className="tg-corner" />
        {days.map((date) => {
          const d = fromISODate(date)
          return (
            <button
              key={date}
              className={`tg-dayhead${date === today ? ' today' : ''}`}
              onClick={() => onPickDay(date)}
              title="Diesen Tag einzeln zeigen"
            >
              <span className="tg-weekday">
                {d.toLocaleDateString('de-DE', { weekday: 'short' })}
              </span>
              <span className="tg-daynum">{Number(date.slice(8, 10))}</span>
            </button>
          )
        })}
      </div>

      <div className="tg-allday">
        <div className="tg-gutter-label">ganztägig</div>
        {days.map((date) => (
          <div key={date} className={`tg-allday-cell${date === today ? ' today' : ''}`}>
            {spansOn(date).map((span) => (
              <button
                key={span.id}
                className="tg-span"
                style={{ borderLeftColor: colorOf(span.who, people) ?? 'var(--accent)' }}
                onClick={() => onOpenSpan(span)}
              >
                <span aria-hidden="true">{span.emoji}</span> {span.title}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="tg-body" ref={body}>
        <div className="tg-hours">
          {HOURS.map((h) => (
            <div key={h} className="tg-hour" style={{ height: HOUR_HEIGHT }}>
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>

        {days.map((date) => {
          const positioned = layoutDay(occurrencesOn(date), (o) => eventSpanMinutes(o.event))
          const onDuty = bedtimeOn(date)
          return (
            <div
              key={date}
              className={`tg-col${date === today ? ' today' : ''}`}
              onClick={(e) => pickTime(e, date)}
            >
              {HOURS.map((h) => (
                <div key={h} className="tg-slot" style={{ height: HOUR_HEIGHT }} />
              ))}

              {onDuty && (
                <button
                  className="tg-bedtime"
                  style={{
                    top: bedtimeStart * PX_PER_MINUTE,
                    height: (bedtimeEnd - bedtimeStart) * PX_PER_MINUTE,
                    borderColor: onDuty.color,
                    background: `${onDuty.color}1f`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onBedtime(date)
                  }}
                  title="Tippen, um den Bettdienst weiterzureichen"
                >
                  🌙 {onDuty.name}
                </button>
              )}

              {positioned.map(({ item, start, end, column, columns: count }) => {
                const color = colorOf(item.event.who, people) ?? 'var(--accent)'
                const short = end - start <= 45
                return (
                  <button
                    key={item.event.id}
                    className={`tg-event${short ? ' short' : ''}`}
                    style={{
                      top: start * PX_PER_MINUTE,
                      height: (end - start) * PX_PER_MINUTE - 2,
                      left: `calc(${(column / count) * 100}% + 2px)`,
                      width: `calc(${100 / count}% - 6px)`,
                      borderLeftColor: color,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(item)
                    }}
                    title={`${item.event.title} · ${attendeeLabel(item.event.who, people)}`}
                  >
                    {/* In einem flachen Balken ist der Titel wichtiger als die
                        Uhrzeit – die steht dann hinten und darf abgeschnitten werden. */}
                    {!short && (
                      <span className="tg-event-time">
                        {item.event.start}
                        {item.event.end ? `–${item.event.end}` : ''}
                      </span>
                    )}
                    <span className="tg-event-title">
                      {item.event.title}
                      {item.event.seriesId && <span className="tg-flag"> 🔁</span>}
                      {item.event.remindMinutes ? <span className="tg-flag"> 🔔</span> : null}
                    </span>
                    {short && <span className="tg-event-time">{item.event.start}</span>}
                    {!short && item.event.location && (
                      <span className="tg-event-place">📍 {item.event.location}</span>
                    )}
                  </button>
                )
              })}

              {date === today && (
                <div className="tg-now" style={{ top: nowMinutes * PX_PER_MINUTE }}>
                  <span className="tg-now-dot" />
                  <span className="tg-now-label">{formatMinutes(nowMinutes)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
