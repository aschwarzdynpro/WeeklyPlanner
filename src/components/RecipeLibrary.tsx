import { useState } from 'react'
import type { Recipe, Settings } from '../types'
import { RECIPES } from '../data/recipes'
import { RecipeSheet } from './RecipeSheet'

export function RecipeLibrary({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState<Recipe | null>(null)
  const alltag = RECIPES.filter((r) => r.kind === 'alltag')
  const wochenende = RECIPES.filter((r) => r.kind === 'wochenende')

  const renderGroup = (title: string, list: Recipe[]) => (
    <div className="shop-group">
      <h3>{title}</h3>
      <div className="picker-list">
        {list.map((r) => (
          <button key={r.id} className="picker-item" onClick={() => setOpen(r)}>
            <span className="meal-emoji" aria-hidden="true">
              {r.emoji}
            </span>
            <span>
              <strong>{r.title}</strong>
              <span className="meal-sub">
                {r.subtitle} · {r.minutes} Min
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <section>
      <p className="section-intro">
        Alle Mengen sind auf {settings.servings} Portionen umgerechnet (einstellbar über ⚙️).
      </p>
      {renderGroup('Für den Alltag', alltag)}
      {renderGroup('Fürs Wochenende', wochenende)}
      {open && <RecipeSheet recipe={open} servings={settings.servings} onClose={() => setOpen(null)} />}
    </section>
  )
}
