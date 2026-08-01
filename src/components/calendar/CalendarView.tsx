import { useEffect, useMemo, useState } from 'react'
import { bedtimeRotation, personById } from '../../types'
import type { CalendarEvent, EventSpan, Person, WeekData } from '../../types'
import { fromISODate, isoWeekNumber, toISODate, uid } from '../../lib/week'
import {
  VIEWS,
  dayKeyOf,
  daysForView,
  formatMonthYear,
  matchesPeople,
  minutesOf,
  formatMinutes,
  occurrencesOn as occurrencesFor,
  spansOn as spansFor,
  stepForView,
  weekStartOf,
  weekStartsBetween,
} from '../../lib/calendar'
import type { CalendarView as ViewKey, Occurrence } from '../../lib/calendar'
import type { usePlanner } from '../../hooks/usePlanner'
import { TimeGrid } from './TimeGrid'
import { MonthGrid } from './MonthGrid'
import { AgendaList } from './AgendaList'
import { EventDialog } from './EventDialog'
import type { EventDraft } from './EventDialog'
import { SpanDialog } from './SpanDialog'
import type { SpanDraft } from './SpanDialog'

interface Props {
  planner: ReturnType<typeof usePlanner>
  /** Personen, deren Termine gerade angezeigt werden. */
  visible: Set<string>
  view: ViewKey
  onViewChange: (view: ViewKey) => void
}

const emptyEventDraft = (date: string, minutes: number): EventDraft => ({
  date,
  start: formatMinutes(minutes),
  end: formatMinutes(minutes + 60),
  title: '',
  who: [],
  location: '',
  note: '',
  remindMinutes: 0,
  everyWeeks: 0,
  until: '',
  scope: 'all',
})

/**
 * Der Kalender: Befehlsleiste, Ansichtsumschalter und die eigentliche
 * Darstellung. Die Ansichten selbst sind stumm — sie bekommen fertige
 * Termine gereicht und melden Klicks zurück.
 */
