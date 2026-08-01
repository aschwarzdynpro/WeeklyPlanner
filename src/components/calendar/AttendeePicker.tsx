import type { Person } from '../../types'

interface Props {
  people: Person[]
  who: string[]
  onToggle: (id: string) => void
}

/** Die Teilnehmerauswahl steht im Termin- wie im Zeitraum-Formular. */
export function AttendeePicker({ people, who, onToggle }: Props) {
  return (
    <fieldset className="choice-group">
      <legend>Wer ist dabei?</legend>
      <div className="chip-choice">
        {people.map((person) => (
          <label
            key={person.id}
            className={who.includes(person.id) ? 'chip-toggle on' : 'chip-toggle'}
            style={
              who.includes(person.id)
                ? { borderColor: person.color, background: `${person.color}26` }
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={who.includes(person.id)}
              onChange={() => onToggle(person.id)}
            />
            {person.emoji} {person.name}
          </label>
        ))}
      </div>
      <p className="muted small">Nichts ausgewählt heißt: alle sind dabei.</p>
    </fieldset>
  )
}
