import { describe, expect, it } from 'vitest'
import { DEFAULT_PEOPLE, DEFAULT_SETTINGS } from '../types'
import type { Person } from '../types'
import {
  dateTimeForDay,
  defaultBedtime,
  isoWeekNumber,
  normalizeEvents,
  normalizeSettings,
  normalizeSpans,
  normalizeWeek,
  startOfWeek,
  toISODate,
} from './week'

const person = (id: string, bedtime: boolean): Person => ({
  id,
  name: id,
  emoji: '🙂',
  color: '#000000',
  bedtime,
})

describe('startOfWeek', () => {
  it('gibt den Montag derselben Woche zurück', () => {
    // Mi, 29.07.2026 → Mo, 27.07.2026
    expect(toISODate(startOfWeek(new Date(2026, 6, 29)))).toBe('2026-07-27')
  })

  it('rechnet den Sonntag zur ablaufenden Woche, nicht zur nächsten', () => {
    expect(toISODate(startOfWeek(new Date(2026, 7, 2)))).toBe('2026-07-27')
  })

  it('lässt einen Montag stehen', () => {
    expect(toISODate(startOfWeek(new Date(2026, 6, 27)))).toBe('2026-07-27')
  })
})

describe('isoWeekNumber', () => {
  it('zählt nach ISO 8601', () => {
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1)
    expect(isoWeekNumber(new Date(2026, 6, 27))).toBe(31)
  })

  it('ordnet den Jahreswechsel der Woche des Donnerstags zu', () => {
    // Der 01.01.2027 ist ein Freitag und gehört noch zur 53. Woche von 2026.
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53)
  })
})

describe('defaultBedtime', () => {
  it('wechselt bei zwei Personen täglich', () => {
    const week = defaultBedtime('2026-07-27', 'mama', DEFAULT_PEOPLE)
    expect([week.mo, week.di, week.mi, week.do, week.fr, week.sa, week.so]).toEqual([
      'mama',
      'papa',
      'mama',
      'papa',
      'mama',
      'papa',
      'mama',
    ])
  })

  it('läuft über die Wochengrenze hinweg weiter', () => {
    const first = defaultBedtime('2026-07-27', 'mama', DEFAULT_PEOPLE)
    const second = defaultBedtime('2026-08-03', 'mama', DEFAULT_PEOPLE)
    // Sonntag Mama, also ist Montag der Folgewoche Papa dran.
    expect(first.so).toBe('mama')
    expect(second.mo).toBe('papa')
  })

  it('gleicht sich bei zwei Personen über zwei Wochen aus', () => {
    const days = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'] as const
    const count = (weekStart: string, id: string) =>
      days.filter((d) => defaultBedtime(weekStart, 'mama', DEFAULT_PEOPLE)[d] === id).length
    expect(count('2026-07-27', 'mama') + count('2026-08-03', 'mama')).toBe(7)
    expect(count('2026-07-27', 'papa') + count('2026-08-03', 'papa')).toBe(7)
  })

  it('teilt bei drei Personen reihum auf', () => {
    const people = [person('a', true), person('b', true), person('c', true)]
    const week = defaultBedtime('2026-07-27', 'a', people)
    const order = [week.mo, week.di, week.mi, week.do, week.fr, week.sa, week.so]
    // Reihum heißt: kein Tag wiederholt den Vortag, und nach dreien geht es von vorn los.
    expect(order[0]).not.toBe(order[1])
    expect(order[3]).toBe(order[0])
    expect(new Set(order).size).toBe(3)
  })

  it('überspringt, wer nicht am Bettdienst teilnimmt', () => {
    const week = defaultBedtime('2026-07-27', 'mama', DEFAULT_PEOPLE)
    expect(Object.values(week)).not.toContain('kind')
  })

  it('bleibt leer, wenn niemand teilnimmt', () => {
    const people = DEFAULT_PEOPLE.map((p) => ({ ...p, bedtime: false }))
    expect(Object.values(defaultBedtime('2026-07-27', 'mama', people))).toEqual(Array(7).fill(''))
  })

  it('führt die Rotation an, wer als Start gesetzt ist', () => {
    const mamaFirst = defaultBedtime('2026-07-27', 'mama', DEFAULT_PEOPLE)
    const papaFirst = defaultBedtime('2026-07-27', 'papa', DEFAULT_PEOPLE)
    expect(papaFirst.mo).not.toBe(mamaFirst.mo)
  })
})