export function CalendarView({ planner, visible, view, onViewChange }: Props) {
  const {
    anchor,
    setAnchor,
    weeks,
    requestWeeks,
    series,
    spans,
    settings,
    editWeek,
    updateSeries,
    updateSpans,
    updateSettings,
  } = planner

  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [spanDraft, setSpanDraft] = useState<SpanDraft | null>(null)

  const days = useMemo(() => daysForView(view, anchor), [view, anchor])
  const people = settings.people
  const rotation = bedtimeRotation(people)

  // Die Ansicht sagt dem Speicher, welche Wochendokumente sie braucht.
  useEffect(() => {
    requestWeeks(weekStartsBetween(days[0], days[days.length - 1]))
  }, [requestWeeks, days])

  // --- Was wo steht ----------------------------------------------------------

  const occurrencesOn = (date: string) =>
    occurrencesFor(date, weeks, series).filter((o) => matchesPeople(o.event.who, visible))

  const spansOn = (date: string) =>
    spansFor(spans, date).filter((span) => matchesPeople(span.who, visible))

  const bedtimeOn = (date: string): Person | undefined => {
    const week = weeks[weekStartOf(date)]
    if (!week) return undefined
    const id = week.bedtime[dayKeyOf(date)]
    const person = personById(people, id)
    return person?.bedtime ? person : undefined
  }

  // --- Termine ändern --------------------------------------------------------

  const addEvent = (weekStart: string, event: CalendarEvent) =>
    void editWeek(weekStart, (week) => ({ ...week, events: [...week.events, event] }))

  const removeEvent = (weekStart: string, id: string) =>
    void editWeek(weekStart, (week) => ({
      ...week,
      events: week.events.filter((x) => x.id !== id),
    }))

  const skipOccurrence = (seriesId: string, date: string) =>
    updateSeries((all) =>
      all.map((s) =>
        s.id === seriesId && !s.skipped.includes(date) ? { ...s, skipped: [...s.skipped, date] } : s,
      ),
    )

  const saveEvent = () => {
    if (!draft || !draft.title.trim()) return
    const targetWeek = weekStartOf(draft.date)
    const base = {
      day: dayKeyOf(draft.date),
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
        // Aus der Serie wird ein einzelner Termin an diesem Tag.
        updateSeries((all) => all.filter((s) => s.id !== draft.seriesId))
        addEvent(targetWeek, { id: uid(), ...base })
      } else {
        updateSeries((all) =>
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
      addEvent(targetWeek, { id: uid(), ...base })
    } else if (draft.everyWeeks > 0) {
      // Neuer oder bisher einmaliger Termin, der sich künftig wiederholt.
      updateSeries((all) => [
        ...all,
        {
          id: uid(),
          ...base,
          everyWeeks: draft.everyWeeks,
          from: targetWeek,
          until: draft.until || undefined,
          skipped: [],
        },
      ])
      if (draft.id && draft.originWeek) removeEvent(draft.originWeek, draft.id)
    } else if (draft.id && draft.originWeek) {
      const event: CalendarEvent = { id: draft.id, ...base }
      if (draft.originWeek === targetWeek) {
        void editWeek(targetWeek, (week) => ({
          ...week,
          events: week.events.map((x) => (x.id === draft.id ? event : x)),
        }))
      } else {
        // Auf einen Tag in einer anderen Woche geschoben: Dokument wechseln.
        removeEvent(draft.originWeek, draft.id)
        addEvent(targetWeek, event)
      }
    } else {
      addEvent(targetWeek, { id: uid(), ...base })
    }

    setDraft(null)
  }

  const deleteEvent = () => {
    if (!draft) return
    if (draft.seriesId) {
      if (draft.scope === 'all') {
        updateSeries((all) => all.filter((s) => s.id !== draft.seriesId))
      } else if (draft.occurrence) {
        skipOccurrence(draft.seriesId, draft.occurrence)
      }
    } else if (draft.id && draft.originWeek) {
      removeEvent(draft.originWeek, draft.id)
    }
    setDraft(null)
  }

  const openEvent = (occurrence: Occurrence) => {
    const { event, weekStart, date } = occurrence
    const source = event.seriesId ? series.find((s) => s.id === event.seriesId) : undefined
    setDraft({
      id: event.seriesId ? undefined : event.id,
      originWeek: event.seriesId ? undefined : weekStart,
      seriesId: event.seriesId,
      occurrence: event.seriesId ? date : undefined,
      date,
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
    })
  }

  // --- Zeiträume -------------------------------------------------------------

  const saveSpan = () => {
    if (!spanDraft || !spanDraft.title.trim()) return
    const ordered = spanDraft.from <= spanDraft.until
    const span: EventSpan = {
      id: spanDraft.id ?? uid(),
      title: spanDraft.title.trim(),
      emoji: spanDraft.emoji.trim() || '🏖️',
      from: ordered ? spanDraft.from : spanDraft.until,
      until: ordered ? spanDraft.until : spanDraft.from,
      who: spanDraft.who,
      note: spanDraft.note.trim() || undefined,
    }
    updateSpans((all) =>
      spanDraft.id ? all.map((x) => (x.id === spanDraft.id ? span : x)) : [...all, span],
    )
    setSpanDraft(null)
  }

  const deleteSpan = () => {
    if (spanDraft?.id) updateSpans((all) => all.filter((x) => x.id !== spanDraft.id))
    setSpanDraft(null)
  }

  const openSpan = (span: EventSpan) =>
    setSpanDraft({
      id: span.id,
      title: span.title,
      emoji: span.emoji,
      from: span.from,
      until: span.until,
      who: span.who,
      note: span.note ?? '',
    })

  // --- Bettdienst ------------------------------------------------------------

  const nextOnDuty = (date: string) => {
    if (rotation.length === 0) return
    const day = dayKeyOf(date)
    void editWeek(weekStartOf(date), (week: WeekData) => {
      const current = rotation.findIndex((p) => p.id === week.bedtime[day])
      const next = rotation[(current + 1) % rotation.length]
      return { ...week, bedtime: { ...week.bedtime, [day]: next.id } }
    })
  }

  /**
   * Verschiebt die Rotation dauerhaft um eine Person. Bei zwei Personen ist
   * das genau der Tausch, den es vorher gab.
   */
  const advanceRotation = () => {
    if (rotation.length === 0) return
    const current = rotation.findIndex((p) => p.id === settings.bedtimeStart)
    updateSettings({ bedtimeStart: rotation[(current + 1) % rotation.length].id })
  }

  // --- Beschriftung der Befehlsleiste ----------------------------------------

  const title = useMemo(() => {
    if (view === 'monat') return formatMonthYear(anchor)
    if (view === 'tag') {
      return fromISODate(anchor).toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    }
    const first = fromISODate(days[0])
    const last = fromISODate(days[days.length - 1])
    const fmt = (d: Date, withYear: boolean) =>
      d.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'long',
        ...(withYear ? { year: 'numeric' } : {}),
      })
    const range = `${fmt(first, first.getFullYear() !== last.getFullYear())} – ${fmt(last, true)}`
    return view === 'agenda' ? range : `${range} (KW ${isoWeekNumber(first)})`
  }, [view, anchor, days])

  const isToday = days.includes(toISODate(new Date()))

  return (
    <div className="cal">
      <div className="cal-bar">
        <button
          className="primary-btn"
          onClick={() => setDraft(emptyEventDraft(anchor, minutesOf('16:00')))}
        >
          + Neuer Termin
        </button>
        <button
          className="secondary-btn"
          onClick={() =>
            setSpanDraft({
              title: '',
              emoji: '🏖️',
              from: anchor,
              until: anchor,
              who: [],
              note: '',
            })
          }
        >
          + Zeitraum
        </button>

        <div className="cal-nav">
          <button
            className="secondary-btn"
            onClick={() => setAnchor(toISODate(new Date()))}
            disabled={isToday && view !== 'monat'}
          >
            Heute
          </button>
          <button
            className="icon-btn"
            onClick={() => setAnchor(stepForView(view, anchor, -1))}
            aria-label="Zurück"
          >
            ‹
          </button>
          <button
            className="icon-btn"
            onClick={() => setAnchor(stepForView(view, anchor, 1))}
            aria-label="Weiter"
          >
            ›
          </button>
        </div>

        <h2 className="cal-title">{title}</h2>

        <div className="cal-views" role="tablist" aria-label="Ansicht">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              className={view === v.key ? 'cal-view on' : 'cal-view'}
              onClick={() => onViewChange(v.key)}
            >
              <span aria-hidden="true">{v.icon}</span>
              <span className="cal-view-label">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {rotation.length > 1 && (
        <div className="cal-hint">
          <span className="muted small">
            🌙 Bettdienst {settings.bedtimeFrom}–{settings.bedtimeTo}, reihum:{' '}
            {rotation.map((p) => p.name).join(' → ')}. Ein Tipp auf den Balken reicht einen
            einzelnen Tag weiter.
          </span>
          <button className="link-btn" onClick={advanceRotation}>
            Rotation verschieben
          </button>
        </div>
      )}

      <div className="cal-body">
        {view === 'monat' ? (
          <MonthGrid
            days={days}
            anchor={anchor}
            people={people}
            occurrencesOn={occurrencesOn}
            spansOn={spansOn}
            bedtimeOn={bedtimeOn}
            onNew={(date) => setDraft(emptyEventDraft(date, minutesOf('16:00')))}
            onOpen={openEvent}
            onOpenSpan={openSpan}
            onPickDay={(date) => {
              setAnchor(date)
              onViewChange('tag')
            }}
          />
        ) : view === 'agenda' ? (
          <AgendaList
            days={days}
            people={people}
            occurrencesOn={occurrencesOn}
            spansOn={spansOn}
            bedtimeOn={bedtimeOn}
            onOpen={openEvent}
            onOpenSpan={openSpan}
          />
        ) : (
          <TimeGrid
            days={days}
            people={people}
            settings={settings}
            occurrencesOn={occurrencesOn}
            spansOn={spansOn}
            bedtimeOn={bedtimeOn}
            onBedtime={nextOnDuty}
            onNew={(date, minutes) => setDraft(emptyEventDraft(date, minutes))}
            onOpen={openEvent}
            onOpenSpan={openSpan}
            onPickDay={(date) => {
              setAnchor(date)
              onViewChange('tag')
            }}
          />
        )}
      </div>

      {draft && (
        <EventDialog
          draft={draft}
          people={people}
          onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setDraft(null)}
        />
      )}

      {spanDraft && (
        <SpanDialog
          draft={spanDraft}
          people={people}
          onChange={(patch) => setSpanDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={saveSpan}
          onDelete={deleteSpan}
          onClose={() => setSpanDraft(null)}
        />
      )}
    </div>
  )
}
