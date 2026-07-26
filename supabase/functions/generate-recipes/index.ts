/**
 * Erzeugt neue Familienrezepte mit Claude und legt sie im Haushalt ab.
 *
 * Aufruf aus der App:
 *   supabase.functions.invoke('generate-recipes', { body: { count: 3 } })
 *
 * Der Aufruf läuft mit dem JWT des angemeldeten Nutzers. Der Haushalt wird
 * daraus abgeleitet – die App kann also keinen fremden Haushalt angeben,
 * und Row Level Security schützt das Schreiben zusätzlich.
 */
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CATEGORIES = [
  'Obst & Gemüse',
  'Fleisch & Fisch',
  'Milchprodukte & Eier',
  'Trockenwaren & Konserven',
  'Backwaren',
  'Tiefkühl',
  'Vorrat & Gewürze',
  'Sonstiges',
] as const

/**
 * Titel der mitgelieferten Rezepte (src/data/recipes.ts). Die liegen im
 * Frontend und nicht in der Datenbank – damit Claude sie trotzdem nicht
 * noch einmal vorschlägt, stehen sie hier. Beim Ergänzen der Bibliothek
 * also auch hier nachtragen.
 */
const BUILTIN_TITLES = [
  'Ofengemüse mit Kartoffelspalten & Kräuterquark',
  'Vollkorn-Spaghetti mit Gemüse-Bolognese',
  'Ofen-Lachs mit Reis & Brokkoli',
  'Hähnchen-Gemüse-Pfanne mit Couscous',
  'Mini-Pizzen vom Blech mit buntem Salat',
  'Selbstgemachte Burger mit Ofen-Wedges & Krautsalat',
  'Ofen-Hähnchen mit Rosmarinkartoffeln & Apfelcrumble',
  'Mildes Kartoffel-Linsen-Curry mit Naan',
  'Gemüse-Pfannkuchen mit Apfelmus',
  'Ofen-Frikadellen mit Kartoffelpüree & Erbsen',
]

/**
 * Zutaten-Vokabular der mitgelieferten Rezepte, als "Name | Einheit".
 *
 * Die Einkaufsliste zählt nur zusammen, was exakt gleich heißt und dieselbe
 * Einheit hat. Ohne diese Liste schreibt Claude "Paprika", die Bibliothek
 * sagt "Paprika (rot/gelb)" – und im Wagen stehen zwei Zeilen für dasselbe
 * Gemüse. Neu erfundene Zutaten sind erlaubt, bekannte sollen aber die
 * vorhandene Schreibweise übernehmen.
 *
 * Erzeugt aus src/data/recipes.ts; beim Ergänzen der Bibliothek nachziehen.
 */
const BUILTIN_INGREDIENTS = [
  'Äpfel | Stück',
  'Apfelmus | Glas',
  'Basmatireis | g',
  'Brauner Zucker | g',
  'Brokkoli | g',
  'Burger-Buns (Vollkorn) | Stück',
  'Butter | g',
  'Champignons | g',
  'Cheddar-Scheiben | Scheiben',
  'Cherrytomaten | g',
  'Couscous | g',
  'Crème fraîche | g',
  'Dill | Bund',
  'Dinkelmehl Type 630 | g',
  'Dinkelvollkornmehl | g',
  'Eier | Stück',
  'Erbsen (TK) | g',
  'Gekochter Schinken | g',
  'Gemischtes Hackfleisch | g',
  'Geriebener Käse (Mozzarella/Gouda) | g',
  'Haferflocken | g',
  'Hähnchen ganz (ca. 1,4 kg) | Stück',
  'Hähnchenbrustfilet | g',
  'Karotten | Stück',
  'Kartoffeln (festkochend) | g',
  'Kartoffeln (mehligkochend) | g',
  'Knoblauchzehe | Stück',
  'Kokosmilch | ml',
  'Lachsfilet ohne Haut | g',
  'Magerquark | g',
  'Mais (Dose) | Dose',
  'Milch | ml',
  'Naan-Brot | Stück',
  'Naturjoghurt | g',
  'Paprika (rot/gelb) | Stück',
  'Parmesan am Stück | g',
  'Passierte Tomaten | g',
  'Petersilie | Bund',
  'Rinderhackfleisch | g',
  'Romanasalat | Kopf',
  'Rosmarin | Zweige',
  'Rote Linsen | g',
  'Rote Zwiebel | Stück',
  'Salatblätter | Kopf',
  'Salatgurke | Stück',
  'Schnittlauch | Bund',
  'Semmelbrösel | g',
  'Staudensellerie | Stange',
  'Tomaten | Stück',
  'Tomatenmark | EL',
  'Trockenhefe | Päckchen',
  'Vanillesauce | Packung',
  'Vollkorn-Spaghetti | g',
  'Weißkohl | g',
  'Weizenmehl | g',
  'Zitrone | Stück',
  'Zucchini | Stück',
  'Zwiebel | Stück',
]

