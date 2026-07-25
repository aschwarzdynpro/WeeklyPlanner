import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Category, Ingredient, Recipe } from '../types'
import { CATEGORIES } from '../types'
import { RECIPES as BUILTIN_RECIPES } from '../data/recipes'
import { getSupabase } from '../storage/supabase'

/** Rezept aus der Datenbank, inklusive Herkunft und Alter. */
export interface StoredRecipe extends Recipe {
  source: 'ki' | 'eigen'
  createdAt: string
}

interface RecipeRow {
  id: string
  title: string
  subtitle: string
  servings: number
  minutes: number
  emoji: string
  kind: string
  tags: unknown
  ingredients: unknown
  steps: unknown
  kid_tip: string
  source: string
  created_at: string
}

const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)

/** Datenbankzeile in ein Rezept übersetzen – defensiv, die Daten kommen von außen. */
function toRecipe(row: RecipeRow): StoredRecipe | null {
  const rawIngredients = Array.isArray(row.ingredients) ? row.ingredients : []
  const ingredients: Ingredient[] = rawIngredients.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const i = raw as Record<string, unknown>
    if (typeof i.name !== 'string' || !i.name.trim()) return []
    return [
      {
        name: i.name,
        qty: typeof i.qty === 'number' ? i.qty : null,
        unit: typeof i.unit === 'string' ? i.unit : '',
        cat: isCategory(i.cat) ? i.cat : 'Sonstiges',
        ...(i.pantry === true ? { pantry: true as const } : {}),
      },
    ]
  })

  const steps = (Array.isArray(row.steps) ? row.steps : []).filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  )
  if (ingredients.length === 0 || steps.length === 0) return null

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? '',
    servings: row.servings || 3,
    minutes: row.minutes || 30,
    emoji: row.emoji || '🍽️',
    kind: row.kind === 'wochenende' ? 'wochenende' : 'alltag',
    tags: (Array.isArray(row.tags) ? row.tags : []).filter((t): t is string => typeof t === 'string'),
    ingredients,
    steps,
    kidTip: row.kid_tip ?? '',
    source: row.source === 'eigen' ? 'eigen' : 'ki',
    createdAt: row.created_at,
  }
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Führt die mitgelieferte Rezeptbibliothek mit den Rezepten des Haushalts
 * zusammen. Die eingebauten Rezepte funktionieren offline und ohne
 * Datenbank; dazugekommene liegen in Supabase und synchronisieren sich.
 */
export function useRecipes(householdId: string) {
  const [stored, setStored] = useState<StoredRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const sb = getSupabase()
    if (!sb) {
      setLoading(false)
      return
    }
    const { data, error: loadError } = await sb
      .from('recipes')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
    if (loadError) {
      console.warn('Rezepte konnten nicht geladen werden:', loadError.message)
      setLoading(false)
      return
    }
    setStored(((data ?? []) as RecipeRow[]).map(toRecipe).filter((r): r is StoredRecipe => r !== null))
    setLoading(false)
  }, [householdId])

  useEffect(() => {
    void load()
  }, [load])

  // Neue Rezepte vom anderen Gerät erscheinen sofort.
  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    const channel = sb
      .channel(`recipes:${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recipes', filter: `household_id=eq.${householdId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void sb.removeChannel(channel)
    }
  }, [householdId, load])

  const generate = useCallback(
    async (count = 3) => {
      const sb = getSupabase()
      if (!sb) return
      setGenerating(true)
      setError(null)
      try {
        const { data, error: fnError } = await sb.functions.invoke('generate-recipes', {
          body: { count },
        })
        if (fnError) {
          // Die Funktion liefert bei Fehlern eine deutsche Meldung im Body.
          let message = fnError.message
          const context = (fnError as { context?: Response }).context
          if (context && typeof context.json === 'function') {
            try {
              const body = await context.json()
              if (typeof body?.error === 'string') message = body.error
            } catch {
              /* Standardmeldung behalten */
            }
          }
          throw new Error(message)
        }
        if (data?.note) setError(data.note)
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Es hat nicht geklappt.')
      } finally {
        setGenerating(false)
      }
    },
    [load],
  )

  const all = useMemo<Recipe[]>(() => {
    // Bei gleicher id gewinnt das Rezept aus der Datenbank.
    const byId = new Map<string, Recipe>(BUILTIN_RECIPES.map((r) => [r.id, r]))
    for (const r of stored) byId.set(r.id, r)
    return [...byId.values()]
  }, [stored])

  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all])

  const newest = stored[0]?.createdAt
  /** Älter als eine Woche (oder noch nie erzeugt)? Dann lohnt Nachschub. */
  const isStale = !newest || Date.now() - new Date(newest).getTime() > 7 * DAY

  return { all, byId, stored, loading, generating, error, generate, isStale, reload: load }
}

export type RecipeLibrary = ReturnType<typeof useRecipes>
