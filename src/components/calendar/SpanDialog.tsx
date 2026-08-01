import { SPAN_PRESETS } from '../../types'
import type { Person } from '../../types'
import { Modal } from '../Modal'
import { AttendeePicker } from './AttendeePicker'

/** Zeitraum im Formular; `id` fehlt, solange er neu ist. */
export interface SpanDraft {
  id?: string
  title: string
  emoji: string
  from: string
  until: string
  who: string[]
  note: string
}

interface Props {
  draft: SpanDraft
  people: Person[]
  onChange: (patch: Partial<SpanDraft>) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export function SpanDialog({ draft, people, onChange, onSave, onDelete, onClose }: Props) {
  const toggle = (id: string) =>
    onChange({
      who: draft.who.includes(id) ? draft.who.filter((x) => x !== id) : [...draft.who, id],
    })

  return (
    <Modal
      title={draft.id ? 'Zeitraum bearbeiten' : 'Neuer Zeitraum'}
      onClose={onClose}
      footer={
        draft.id ? (
          <button className="danger-btn" onClick={onDelete}>
            Löschen
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
        <div className="chip-choice">
          {SPAN_PRESETS.map((preset) => (
            <button
              key={preset.title}
              type="button"
              className="chip-toggle"
              onClick={() => onChange({ emoji: preset.emoji, title: preset.title })}
            >
              {preset.emoji} {preset.title}
            </button>
          ))}
        </div>

        <div className="form-row">
          <label className="span-emoji-field">
            Zeichen
            <input
              value={draft.emoji}
              onChange={(e) => onChange({ emoji: e.target.value.slice(0, 4) })}
            />
          </label>
          <label>
            Was?
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="z. B. Urlaub, Kita zu"
              required
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Von
            <input
              type="date"
              value={draft.from}
              onChange={(e) => e.target.value && onChange({ from: e.target.value })}
              required
            />
          </label>
          <label>
            Bis
            <input
              type="date"
              value={draft.until}
              min={draft.from}
              onChange={(e) => e.target.value && onChange({ until: e.target.value })}
              required
            />
          </label>
        </div>

        <AttendeePicker people={people} who={draft.who} onToggle={toggle} />

        <label>
          Notiz (optional)
          <input
            value={draft.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Schlüssel bei den Nachbarn"
          />
        </label>

        <p className="muted small">
          Zeiträume haben keine Uhrzeit und dürfen über Wochen hinausgehen — sie erscheinen in jeder
          Woche, die sie berühren.
        </p>

        <button className="primary-btn" type="submit">
          Speichern
        </button>
      </form>
    </Modal>
  )
}
