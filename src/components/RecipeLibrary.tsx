import { useState } from 'react'
import type { Recipe, Settings } from '../types'
import type { RecipeLibrary as Library } from '../hooks/useRecipes'
import { RecipeSheet } from './RecipeSheet'

interface Props {
  settings: Settings
  library: Library
}

const WEEK = 7 * 24 * 60 * 60 * 1000

export function RecipeLibrary({ settings, library }: Props) {
  const [open, setOpen] = useState<Recipe | null>(null)
  const { all, stored, generating, error, generate, isStale } = library

  const alltag = all.filter((r) => r.kind === 'alltag')
  const wochenende = all.filter((r) => r.kind === 'wochenende')

  // Was in den letzten sieben Tagen dazugekommen ist, wird markiert.
  const freshIds = new Set(
    stored.filter((r) => Date.now() - new Date(r.createdAt).getTime() < WEEK).map((r) => r.id),
  )

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
              <strong>
                {r.title}
                {freshIds.has(r.id) && <span className="badge-new">neu</span>}
              </strong>
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
        {all.length} Rezepte, alle Mengen auf {settings.servings} Portionen umgerechnet (einstellbar
        über ⚙️).
      </p>

      <div className="generate-box">
        <div>
          <strong>Neue Vorschläge</strong>
          <p className="muted small">
            {isStale
              ? 'Es ist über eine Woche her – Zeit für Nachschub.'
              : 'Diese Woche sind schon neue Rezepte dazugekommen.'}{' '}
            Passend zu eurer Familie und ohne Wiederholung dessen, was ihr schon habt.
          </p>
        </div>
        <button className="primary-btn" onClick={() => void generate(3)} disabled={generating}>
          {generating ? 'Wird gekocht …' : '3 neue Rezepte holen'}
        </button>
      </div>

      {generating && (
        <p className="muted small">
          Das dauert etwa eine halbe Minute – du kannst die App in der Zwischenzeit weiter nutzen.
        </p>
      )}
      {error && <p className="error-line">{error}</p>}

      {renderGroup('Für den Alltag', alltag)}
      {renderGroup('Fürs Wochenende', wochenende)}

      {open && <RecipeSheet recipe={open} servings={settings.servings} onClose={() => setOpen(null)} />}
    </section>
  )
}
