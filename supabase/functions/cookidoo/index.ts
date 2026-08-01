/**
 * Machbarkeitsnachweis für die Cookidoo-Anbindung (Schritt 0 aus docs/Cookidoo.md).
 *
 * Beantwortet die eine Frage, die sich nicht am Schreibtisch klären lässt:
 * Lässt sich der Anmeldeflow außerhalb eines Browsers nachbauen, liefert
 * Cookidoo danach Sammlungen und Suchergebnisse, und erscheint ein auf einen
 * Tag gelegtes Rezept auf dem Thermomix?
 *
 * Bewusst ohne Speicher: Die Zugangsdaten kommen bei jedem Aufruf mit, werden
 * für die Dauer des Aufrufs benutzt und danach vergessen. Nichts landet in der
 * Datenbank, nichts im Protokoll. Erst wenn dieser Nachweis steht, kommt die
 * verschlüsselte Ablage der Sitzung dazu (Schritt 1).
 *
 * Aufruf: siehe scripts/cookidoo-spike.mjs bzw. docs/Cookidoo.md.
 */
import {
  DEFAULT_LOCALIZATION,
  CookidooError,
  getManagedCollections,
  getCustomCollections,
  getRecipe,
  getSubscriptions,
  getWeekPlan,
  login,
  planRecipes,
  searchRecipes,
  unplanRecipe,
} from './client.ts'
import type { Localization } from './client.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

interface Body {
  action?: string
  email?: string
  password?: string
  localization?: Partial<Localization>
  /** Für "search". */
  query?: string
  tmv?: string
  /** Für "plan", "unplan", "week": ISO-Datum "YYYY-MM-DD". */
  day?: string
  /** Für "plan", "unplan", "recipe". */
  recipeId?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405)

  // Die Funktion prüft das JWT der App (Standardeinstellung von Supabase).
  // Ohne Anmeldung an der App kommt hier niemand durch.
  if (!req.headers.get('Authorization')) {
    return json({ error: 'Nicht angemeldet.' }, 401)
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json({ error: 'Kein gültiger JSON-Rumpf.' }, 400)
  }

  const { action = 'status', email, password } = body
  if (!email || !password) {
    return json({ error: 'E-Mail und Passwort werden benötigt.' }, 400)
  }

  const localization: Localization = { ...DEFAULT_LOCALIZATION, ...body.localization }
  const started = Date.now()

  try {
    // Achtung: Zugangsdaten niemals protokollieren.
    const jar = await login(email, password, localization)
    const session = { cookies: jar.names(), dauerMs: Date.now() - started }

    switch (action) {
      case 'status': {
        const subscriptions = await getSubscriptions(jar, localization)
        return json({ ok: true, action, session, subscriptions })
      }

      case 'collections': {
        const [managed, custom] = await Promise.all([
          getManagedCollections(jar, localization),
          getCustomCollections(jar, localization),
        ])
        return json({ ok: true, action, session, managed, custom })
      }

      case 'search': {
        const result = await searchRecipes(
          jar,
          { query: body.query ?? 'Auflauf', tmv: body.tmv, pageSize: 10 },
          localization,
        )
        return json({ ok: true, action, session, result })
      }

      case 'recipe': {
        if (!body.recipeId) return json({ error: 'recipeId fehlt.' }, 400)
        const recipe = await getRecipe(jar, body.recipeId, localization)
        return json({ ok: true, action, session, recipe })
      }

      case 'week': {
        if (!body.day) return json({ error: 'day fehlt (ISO-Datum).' }, 400)
        const plan = await getWeekPlan(jar, body.day, localization)
        return json({ ok: true, action, session, plan })
      }

      case 'plan': {
        if (!body.day || !body.recipeId) {
          return json({ error: 'day und recipeId werden benötigt.' }, 400)
        }
        const written = await planRecipes(jar, body.day, [body.recipeId], localization)
        // Gegenprobe: steht es danach wirklich im Wochenplan?
        const plan = await getWeekPlan(jar, body.day, localization)
        return json({
          ok: true,
          action,
          session,
          written,
          plan,
          hinweis:
            'Wenn das Rezept im Wochenplan steht, holt der Thermomix es sich bei der ' +
            'nächsten Synchronisierung. Bitte am Gerät nachsehen.',
        })
      }

      case 'unplan': {
        if (!body.day || !body.recipeId) {
          return json({ error: 'day und recipeId werden benötigt.' }, 400)
        }
        await unplanRecipe(jar, body.day, body.recipeId, localization)
        const plan = await getWeekPlan(jar, body.day, localization)
        return json({ ok: true, action, session, plan })
      }

      default:
        return json({ error: `Unbekannte Aktion "${action}".` }, 400)
    }
  } catch (err) {
    if (err instanceof CookidooError) {
      return json(
        { ok: false, action, error: err.message, status: err.status, detail: err.detail },
        502,
      )
    }
    // Fehlermeldung durchreichen, aber nichts mitschicken, was Zugangsdaten enthalten könnte.
    return json(
      { ok: false, action, error: err instanceof Error ? err.message : 'Unbekannter Fehler.' },
      500,
    )
  }
})