/**
 * Vorratsartikel der Bibliothek. Die stehen ohne Menge unter „Vorrat prüfen“,
 * doppeln sich aber genauso, wenn Claude „Gemüsebrühe“ statt
 * „Gemüsebrühe (Pulver)“ schreibt.
 */
const BUILTIN_PANTRY = [
  'Currypulver mild',
  'Essig',
  'Gemüsebrühe (Pulver)',
  'Honig',
  'Ketchup',
  'Kreuzkümmel gemahlen',
  'Mayonnaise',
  'Mittelscharfer Senf',
  'Muskatnuss',
  'Olivenöl',
  'Oregano getrocknet',
  'Paprikapulver edelsüß',
  'Pfeffer',
  'Salz',
  'Zimt',
]

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'title',
          'subtitle',
          'servings',
          'minutes',
          'emoji',
          'kind',
          'tags',
          'ingredients',
          'steps',
          'kidTip',
        ],
        properties: {
          id: {
            type: 'string',
            description: 'Kurzer Bezeichner aus Kleinbuchstaben und Bindestrichen, z. B. "linsen-bolognese".',
          },
          title: { type: 'string', description: 'Name des Gerichts auf Deutsch.' },
          subtitle: { type: 'string', description: 'Ein kurzer Satz, warum das Gericht in den Familienalltag passt.' },
          servings: { type: 'integer', description: 'Portionen, auf die sich die Mengen beziehen. Immer 3.' },
          minutes: { type: 'integer', description: 'Zubereitungszeit in Minuten.' },
          emoji: { type: 'string', description: 'Ein einzelnes Emoji, das zum Gericht passt.' },
          kind: {
            type: 'string',
            enum: ['alltag', 'wochenende'],
            description: '"alltag" für Montag bis Freitag, "wochenende" für etwas Aufwändigeres.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Zwei bis vier kurze Schlagworte, z. B. "vegetarisch", "eine Pfanne".',
          },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'qty', 'unit', 'cat', 'pantry'],
              properties: {
                name: { type: 'string', description: 'Zutat auf Deutsch, ohne Mengenangabe.' },
                qty: { type: 'number', description: 'Menge für die angegebenen Portionen. Bei Vorratsartikeln 0.' },
                unit: {
                  type: 'string',
                  description: 'Einheit, z. B. "g", "ml", "Stück", "Bund". Bei Vorratsartikeln leer.',
                },
                cat: { type: 'string', enum: [...CATEGORIES], description: 'Abteilung im Supermarkt.' },
                pantry: {
                  type: 'boolean',
                  description: 'true für Vorratsartikel wie Salz, Öl oder Gewürze, die man nicht abwiegt.',
                },
              },
            },
          },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Arbeitsschritte in sinnvoller Reihenfolge, je ein vollständiger Satz.',
          },
          kidTip: {
            type: 'string',
            description: 'Was ein sechsjähriges Kind sicher mitmachen kann.',
          },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `Du entwickelst Abendessen für eine Familie mit zwei Erwachsenen und einem sechsjährigen Kind.

Was zählt:
- Alltagstauglich: Montag bis Freitag höchstens 35 Minuten, überschaubare Zutatenliste, normale Supermarkt-Zutaten.
- Ausgewogen: viel Gemüse, sinnvolle Kohlenhydrate, nicht jeden Tag Fleisch.
- Kindgerecht: mild gewürzt, nichts Scharfes, vertraute Texturen. Gemüse darf versteckt sein.
- Ehrlich: Mengen müssen für drei Portionen realistisch sein, Schritte müssen tatsächlich funktionieren.

Mengen und Einheiten:
- Immer für 3 Portionen.
- Zähle in "Stück", was man einzeln kauft (Paprika, Zwiebeln, Zitronen, Karotten). Wiege in Gramm, was lose verkauft wird (Hackfleisch, Kartoffeln, Nudeln).
- Salz, Pfeffer, Öl, Essig, Gewürze und Brühe sind Vorratsartikel: pantry auf true, qty auf 0, unit leer.
- Verwende für gleiche Zutaten immer dieselbe Schreibweise und Einheit, damit die Einkaufsliste sie zusammenzählen kann. Steht eine Zutat in der mitgeschickten Liste bekannter Zutaten, übernimm Name und Einheit daraus wortgleich – auch wenn dir eine andere Bezeichnung geläufiger wäre. Nur wirklich neue Zutaten bekommen einen neuen Namen.

Schreibe auf Deutsch, in ganzen Sätzen, ohne Werbesprache.`

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

