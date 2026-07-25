import { useMemo, useState } from 'react'
import type { Recipe, Settings, WeekData } from '../types'
import {
  buildShoppingList,
  formatQty,
  groupByCategory,
  makeManualItem,
  shoppingListAsText,
} from '../lib/shopping'

interface Props {
  week: WeekData
  settings: Settings
  recipeById: Map<string, Recipe>
  onChange: (mutate: (draft: WeekData) => WeekData) => void
}

export function ShoppingList({ week, settings, recipeById, onChange }: Props) {
  const [newItem, setNewItem] = useState('')
  const [copied, setCopied] = useState(false)

  const groups = useMemo(() => groupByCategory(week.shopping), [week.shopping])
  const open = week.shopping.filter((i) => !i.checked).length

  const regenerate = () => {
    onChange((draft) => ({ ...draft, shopping: buildShoppingList(draft, settings.servings, recipeById) }))
  }

  const toggle = (id: string) => {
    onChange((draft) => ({
      ...draft,
      shopping: draft.shopping.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
    }))
  }

  const remove = (id: string) => {
    onChange((draft) => ({ ...draft, shopping: draft.shopping.filter((i) => i.id !== id) }))
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newItem.trim()
    if (!name) return
    onChange((draft) => ({ ...draft, shopping: [...draft.shopping, makeManualItem(name)] }))
    setNewItem('')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shoppingListAsText(week.shopping))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (week.shopping.length === 0) {
    return (
      <section className="empty-state">
        <p className="section-intro">
          Die Einkaufsliste wird aus den geplanten Gerichten der Woche berechnet – gleiche Zutaten
          werden zusammengezählt.
        </p>
        <button className="primary-btn" onClick={regenerate}>
          Einkaufsliste erstellen
        </button>
      </section>
    )
  }

  return (
    <section>
      <div className="list-toolbar">
        <span className="muted">
          {open === 0 ? 'Alles eingekauft 🎉' : `Noch ${open} von ${week.shopping.length}`}
        </span>
        <div className="toolbar-actions">
          <button className="link-btn" onClick={copy}>
            {copied ? 'Kopiert ✓' : 'Als Text kopieren'}
          </button>
          <button className="link-btn" onClick={regenerate}>
            Neu berechnen
          </button>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.cat} className="shop-group">
          <h3>{group.cat}</h3>
          <ul className="shop-list">
            {group.items.map((item) => (
              <li key={item.id} className={item.checked ? 'checked' : ''}>
                <label>
                  <input type="checkbox" checked={item.checked} onChange={() => toggle(item.id)} />
                  <span className="shop-name">{item.name}</span>
                  <span className="shop-qty">{formatQty(item.qty, item.unit)}</span>
                </label>
                {item.manual && (
                  <button
                    className="icon-btn small"
                    onClick={() => remove(item.id)}
                    aria-label={`${item.name} entfernen`}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <form className="add-row" onSubmit={add}>
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Etwas ergänzen (z. B. Milch)"
          aria-label="Artikel ergänzen"
        />
        <button className="primary-btn" type="submit">
          Hinzufügen
        </button>
      </form>

      <p className="muted small">
        „Neu berechnen“ übernimmt geänderte Gerichte. Abgehakte Artikel und eigene Ergänzungen
        bleiben dabei erhalten.
      </p>
    </section>
  )
}
