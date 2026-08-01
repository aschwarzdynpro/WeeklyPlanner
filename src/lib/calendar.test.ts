import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../types'
import type { EventSeries, WeekData } from '../types'
import { emptyWeek } from './week'
import {
  dayKeyOf,
  daysForView,
  eventSpanMinutes,
  layoutDay,
  matchesPeople,
  minutesOf,
  monthGridDays,
  occurrencesOn,
  stepForView,
  weekStartOf,
  weekStartsBetween,
} from './calendar'

describe('weekStartOf / dayKeyOf', () => {
  it('findet den Montag und den Wochentag', () => {
    expect(weekStartOf('2026-08-02')).toBe('2026-07-27')
    expect(dayKeyOf('2026-07-27')).toBe('mo')
    expect(dayKeyOf('2026-08-02')).toBe('so')
  })
})

describe('weekStartsBetween', () => {
  it('nennt jede berührte Woche genau einmal', () => {
    expect(weekStartsBetween('2026-07-29', '2026-08-04')).toEqual(['2026-07-27', '2026-08-03'])
  })

  it('liefert bei einem Tag genau eine Woche', () => {
    expect(weekStartsBetween('2026-07-29', '2026-07-29')).toEqual(['2026-07-27'])
  })
})

describe('daysForView', () => {
  it('zeigt die Woche ab Montag, auch wenn ein Sonntag gewählt ist', () => {
    const days = daysForView('woche', '2026-08-02')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-07-27')
  })

  it('lässt in der Arbeitswoche das Wochenende weg', () => {
    const days = daysForView('arbeitswoche', '2026-07-29')
    expect(days).toHaveLength(5)
    expect(days[4]).toBe('2026-07-31')
  })

  it('zeigt im Tag nur den gewählten Tag', () => {
    expect(daysForView('tag', '2026-07-29')).toEqual(['2026-07-29'])
  })

  it('beginnt die Agenda beim gewählten Tag', () => {
    const days = daysForView('agenda', '2026-07-29')
    expect(days).toHaveLength(28)
    expect(days[0]).toBe('2026-07-29')
  })
})

describe('monthGridDays', () => {
  it('füllt immer sechs ganze Wochen ab Montag', () => {
    const days = monthGridDays('2026-08-15')
    expect(days).toHaveLength(42)
    expect(dayKeyOf(days[0])).toBe('mo')
    expect(days).toContain('2026-08-01')
    expect(days).toContain('2026-08-31')
  })

  it('startet vor dem Monatsersten, wenn der kein Montag ist', () => {
    // Der 01.08.2026 ist ein Samstag – das Raster beginnt am 27.07.
    expect(monthGridDays('2026-08-01')[0]).toBe('2026-07-27')
  })
})

describe('stepForView', () => {
  it('springt im Monat um ganze Monate', () => {
    expect(stepForView('monat', '2026-08-31', 1)).toBe('2026-09-01')
    expect(stepForView('monat', '2026-01-15', -1)).toBe('2025-12-01')
  })

  it('springt in der Woche um sieben Tage, im Tag um einen', () => {
    expect(stepForView('woche', '2026-07-29', 1)).toBe('2026-08-05')
    expect(stepForView('tag', '2026-07-29', -1)).toBe('2026-07-28')
  })
})

describe('eventSpanMinutes', () => {
  const event = { id: 'x', day: 'mo' as const, title: 'T', who: [] }

  it('rechnet Anfang und Ende in Minuten', () => {
    expect(eventSpanMinutes({ ...event, start: '09:15', end: '10:45' })).toEqual({
      start: 555,
      end: 645,
    })
  })

  it('gibt einem Termin ohne Ende eine Stunde', () => {
    expect(eventSpanMinutes({ ...event, start: '09:00' })).toEqual({ start: 540, end: 600 })
  })

  it('hält einen sehr kurzen Termin sichtbar', () => {
    expect(eventSpanMinutes({ ...event, start: '09:00', end: '09:10' }).end).toBe(540 + 30)
  })
})

describe('layoutDay', () => {
  const at = (start: number, end: number) => ({ start, end })

  it('lässt einen einzelnen Termin die volle Breite haben', () => {
    const [only] = layoutDay([at(60, 120)], (x) => x)
    expect(only).toMatchObject({ column: 0, columns: 1 })
  })

  it('stellt zwei sich überschneidende nebeneinander', () => {
    const result = layoutDay([at(60, 120), at(90, 150)], (x) => x)
    expect(result.map((r) => r.column)).toEqual([0, 1])
    expect(result.every((r) => r.columns === 2)).toBe(true)
  })

  it('lässt aufeinanderfolgende Termine je die volle Breite', () => {
    // Ende und Anfang berühren sich – das ist keine Überschneidung.
    const result = layoutDay([at(60, 120), at(120, 180)], (x) => x)
    expect(result.every((r) => r.columns === 1)).toBe(true)
  })

  it('gibt eine Spalte wieder frei, sobald sie leer ist', () => {
    // A überdeckt B und C, die beide in dieselbe zweite Spalte passen.
    const result = layoutDay([at(0, 300), at(0, 60), at(120, 180)], (x) => x)
    const columns = result.map((r) => r.column)
    expect(columns).toEqual([0, 1, 1])
    expect(result.every((r) => r.columns === 2)).toBe(true)
  })

  it('trennt Gruppen, die nichts miteinander zu tun haben', () => {
    const result = layoutDay([at(0, 60), at(30, 90), at(600, 660)], (x) => x)
    expect(result.find((r) => r.start === 600)?.columns).toBe(1)
  })
})

describe('occurrencesOn', () => {
  const week: WeekData = {
    ...emptyWeek('2026-07-27', DEFAULT_SETTINGS),
    events: [
      { id: 'a', day: 'di', start: '09:00', title: 'Zahnarzt', who: ['kind'] },
      { id: 'b', day: 'mi', start: '09:00', title: 'Anderer Tag', who: [] },
    ],
  }
  const series: EventSeries[] = [
    {
      id: 's',
      day: 'di',
      start: '16:00',
      title: 'Turnen',
      who: [],
      everyWeeks: 1,
      from: '2026-07-27',
      skipped: [],
    },
  ]

  it('liefert Einzel- und Serientermine des Tages mit ihrer Woche', () => {
    const result = occurrencesOn('2026-07-28', { '2026-07-27': week }, series)
    expect(result.map((o) => o.event.title)).toEqual(['Zahnarzt', 'Turnen'])
    expect(result.every((o) => o.weekStart === '2026-07-27' && o.date === '2026-07-28')).toBe(true)
  })

  it('bleibt leer, solange die Woche nicht geladen ist', () => {
    expect(occurrencesOn('2026-07-28', {}, series)).toEqual([])
  })
})

describe('matchesPeople', () => {
  it('zeigt Termine ohne Auswahl immer', () => {
    expect(matchesPeople([], new Set())).toBe(true)
  })

  it('zeigt einen Termin, sobald eine beteiligte Person sichtbar ist', () => {
    expect(matchesPeople(['mama', 'kind'], new Set(['kind']))).toBe(true)
    expect(matchesPeople(['mama'], new Set(['kind']))).toBe(false)
  })
})

describe('minutesOf', () => {
  it('liest Uhrzeiten und verträgt Unsinn', () => {
    expect(minutesOf('07:30')).toBe(450)
    expect(minutesOf('')).toBe(0)
  })
})
