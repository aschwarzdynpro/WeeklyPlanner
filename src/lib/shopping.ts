import { CATEGORIES, DAYS } from '../types'
import type { Category, Recipe, ShoppingItem, WeekData } from '../types'
import { uid } from './week'

/** Menge hübsch runden: 0,5 bleibt 0,5 – 133,3333 wird 133. */
export function roundQty(n: number): number {
  return n >= 10 ? Math.round(n) : Math.round(n * 4) / 4
}

export function formatQty(qty: number | null, unit: string): string {
  if (qty === null) return 'nach Bedarf'
  const value = roundQty(qty)
  const text = Number.isInteger(value) ? String(value) : value.toString().replace('.', ',')
  return unit ? `${text} ${unit}` : text
}

/**
 * Erzeugt die Einkaufsliste aus den geplanten Gerichten der Woche.
 * Gleiche Zutat + gleiche Einheit werden addiert. Bereits abgehakte
 * Positionen und manuell ergänzte Einträge bleiben erhalten.
 */
export function buildShoppingList(
  week: WeekData,
  servings: number,
  recipeById: Map<string, Recipe>,
): ShoppingItem[] {
  const aggregated = new Map<string, ShoppingItem>()

  for (const day of DAYS) {
    const recipeId = week.meals[day.key]?.recipeId
    if (!recipeId) continue
    const recipe = recipeById.get(recipeId)
    if (!recipe) continue
    const factor = servings / recipe.servings

    for (const ing of recipe.ingredients) {
      const key = `${ing.name.toLowerCase()}|${ing.unit}`
      const existing = aggregated.get(key)
      const scaled = ing.qty === null ? null : ing.qty * factor
      if (existing) {
        if (existing.qty !== null && scaled !== null) existing.qty += scaled
      } else {
        aggregated.set(key, {
          id: `auto-${key}`,
          name: ing.name,
          qty: scaled,
          unit: ing.unit,
          cat: ing.cat,
          checked: false,
          pantry: ing.pantry,
        })
      }
    }
  }

  const previous = new Map(week.shopping.map((i) => [i.id, i]))
  const generated = [...aggregated.values()].map((item) => ({
    ...item,
    qty: item.qty === null ? null : roundQty(item.qty),
    checked: previous.get(item.id)?.checked ?? false,
  }))

  const manual = week.shopping.filter((i) => i.manual)
  return [...generated, ...manual]
}

export function makeManualItem(name: string, cat: Category = 'Sonstiges'): ShoppingItem {
  return {
    id: uid(),
    name: name.trim(),
    qty: null,
    unit: '',
    cat,
    checked: false,
    manual: true,
  }
}

/** Nach Kategorie gruppiert, in der Reihenfolge von CATEGORIES. */
export function groupByCategory(items: ShoppingItem[]): { cat: Category; items: ShoppingItem[] }[] {
  return CATEGORIES.map((cat) => ({
    cat,
    items: items.filter((i) => i.cat === cat).sort((a, b) => a.name.localeCompare(b.name, 'de')),
  })).filter((g) => g.items.length > 0)
}

/** Einkaufsliste als Text – zum Kopieren in WhatsApp o. Ä. */
export function shoppingListAsText(items: ShoppingItem[]): string {
  const lines: string[] = ['Einkaufsliste', '']
  for (const group of groupByCategory(items)) {
    lines.push(`${group.cat}:`)
    for (const item of group.items) {
      const qty = item.qty === null && !item.pantry ? '' : ` – ${formatQty(item.qty, item.unit)}`
      lines.push(`  ${item.checked ? '[x]' : '[ ]'} ${item.name}${qty}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}
