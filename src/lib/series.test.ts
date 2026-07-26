import { describe, expect, it } from 'vitest'
import type { CalendarEvent, EventSeries } from '../types'
import { eventsForWeek, occurrenceDate, occurrenceFor, seriesOccursInWeek } from './series'

const turnen: EventSeries = {
  id: 'turnen',
  day: 'di',
  start: '16:00',
  title: 'Turnen',
  who: ['kind'],
  location: 'Turnhalle',
  everyWeeks: 1,
  from: '2026-07-27',
  skipped: [],
}

describe('seriesOccursInWeek', () => {
  it('findet eine wöchentliche Serie in jeder Woche', () => {
    expect(seriesOccursInWeek(turnen, '2026-07-27')).toBe(true)
    expect(seriesOccursInWeek(turnen, '2026-08-03')).toBe(true)
  })

  it('lässt bei 14-tägig jede zweite Woche aus', () => {
    const zweiwoechig = { ...turnen, everyWeeks: 2 }
    expect(seriesOccursInWeek(zweiwoechig, '2026-07-27')).toBe(true)
    expect(seriesOccursInWeek(zweiwoechig, '2026-08-03')).toBe(false)
    expect(seriesOccursInWeek(zweiwoechig, '2026-08-10')).toBe(true)
  })

  it('hält den Rhythmus über den Jahreswechsel', () => {
    const zweiwoechig = { ...turnen, everyWeeks: 2 }
    // 23 Wochen später ist ungerade – also keine Ausgabe.
    expect(seriesOccursInWeek(zweiwoechig, '2027-01-04')).toBe(false)
    expect(seriesOccursInWeek(zweiwoechig, '2027-01-11')).toBe(true)
  })

  it('gilt nicht vor dem Beginn', () => {
    expect(seriesOccursInWeek(turnen, '2026-07-20')).toBe(false)
  })
})

describe('occurrenceFor', () => {
  it('erzeugt den Termin am richtigen Tag', () => {
    const event = occurrenceFor(turnen, '2026-07-27')
    expect(event?.id).toBe('turnen@2026-07-28')
    expect(event?.seriesId).toBe('turnen')
    expect(event?.title).toBe('Turnen')
    expect(event?.location).toBe('Turnhalle')
  })

  it('lässt in der ersten Woche aus, was vor dem Beginn liegt', () => {
    // Serie ab Mittwoch, Termin ist dienstags – in dieser Woche also nicht mehr.
    expect(occurrenceFor({ ...turnen, from: '2026-07-29' }, '2026-07-27')).toBeNull()
    expect(occurrenceFor({ ...turnen, from: '2026-07-29' }, '2026-08-03')).not.toBeNull()
  })

  it('endet mit dem letzten Tag', () => {
    const befristet = { ...turnen, until: '2026-08-05' }
    expect(occurrenceFor(befristet, '2026-08-03')).not.toBeNull()
    expect(occurrenceFor(befristet, '2026-08-10')).toBeNull()
  })

  it('überspringt einzeln abgesagte Tage', () => {
    const mitAusnahme = { ...turnen, skipped: ['2026-08-04'] }
    expect(occurrenceFor(mitAusnahme, '2026-08-03')).toBeNull()
    expect(occurrenceFor(mitAusnahme, '2026-08-10')).not.toBeNull()
  })
})

describe('occurrenceDate', () => {
  it('liest den Tag aus der id des Serientermins', () => {
    expect(occurrenceDate('turnen@2026-07-28')).toBe('2026-07-28')
  })

  it('kommt auch mit einem @ in der Serien-id klar', () => {
    expect(occurrenceDate('a@b@2026-07-28')).toBe('2026-07-28')
  })
})

describe('eventsForWeek', () => {
  const zahnarzt: CalendarEvent = {
    id: 'e1',
    day: 'di',
    start: '08:00',
    title: 'Zahnarzt',
    who: [],
  }

  it('mischt Einzel- und Serientermine und sortiert nach Uhrzeit', () => {
    const events = eventsForWeek([zahnarzt], [turnen], '2026-07-27')
    expect(events.map((e) => e.title)).toEqual(['Zahnarzt', 'Turnen'])
  })

  it('zeigt in einer Woche ohne Serientermin nur die Einzeltermine', () => {
    const events = eventsForWeek([zahnarzt], [{ ...turnen, everyWeeks: 2 }], '2026-08-03')
    expect(events).toHaveLength(1)
  })
})