describe('dateTimeForDay', () => {
  it('setzt Wochentag und Uhrzeit zusammen', () => {
    const at = dateTimeForDay('2026-07-27', 'di', '16:30')
    expect(toISODate(at)).toBe('2026-07-28')
    expect(at.getHours()).toBe(16)
    expect(at.getMinutes()).toBe(30)
  })
})

describe('normalizeEvents', () => {
  it('übernimmt den früheren Einzelwert als Teilnehmerliste', () => {
    const [event] = normalizeEvents([
      { id: 'a', day: 'mo', start: '09:00', title: 'Alt', who: 'mama' },
    ])
    expect(event.who).toEqual(['mama'])
  })

  it('macht aus dem früheren "alle" die leere Auswahl', () => {
    const [event] = normalizeEvents([
      { id: 'a', day: 'mo', start: '09:00', title: 'Alt', who: 'alle' },
    ])
    expect(event.who).toEqual([])
  })

  it('wirft Einträge ohne id weg und füllt fehlende Felder', () => {
    const events = normalizeEvents([{ day: 'mo', title: 'ohne id' }, { id: 'b', title: 'nackt' }])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'b', day: 'mo', start: '12:00', who: [] })
  })

  it('verträgt Unsinn statt einer Liste', () => {
    expect(normalizeEvents(null)).toEqual([])
    expect(normalizeEvents('kaputt')).toEqual([])
  })
})

describe('normalizeSpans', () => {
  it('dreht ein verdrehtes Datum wieder richtig herum', () => {
    const [span] = normalizeSpans([
      { id: 's', title: 'Urlaub', from: '2026-08-10', until: '2026-08-01' },
    ])
    expect([span.from, span.until]).toEqual(['2026-08-01', '2026-08-10'])
  })

  it('braucht beide Datumsangaben', () => {
    expect(normalizeSpans([{ id: 's', title: 'Urlaub', from: '2026-08-01' }])).toEqual([])
  })
})

describe('normalizeSettings', () => {
  it('ergänzt fehlende Personen mit der Standardfamilie', () => {
    expect(normalizeSettings({ servings: 4 }).people).toEqual(DEFAULT_PEOPLE)
  })

  it('wirft doppelte Personen-ids weg', () => {
    const people = normalizeSettings({
      people: [
        { id: 'mama', name: 'Mama', bedtime: true },
        { id: 'mama', name: 'Zwilling', bedtime: true },
      ],
    }).people
    expect(people).toHaveLength(1)
    expect(people[0].name).toBe('Mama')
  })

  it('holt den Rotationsstart zurück, wenn die Person gelöscht wurde', () => {
    const settings = normalizeSettings({
      people: [{ id: 'papa', name: 'Papa', bedtime: true }],
      bedtimeStart: 'mama',
    })
    expect(settings.bedtimeStart).toBe('papa')
  })

  it('lässt sinnlose Portionszahlen nicht durch', () => {
    expect(normalizeSettings({ servings: 0 }).servings).toBe(DEFAULT_SETTINGS.servings)
    expect(normalizeSettings({ servings: 'viele' }).servings).toBe(DEFAULT_SETTINGS.servings)
  })
})

describe('normalizeWeek', () => {
  it('verwirft einen Bettdienst, dessen Person es nicht mehr gibt', () => {
    const week = normalizeWeek(
      { bedtime: { mo: 'oma', di: 'papa' } },
      '2026-07-27',
      DEFAULT_SETTINGS,
    )
    expect(week.bedtime.mo).not.toBe('oma')
    expect(week.bedtime.di).toBe('papa')
  })

  it('baut aus gar nichts eine vollständige Woche', () => {
    const week = normalizeWeek(undefined, '2026-07-27', DEFAULT_SETTINGS)
    expect(week.weekStart).toBe('2026-07-27')
    expect(Object.keys(week.meals)).toHaveLength(7)
    expect(week.events).toEqual([])
    expect(week.shopping).toEqual([])
  })
})
