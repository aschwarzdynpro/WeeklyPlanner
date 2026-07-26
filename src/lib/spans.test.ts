import { describe, expect, it } from 'vitest'
import type { EventSpan } from '../types'
import { formatSpanRange, spanCoversDay, spansForDay, spansForWeek } from './spans'

const urlaub: EventSpan = {
  id: 'u',
  title: 'Urlaub',
  emoji: '🏖️',
  from: '2026-07-30',
  until: '2026-08-09',
  who: [],
}

describe('spanCoversDay', () => {
  it('schließt beide Ränder ein', () => {
    expect(spanCoversDay(urlaub, '2026-07-30')).toBe(true)
    expect(spanCoversDay(urlaub, '2026-08-09')).toBe(true)
  })

  it('lässt die Tage davor und danach aus', () => {
    expect(spanCoversDay(urlaub, '2026-07-29')).toBe(false)
    expect(spanCoversDay(urlaub, '2026-08-10')).toBe(false)
  })
})

describe('spansForWeek', () => {
  it('zeigt den Zeitraum in jeder Woche, die er berührt', () => {
    // Beginnt am Donnerstag der ersten und endet am Sonntag der übernächsten.
    expect(spansForWeek([urlaub], '2026-07-27')).toHaveLength(1)
    expect(spansForWeek([urlaub], '2026-08-03')).toHaveLength(1)
  })

  it('lässt Wochen davor und danach frei', () => {
    expect(spansForWeek([urlaub], '2026-07-20')).toEqual([])
    expect(spansForWeek([urlaub], '2026-08-10')).toEqual([])
  })

  it('erkennt einen Zeitraum, der genau am Sonntag endet', () => {
    const kurz: EventSpan = { ...urlaub, from: '2026-08-02', until: '2026-08-02' }
    expect(spansForWeek([kurz], '2026-07-27')).toHaveLength(1)
  })

  it('sortiert nach Beginn', () => {
    const frueher: EventSpan = { ...urlaub, id: 'k', title: 'Kita zu', from: '2026-07-27' }
    expect(spansForWeek([urlaub, frueher], '2026-07-27').map((s) => s.id)).toEqual(['k', 'u'])
  })
})

describe('spansForDay', () => {
  it('liefert nur, was diesen Wochentag betrifft', () => {
    expect(spansForDay([urlaub], '2026-07-27', 'mi')).toHaveLength(0)
    expect(spansForDay([urlaub], '2026-07-27', 'do')).toHaveLength(1)
  })
})

describe('formatSpanRange', () => {
  it('zeigt Anfang und Ende', () => {
    expect(formatSpanRange(urlaub)).toBe('30.07. – 09.08.')
  })

  it('zeigt bei einem einzelnen Tag nur ein Datum', () => {
    expect(formatSpanRange({ ...urlaub, until: urlaub.from })).toBe('30.07.')
  })
})