/** Bezeichner säubern, damit er als Primärschlüssel taugt. */
function slugify(raw: string, fallback: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return cleaned || fallback
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

interface GeneratedRecipe {
  id: string
  title: string
  subtitle: string
  servings: number
  minutes: number
  emoji: string
  kind: 'alltag' | 'wochenende'
  tags: string[]
  ingredients: { name: string; qty: number; unit: string; cat: string; pantry: boolean }[]
  steps: string[]
  kidTip: string
}

/** Technische Fehlermeldungen in etwas übersetzen, das im Rezept-Tab Sinn ergibt. */
function readableError(detail: string): string {
  if (detail.includes('credit balance is too low')) {
    return 'Das Anthropic-Konto hat kein Guthaben mehr. Unter console.anthropic.com → Plans & Billing aufladen.'
  }
  if (detail.includes('authentication_error') || detail.includes('invalid x-api-key')) {
    return 'Der hinterlegte ANTHROPIC_API_KEY wird nicht akzeptiert. Bitte in Supabase prüfen.'
  }
  if (detail.includes('rate_limit')) {
    return 'Gerade zu viele Anfragen bei Anthropic. In ein paar Minuten noch einmal versuchen.'
  }
  return `Die Rezept-Erzeugung ist fehlgeschlagen: ${detail}`
}

/** Prüft, ob ein Rezept brauchbar ist – die KI kann sich irren. */
function isUsable(r: GeneratedRecipe): boolean {
  return (
    typeof r.title === 'string' &&
    r.title.trim().length > 0 &&
    Array.isArray(r.ingredients) &&
    r.ingredients.length >= 3 &&
    Array.isArray(r.steps) &&
    r.steps.length >= 2 &&
    Number.isFinite(r.minutes) &&
    r.minutes >= 5 &&
    r.minutes <= 300
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json(
      {
        error:
          'Der Rezept-Dienst ist noch nicht eingerichtet: In Supabase fehlt das Secret ANTHROPIC_API_KEY.',
      },
      503,
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Nicht angemeldet.' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  // Haushalt aus dem Token ableiten – nicht aus dem Request-Body.
  const { data: household, error: householdError } = await supabase.rpc('get_household')
  if (householdError) return json({ error: householdError.message }, 400)
  if (!household) return json({ error: 'Kein Haushalt gefunden.' }, 400)

  let count = 3
  try {
    const body = await req.json()
    if (Number.isFinite(body?.count)) count = Math.min(5, Math.max(1, Math.trunc(body.count)))
  } catch {
    // Kein oder ungültiger Body – Standardwert behalten.
  }

  // Was es schon gibt, damit sich nichts wiederholt.
  const { data: existing, error: existingError } = await supabase
    .from('recipes')
    .select('id, title, ingredients')
    .eq('household_id', household)
  if (existingError) return json({ error: existingError.message }, 400)

  const knownTitles = [...BUILTIN_TITLES, ...(existing ?? []).map((r) => r.title)]
  const knownIds = new Set((existing ?? []).map((r) => r.id))
  const knownTitleSet = new Set(knownTitles.map(norm))

  // Zutaten-Vokabular: eingebaute Rezepte plus alles, was schon erzeugt wurde.
  // So bleibt die Schreibweise auch über viele Runden hinweg einheitlich.
  const vocabulary = new Map<string, string>()
  for (const entry of BUILTIN_INGREDIENTS) {
    const [name, unit] = entry.split(' | ')
    vocabulary.set(norm(name), `${name} | ${unit ?? ''}`)
  }
  const pantryVocabulary = new Map<string, string>()
  for (const name of BUILTIN_PANTRY) pantryVocabulary.set(norm(name), name)
  for (const recipe of existing ?? []) {
    for (const i of (recipe.ingredients ?? []) as { name?: string; unit?: string; pantry?: boolean }[]) {
      if (!i.name) continue
      const target = i.pantry ? pantryVocabulary : vocabulary
      if (target.has(norm(i.name))) continue
      target.set(norm(i.name), i.pantry ? i.name : `${i.name} | ${i.unit ?? ''}`)
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, 'de')
  const knownIngredients = [...vocabulary.values()].sort(byName)
  const knownPantry = [...pantryVocabulary.values()].sort(byName)

  const anthropic = new Anthropic({ apiKey })

  const request = {
    model: 'claude-opus-5',
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: 'medium' as const,
      format: { type: 'json_schema' as const, schema: RECIPE_SCHEMA },
    },
    messages: [
      {
        role: 'user' as const,
        content: `Entwickle ${count} neue Abendessen für diese Familie.

Diese Gerichte gibt es schon – schlage nichts vor, was einem davon ähnelt:
${knownTitles.map((t) => `- ${t}`).join('\n')}

Sorge für Abwechslung gegenüber der bestehenden Liste: andere Hauptzutaten, andere Zubereitungsart, andere Küche. Mindestens eines der Gerichte soll vegetarisch sein.

Diese Zutaten kommen in der Bibliothek bereits vor, jeweils als "Name | Einheit". Verwendest du eine davon, schreibe sie genau so – die Einkaufsliste zählt nur zusammen, was wortgleich ist:
${knownIngredients.join('\n')}

Und diese Vorratsartikel (pantry) sind schon benannt – auch hier die vorhandene Schreibweise übernehmen:
${knownPantry.join('\n')}`,
      },
    ],
  }

  let message
  try {
    // Refusal-Fallback: Wird eine Anfrage von den Sicherheitsfiltern
    // abgelehnt, beantwortet ein anderes Modell sie serverseitig.
    const stream = anthropic.beta.messages.stream({
      ...request,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as never)
    message = await stream.finalMessage()
  } catch (err) {
    // Ist das Fallback-Beta für die Organisation nicht freigeschaltet,
    // ohne Fallback weiterversuchen. Bei allen anderen Fehlern (Guthaben,
    // Key, Rate Limit) hilft ein zweiter Versuch nicht – dann gleich melden.
    const detail = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number })?.status
    const betaProblem =
      status === 400 && (detail.includes('fallback') || detail.includes('beta'))
    if (!betaProblem) {
      console.error('Claude-Aufruf fehlgeschlagen:', detail)
      return json({ error: readableError(detail) }, 502)
    }
    try {
      const stream = anthropic.messages.stream(request as never)
      message = await stream.finalMessage()
    } catch (err2) {
      const detail2 = err2 instanceof Error ? err2.message : String(err2)
      console.error('Claude-Aufruf ohne Fallback fehlgeschlagen:', detail2)
      return json({ error: readableError(detail2) }, 502)
    }
  }

  if (message.stop_reason === 'refusal') {
    return json({ error: 'Die Anfrage wurde abgelehnt. Bitte versuche es später erneut.' }, 502)
  }

  const text = message.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')

  let parsed: { recipes?: GeneratedRecipe[] }
  try {
    parsed = JSON.parse(text)
  } catch {
    console.error('Antwort war kein gültiges JSON:', text.slice(0, 500))
    return json({ error: 'Die Antwort konnte nicht gelesen werden. Bitte noch einmal versuchen.' }, 502)
  }

  const candidates = (parsed.recipes ?? []).filter(isUsable)
  const rows: Record<string, unknown>[] = []
  const usedIds = new Set(knownIds)

  for (const [index, r] of candidates.entries()) {
    if (knownTitleSet.has(norm(r.title))) continue // Dublette

    let id = slugify(r.id ?? '', `rezept-${Date.now()}-${index}`)
    while (usedIds.has(id)) id = `${id}-2`
    usedIds.add(id)

    rows.push({
      id,
      household_id: household,
      title: r.title.trim(),
      subtitle: (r.subtitle ?? '').trim(),
      servings: 3,
      minutes: Math.round(r.minutes),
      emoji: [...(r.emoji ?? '🍽️')][0] ?? '🍽️',
      kind: r.kind === 'wochenende' ? 'wochenende' : 'alltag',
      tags: (r.tags ?? []).slice(0, 4),
      // Vorratsartikel bekommen keine Menge – die App zeigt "nach Bedarf".
      ingredients: r.ingredients.map((i) => ({
        name: i.name.trim(),
        qty: i.pantry ? null : i.qty,
        unit: i.pantry ? '' : (i.unit ?? '').trim(),
        cat: (CATEGORIES as readonly string[]).includes(i.cat) ? i.cat : 'Sonstiges',
        ...(i.pantry ? { pantry: true } : {}),
      })),
      steps: r.steps.map((s) => s.trim()).filter(Boolean),
      kid_tip: (r.kidTip ?? '').trim(),
      source: 'ki',
    })
  }

  if (rows.length === 0) {
    return json({ recipes: [], note: 'Es kam nichts Neues dabei heraus. Bitte noch einmal versuchen.' })
  }

  const { data: inserted, error: insertError } = await supabase
    .from('recipes')
    .insert(rows)
    .select()
  if (insertError) return json({ error: insertError.message }, 400)

  return json({ recipes: inserted })
})
