import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../types'
import type { Recipe, ShoppingItem, WeekData } from '../types'
import { emptyWeek } from './week'
import { buildShoppingList, formatQty, groupByCategory, roundQty, shoppingListAsText } from './shopping'

const nudeln: Recipe = {
  id: 'nudeln',
  title: 'Nudeln',
  subtitle: '',
  servings: 2,
  minutes: 20,
  tags: [],
  emoji: '🍝',
  kind: 'alltag',
  kidTip: '',
  steps: ['Kochen'],
  ingredients: [
    { name: 'Nudeln', qty: 200, unit: 'g', cat: 'Trockenwaren & Konserven' },
    { name: 'Paprika', qty: 1, unit: 'Stück', cat: 'Obst & Gemüse' },
    { name: 'Salz', qty: null, unit: '', cat: 'Vorrat & Gewürze', pantry: true },
  ],
}

const auflauf: Recipe = {
  ...nudeln,
  id: 'auflauf',
  title: 'Auflauf',
  ingredients: [
    { name: 'Nudeln', qty: 100, unit: 'g', cat: 'Trockenwaren & Konserven' },
    { name: 'Käse', qty: 150, unit: 'g', cat: 'Milchprodukte & Eier' },
  ],
}

const recipes = new Map<string, Recipe>([
  [nudeln.id, nudeln],
  [auflauf.id, auflauf],
])

function weekWith(plan: Partial<Record<keyof WeekData['meals'], string>>): WeekData {
  const week = emptyWeek('2026-07-27', DEFAULT_SETTINGS)
  for (const day of Object.keys(week.meals) as (keyof WeekData['meals'])[]) {
    week.meals[day] = { recipeId: plan[day] ?? null }
  }
  return week
}

describe('roundQty', () => {
  it('rundet kleine Mengen auf Viertel', () => {
    expect(roundQty(0.5)).toBe(0.5)
    expect(roundQty(1.3)).toBe(1.25)
  })

  it('rundet ab zehn auf ganze Zahlen', () => {
    expect(roundQty(133.3333)).toBe(133)
  })
})

describe('formatQty', () => {
  it('schreibt Kommazahlen mit Komma', () => {
    expect(formatQty(1.5, 'Stück')).toBe('1,5 Stück')
  })

  it('nennt fehlende Mengen beim Namen', () => {
    expect(formatQty(null, 'g')).toBe('nach Bedarf')
  })
})

describe('buildShoppingList', () => {
  it('rechnet die Mengen auf die Portionszahl um', () => {
    const list = buildShoppingList(weekWith({ mo: 'nudeln' }), 3, recipes)
    // Rezept für 2 Portionen, gebraucht für 3 → anderthalbfache Menge.
    expect(list.find((i) => i.name === 'Nudeln')?.qty).toBe(300)
  })

  it('zählt gleiche Zutaten aus mehreren Tagen zusammen', () => {
    const list = buildShoppingList(weekWith({ mo: 'nudeln', di: 'auflauf' }), 2, recipes)
    expect(list.filter((i) => i.name === 'Nudeln')).toHaveLength(1)
    expect(list.find((i) => i.name === 'Nudeln')?.qty).toBe(300)
  })

  it('übernimmt Vorratsartikel ohne Menge', () => {
    const list = buildShoppingList(weekWith({ mo: 'nudeln' }), 2, recipes)
    const salz = list.find((i) => i.name === 'Salz')
    expect(salz?.pantry).toBe(true)
    expect(salz?.qty).toBeNull()
  })

  it('behält Haken und selbst ergänzte Artikel beim Neuberechnen', () => {
    const week = weekWith({ mo: 'nudeln' })
    const eigenes: ShoppingItem = {
      id: 'x',
      name: 'Klopapier',
      qty: null,
      unit: '',
      cat: 'Sonstiges',
      checked: false,
      manual: true,
    }
    week.shopping = [
      { ...buildShoppingList(week, 2, recipes)[0], checked: true },
      eigenes,
    ]

    const neu = buildShoppingList(week, 2, recipes)
    expect(neu.find((i) => i.name === 'Nudeln')?.checked).toBe(true)
    expect(neu.find((i) => i.name === 'Klopapier')).toBeDefined()
  })

  it('ignoriert Gerichte, die es nicht mehr gibt', () => {
    expect(buildShoppingList(weekWith({ mo: 'geloescht' }), 2, recipes)).toEqual([])
  })
})

describe('groupByCategory', () => {
  it('sortiert nach Abteilung und lässt leere weg', () => {
    const list = buildShoppingList(weekWith({ mo: 'nudeln', di: 'auflauf' }), 2, recipes)
    const groups = groupByCategory(list).map((g) => g.cat)
    expect(groups).toEqual([
      'Obst & Gemüse',
      'Milchprodukte & Eier',
      'Trockenwaren & Konserven',
      'Vorrat & Gewürze',
    ])
  })
})

describe('shoppingListAsText', () => {
  it('schreibt abgehakte Artikel mit Kreuz', () => {
    const list = buildShoppingList(weekWith({ mo: 'nudeln' }), 2, recipes)
    const text = shoppingListAsText(list.map((i) => ({ ...i, checked: i.name === 'Paprika' })))
    expect(text).toContain('[x] Paprika')
    expect(text).toContain('[ ] Nudeln – 200 g')
  })
})
