import { useMemo, useState } from 'react'
import { fromISODate, isoWeekNumber, toISODate } from '../../lib/week'
import { formatMonthYear, isSameMonth, monthGridDays, weekStartOf } from '../../lib/calendar'

interface Props {
  /** Ausgewählter Tag, ISO. */
  selected: string
  onSelect: (isoDate: string) => void
  /** Tage mit Einträgen bekommen einen Punkt. */
  hasEntries?: (isoDate: string) => boolean
  /** Die Woche, die die große Ansicht gerade zeigt, wird hinterlegt. */
  highlightWeek?: string | null
}

const WEEKDAYS = ['M', 'D', 'M', 'D', 'F', 'S', 'S']

/**
 * Der kleine Monatskalender der Seitenleiste: zum Springen und als
 * Überblick, wo überhaupt etwas los ist.
 */
export function MiniMonth({ selected, onSelect, hasEntries, highlightWeek }: Props) {
  // Der angezeigte Monat folgt der Auswahl, lässt sich aber unabhängig blättern.
  const [month, setMonth] = useState(selected)
  const [pinned, setPinned] = useState(selected)
  if (pinned !== selected) {
    setPinned(selected)
    setMonth(selected)
  }

  const days = useMemo(() => monthGridDays(month), [month])
  const today = toISODate(new Date())
  const weeks = useMemo(() => {
    const rows: string[][] = []
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))
    return rows
  }, [days])

  const shiftMonth = (direction: number) => {
    const date = fromISODate(month)
    setMonth(toISODate(new Date(date.getFullYear(), date.getMonth() + direction, 1)))
  }

  return (
    <div className="mini">
      <div className="mini-head">
        <strong>{formatMonthYear(month)}</strong>
        <span className="mini-nav">
          <button
            className="icon-btn small"
            onClick={() => shiftMonth(-1)}
            aria-label="Voriger Monat"
          >
            ↑
          </button>
          <button
            className="icon-btn small"
            onClick={() => shiftMonth(1)}
            aria-label="Nächster Monat"
          >
            ↓
          </button>
        </span>
      </div>

      <table className="mini-grid">
        <thead>
          <tr>
            <th aria-label="Kalenderwoche" />
            {WEEKDAYS.map((d, i) => (
              <th key={i} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((row) => (
            <tr
              key={row[0]}
              className={highlightWeek && weekStartOf(row[0]) === highlightWeek ? 'on' : undefined}
            >
              <th scope="row" className="mini-week">
                {isoWeekNumber(fromISODate(row[0]))}
              </th>
              {row.map((date) => {
                const classes = ['mini-day']
                if (!isSameMonth(date, month)) classes.push('outside')
                if (date === today) classes.push('today')
                if (date === selected) classes.push('selected')
                if (hasEntries?.(date)) classes.push('marked')
                return (
                  <td key={date}>
                    <button
                      className={classes.join(' ')}
                      onClick={() => onSelect(date)}
                      aria-current={date === selected ? 'date' : undefined}
                    >
                      {Number(date.slice(8, 10))}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
