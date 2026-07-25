import type { Recipe } from '../types'
import { formatQty } from '../lib/shopping'
import { Modal } from './Modal'

interface Props {
  recipe: Recipe
  servings: number
  onClose: () => void
}

export function RecipeSheet({ recipe, servings, onClose }: Props) {
  const factor = servings / recipe.servings
  const main = recipe.ingredients.filter((i) => !i.pantry)
  const pantry = recipe.ingredients.filter((i) => i.pantry)

  return (
    <Modal title={recipe.title} onClose={onClose}>
      <p className="muted">{recipe.subtitle}</p>
      <div className="chips">
        <span className="chip">⏱️ {recipe.minutes} Min</span>
        <span className="chip">🍽️ {servings} Portionen</span>
        {recipe.tags.map((t) => (
          <span className="chip" key={t}>
            {t}
          </span>
        ))}
      </div>

      <h3>Zutaten</h3>
      <ul className="ingredient-list">
        {main.map((ing) => (
          <li key={ing.name}>
            <span className="ing-qty">{formatQty(ing.qty === null ? null : ing.qty * factor, ing.unit)}</span>
            <span>{ing.name}</span>
          </li>
        ))}
      </ul>
      {pantry.length > 0 && (
        <p className="muted small">
          Aus dem Vorrat: {pantry.map((i) => i.name).join(', ')}
        </p>
      )}

      <h3>Zubereitung</h3>
      <ol className="steps">
        {recipe.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      <div className="kid-tip">
        <strong>👧 Das kann das Kind übernehmen</strong>
        <p>{recipe.kidTip}</p>
      </div>
    </Modal>
  )
}
