/**
 * Erzeugt aus der Rezeptbibliothek eine ausdruckbare Markdown-Fassung
 * des Wochenplans (docs/Wochenplan.md).
 *
 *   npm run plan
 */
import { DAYS, CATEGORIES } from '../src/types'
import type { ShoppingItem, WeekData } from '../src/types'
import { RECIPE_BY_ID, DEFAULT_WEEK_PLAN } from '../src/data/recipes'
import { buildShoppingList, formatQty, groupByCategory } from '../src/lib/shopping'

const SERVINGS = 3

const week = {
  weekStart: '2026-01-05',
  meals: Object.fromEntries(DAYS.map((d) => [d.key, { recipeId: DEFAULT_WEEK_PLAN[d.key] }])),
  events: [],
  bedtime: {},
  shopping: [] as ShoppingItem[],
  updatedAt: '',
} as unknown as WeekData

const out: string[] = []
const w = (line = '') => out.push(line)

w('# Familien-Wochenplan')
w()
w(`Für ${SERVINGS} Portionen (2 Erwachsene + 1 Kind). Erzeugt aus der Rezeptbibliothek der App —`)
w('nicht von Hand bearbeiten, sondern `npm run plan` neu ausführen.')
w()

w('## Übersicht')
w()
w('| Tag | Gericht | Zeit |')
w('| --- | --- | --- |')
for (const day of DAYS) {
  const recipe = RECIPE_BY_ID.get(DEFAULT_WEEK_PLAN[day.key])
  if (!recipe) continue
  w(`| **${day.long}** | ${recipe.emoji} ${recipe.title} | ${recipe.minutes} Min |`)
}
w()

w('## Rezepte')
w()
for (const day of DAYS) {
  const recipe = RECIPE_BY_ID.get(DEFAULT_WEEK_PLAN[day.key])
  if (!recipe) continue
  const factor = SERVINGS / recipe.servings
  w(`### ${day.long}: ${recipe.emoji} ${recipe.title}`)
  w()
  w(`*${recipe.subtitle}* · ${recipe.minutes} Minuten · ${recipe.tags.join(', ')}`)
  w()
  w('**Zutaten**')
  w()
  for (const ing of recipe.ingredients.filter((i) => !i.pantry)) {
    w(`- ${formatQty(ing.qty === null ? null : ing.qty * factor, ing.unit)} ${ing.name}`)
  }
  const pantry = recipe.ingredients.filter((i) => i.pantry).map((i) => i.name)
  if (pantry.length) {
    w()
    w(`Aus dem Vorrat: ${pantry.join(', ')}`)
  }
  w()
  w('**Zubereitung**')
  w()
  recipe.steps.forEach((step, i) => w(`${i + 1}. ${step}`))
  w()
  w(`> 👧 **Für das Kind:** ${recipe.kidTip}`)
  w()
}

w('## Einkaufsliste für die ganze Woche')
w()
w('Zusammengezählt aus allen sieben Gerichten.')
w()
const list = buildShoppingList(week, SERVINGS)
for (const group of groupByCategory(list)) {
  if (group.cat === ('Vorrat & Gewürze' as (typeof CATEGORIES)[number])) continue
  w(`**${group.cat}**`)
  w()
  for (const item of group.items) w(`- [ ] ${item.name} — ${formatQty(item.qty, item.unit)}`)
  w()
}
const pantryItems = list.filter((i) => i.pantry)
if (pantryItems.length) {
  w('**Vorrat prüfen**')
  w()
  w(pantryItems.map((i) => i.name).join(', '))
  w()
}

console.log(out.join('\n'))
