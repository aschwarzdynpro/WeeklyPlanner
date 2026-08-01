import { REMINDER_CHOICES, REPEAT_CHOICES } from '../../types'
import type { Person } from '../../types'
import { Modal } from '../Modal'
import { AttendeePicker } from './AttendeePicker'

/** Der Termin im Formular. Anders als gespeichert steht hier ein Datum, kein Wochentag. */
export interface EventDraft {
  /** id des Einzeltermins – leer bei einem neuen Termin. */
  id?: string
  /** Wochendokument, in dem er bisher steht. */
  originWeek?: string
  /** Gesetzt, wenn der Termin aus einer Serie stammt. */
  seriesId?: string
  /** Tag des angetippten Serientermins, für „nur dieser Termin“. */
  occurrence?: string
  date: string
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

interface Props {
  draft: EventDraft
  people: Person[]
  onChange: (patch: Partial<EventDraft>) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export function EventDialog({ draft, people, onChange, onSave, onDelete, onClose }: Props) {
  const existing = Boolean(draft.id || draft.seriesId)
  const editsSeries = Boolean(draft.seriesId) && draft.scope === 'all'

  const toggle = (id: string) =>
    onChange({
      who: draft.who.includes(id) ? draft.who.filter((x) => x !== id) : [...draft.who, id],
    })

  return (
    <Modal
      title={existing ? 'Termin bearbeiten' : 'Neuer Termin'}
      onClose={onClose}
      footer={
        existing ? (
          <button className="danger-btn" onClick={onDelete}>
            {draft.seriesId && draft.scope === 'all' ? 'Ganze Serie löschen' : 'Löschen'}
          </button>
        ) : undefined
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        {draft.seriesId && (
          <fieldset className="choice-group">
            <legend>Dieser Termin gehört zu einer Serie</legend>
            <div className="chip-choice">
              <label className={draft.scope === 'all' ? 'chip-toggle on' : 'chip-toggle'}>
                <input
                  type="radio"
                  name="scope"
                  checked={draft.scope === 'all'}
                  onChange={() => onChange({ scope: 'all' })}
                />
                Ganze Serie
              </label>
              <label className={draft.scope === 'one' ? 'chip-toggle on' : 'chip-toggle'}>
                <input
                  type="radio"
                  name="scope"
                  checked={draft.scope === 'one'}
                  onChange={() => onChange({ scope: 'one' })}
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
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="z. B. Turnen, Elternabend, Zahnarzt"
            required
          />
        </label>

        <label>
          Wo? (optional)
          <input
            value={draft.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="z. B. Turnhalle Grundschule"
          />
        </label>

        <div className="form-row">
          <label>
            Tag
            <input
              type="date"
              value={draft.date}
              onChange={(e) => e.target.value && onChange({ date: e.target.value })}
              required
            />
          </label>
          <label>
            Von
            <input
              type="time"
              value={draft.start}
              onChange={(e) => onChange({ start: e.target.value })}
              required
            />
          </label>
          <label>
            Bis
            <input
              type="time"
              value={draft.end}
              onChange={(e) => onChange({ end: e.target.value })}
            />
          </label>
        </div>

        <AttendeePicker people={people} who={draft.who} onToggle={toggle} />

        {draft.scope === 'all' && (
          <div className="form-row">
            <label>
              Wiederholung
              <select
                value={draft.everyWeeks}
                onChange={(e) => onChange({ everyWeeks: Number(e.target.value) })}
              >
                <option value={0}>Einmalig</option>
                {REPEAT_CHOICES.map((r) => (
                  <option key={r.weeks} value={r.weeks}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            {draft.everyWeeks > 0 && (
              <label>
                Läuft bis (optional)
                <input
                  type="date"
                  value={draft.until}
                  min={draft.date}
                  onChange={(e) => onChange({ until: e.target.value })}
                />
              </label>
            )}
          </div>
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
            onChange={(e) => onChange({ remindMinutes: Number(e.target.value) })}
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
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Turnbeutel einpacken"
          />
        </label>

        <button className="primary-btn" type="submit">
          Speichern
        </button>
      </form>
    </Modal>
  )
}
