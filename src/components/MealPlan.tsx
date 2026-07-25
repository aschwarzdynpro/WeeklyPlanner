import { useState } from 'react'
import { DAYS } from '../types'
import type { DayKey, Recipe, Settings, WeekData } from '../types'
import { dateForDay, formatDayDate, toISODate } from '../lib/week'
import { Modal } from './Modal'
import { RecipeSheet } from './RecipeSheet'

interface Props {
  week: WeekData
  settings: Settings
  recipes: Recipe[]
  recipeById: Map<string, Recipe>
  onChange: (mutate: (draft: WeekData) => WeekData) => void
}

export function MealPlan({ week, settings, recipes, recipeById, onChange }: Props) {
  const [openRecipe, setOpenRecipe] = useState<Recipe | null>(null)
  const [picking, setPicking] = useState<DayKey | null>(null)
  const today = toISODate(new Date())

  const setMeal = (day: DayKey, recipeId: string | null, custom?: string) => {
    onChange((draft) => ({
      ...draft,
      meals: { ...draft.meals, [day]: { recipeId, custom } },
    }))
    setPicking(null)
  }

  return (
    <section>
      <p className="section-intro">
        Montag bis Freitag alltagstauglich, am Wochenende etwas Besonderes. Tippe auf ein Gericht für
        das Rezept – oder auf <em>Tauschen</em>, um es zu ersetzen.
      </p>

      <div className="day-grid">
        {DAYS.map((day) => {
          const slot = week.meals[day.key]
          const recipe = slot.recipeId ? recipeById.get(slot.recipeId) : undefined
          const date = dateForDay(week.weekStart, day.key)
          const isToday = toISODate(date) === today
          const weekend = day.key === 'sa' || day.key === 'so'

          return (
            <article
              key={day.key}
              className={`meal-card${weekend ? ' weekend' : ''}${isToday ? ' today' : ''}`}
            >
              <header>
                <span className="day-name">{day.long}</span>
                <span className="day-date">{formatDayDate(date)}</span>
              </header>

              {recipe ? (
                <button className="meal-main" onClick={() => setOpenRecipe(recipe)}>
                  <span className="meal-emoji" aria-hidden="true">
                    {recipe.emoji}
                  </span>
                  <span>
                    <strong>{recipe.title}</strong>
                    <span className="meal-sub">
                      {recipe.subtitle} · {recipe.minutes} Min
                    </span>
                  </span>
                </button>
              ) : (
                <button className="meal-main empty" onClick={() => setPicking(day.key)}>
                  <span className="meal-emoji" aria-hidden="true">
                    ➕
                  </span>
                  <span>
                    <strong>{slot.custom || 'Noch nichts geplant'}</strong>
                    <span className="meal-sub">Gericht auswählen</span>
                  </span>
                </button>
              )}

              <footer>
                <button className="link-btn" onClick={() => setPicking(day.key)}>
                  Tauschen
                </button>
              </footer>
            </article>
          )
        })}
      </div>

      {openRecipe && (
        <RecipeSheet
          recipe={openRecipe}
          servings={settings.servings}
          onClose={() => setOpenRecipe(null)}
        />
      )}

      {picking && (
        <Modal
          title={`${DAYS.find((d) => d.key === picking)?.long}: Gericht wählen`}
          onClose={() => setPicking(null)}
        >
          <div className="picker-list">
            {recipes.map((r) => (
              <button key={r.id} className="picker-item" onClick={() => setMeal(picking, r.id)}>
                <span className="meal-emoji" aria-hidden="true">
                  {r.emoji}
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <span className="meal-sub">
                    {r.minutes} Min · {r.kind === 'wochenende' ? 'Wochenende' : 'Alltag'}
                  </span>
                </span>
              </button>
            ))}
            <button className="picker-item" onClick={() => setMeal(picking, null, 'Reste-Essen')}>
              <span className="meal-emoji" aria-hidden="true">
                🥡
              </span>
              <span>
                <strong>Reste-Essen</strong>
                <span className="meal-sub">Was noch da ist</span>
              </span>
            </button>
            <button className="picker-item" onClick={() => setMeal(picking, null, 'Auswärts essen')}>
              <span className="meal-emoji" aria-hidden="true">
                🍴
              </span>
              <span>
                <strong>Auswärts essen</strong>
                <span className="meal-sub">Kein Einkauf nötig</span>
              </span>
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
