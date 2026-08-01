/**
 * Führt den Cookidoo-Machbarkeitsnachweis aus (`npm run cookidoo:spike`).
 *
 * Zwei Betriebsarten:
 *
 *   npm run cookidoo:spike             direkt vom eigenen Rechner aus.
 *                                      Braucht nur Node und ein Cookidoo-Konto.
 *   npm run cookidoo:spike -- --remote über die Edge Function in Supabase.
 *                                      Prüft zusätzlich den Weg, den die App
 *                                      später nimmt (Funktion muss deployt sein).
 *
 * Beide rufen dieselben Schritte auf: anmelden, Abo prüfen, Sammlungen holen,
 * suchen und auf Wunsch ein Rezept auf einen Tag legen. Danach am Thermomix
 * nachsehen, ob es dort ankommt — das ist die eigentliche Frage.
 *
 * Passwörter werden abgefragt und bei der Eingabe nicht angezeigt. Sie landen
 * weder in der Shell-History noch in einer Datei.
 */
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'

const REMOTE = process.argv.includes('--remote')

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

// --- Eingaben ----------------------------------------------------------------

/*
 * Eine einzige readline-Instanz für alle Fragen, dahinter eine kleine
 * Warteschlange. Ohne die gehen Eingaben verloren, sobald sie nicht von der
 * Tastatur kommen, sondern aus einer Pipe: readline meldet dann alle Zeilen
 * auf einmal, und die späteren Fragen haben noch gar keinen Zuhörer.
 */
const rl = createInterface({ input: process.stdin, output: process.stdout })
let hideInput = false
rl._writeToOutput = (text) => {
  if (!hideInput) rl.output.write(text)
}

/** Schon gelesene, noch nicht abgeholte Zeilen. */
const buffered = []
/** Fragen, die auf eine Zeile warten. */
const waiting = []
let inputClosed = false

rl.on('line', (line) => {
  const next = waiting.shift()
  if (next) next(line)
  else buffered.push(line)
})
rl.on('close', () => {
  inputClosed = true
  // Offene Fragen mit der Vorgabe beantworten, statt hängen zu bleiben.
  while (waiting.length) waiting.shift()('')
})

function ask(question, { hidden = false } = {}) {
  process.stdout.write(question)
  return new Promise((resolve) => {
    const finish = (line) => {
      hideInput = false
      if (hidden) process.stdout.write('\n')
      resolve(String(line).trim())
    }
    if (buffered.length > 0) finish(buffered.shift())
    else if (inputClosed) finish('')
    else {
      waiting.push(finish)
      hideInput = hidden
    }
  })
}

function done(code = 0) {
  rl.close()
  process.exit(code)
}

// --- Betriebsart „direkt" ----------------------------------------------------

/**
 * Ruft den Client unmittelbar auf. Die Sitzung wird nach der ersten Anmeldung
 * behalten, damit nicht jede Aktion neu anmeldet.
 */
async function makeLocalRunner(credentials) {
  let client
  try {
    client = await import('../node_modules/.cache/cookidoo-client.mjs')
  } catch {
    fail(
      'Der gebündelte Client fehlt. Bitte über "npm run cookidoo:spike" starten,\n' +
        '  das erzeugt ihn vorher mit esbuild.',
    )
  }

  const localization = credentials.localization
  let jar = null
  const session = async () => {
    if (!jar) jar = await client.login(credentials.email, credentials.password, localization)
    return jar
  }

  return async (action, params = {}) => {
    try {
      const j = await session()
      const meta = { cookies: j.names() }
      switch (action) {
        case 'status':
          return { data: { ok: true, session: meta, subscriptions: await client.getSubscriptions(j, localization) } }
        case 'collections':
          return {
            data: {
              ok: true,
              session: meta,
              managed: await client.getManagedCollections(j, localization),
              custom: await client.getCustomCollections(j, localization),
            },
          }
        case 'search':
          return {
            data: {
              ok: true,
              session: meta,
              result: await client.searchRecipes(
                j,
                { query: params.query, tmv: params.tmv, pageSize: 10 },
                localization,
              ),
            },
          }
        case 'plan': {
          const written = await client.planRecipes(j, params.day, [params.recipeId], localization)
          const plan = await client.getWeekPlan(j, params.day, localization)
          return { data: { ok: true, session: meta, written, plan, hinweis: HINWEIS } }
        }
        case 'unplan':
          await client.unplanRecipe(j, params.day, params.recipeId, localization)
          return { data: { ok: true, session: meta, plan: await client.getWeekPlan(j, params.day, localization) } }
        default:
          return { data: { ok: false, error: `Unbekannte Aktion "${action}".` } }
      }
    } catch (err) {
      return { data: { ok: false, error: err.message, status: err.status, detail: err.detail } }
    }
  }
}

const HINWEIS =
  'Wenn das Rezept im Wochenplan steht, holt der Thermomix es sich bei der ' +
  'nächsten Synchronisierung. Bitte am Gerät nachsehen.'

// --- Betriebsart „über Supabase" ---------------------------------------------

function readEnv() {
  const file = process.env.ENV_FILE ?? '.env.production'
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    fail(`${file} nicht gefunden. Bitte im Projektverzeichnis ausführen.`)
  }
  const values = {}
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match) values[match[1]] = match[2].trim()
  }
  const url = process.env.VITE_SUPABASE_URL ?? values.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? values.VITE_SUPABASE_ANON_KEY
  if (!url || !key) fail('VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt.')
  return { url, key }
}

async function makeRemoteRunner(credentials) {
  const config = readEnv()
  console.log('\nZuerst die Anmeldung an der eigenen App (für den Aufruf der Funktion).')
  const appEmail = process.env.APP_EMAIL || (await ask('App-Konto (E-Mail): '))
  const appPassword = await ask('App-Passwort: ', { hidden: true })

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: config.key, 'content-type': 'application/json' },
    body: JSON.stringify({ email: appEmail, password: appPassword }),
  })
  const auth = await response.json()
  if (!response.ok) fail(`Anmeldung an der App fehlgeschlagen: ${auth.error_description ?? auth.msg}`)
  console.log('✓ An der App angemeldet.')

  return async (action, params = {}) => {
    const res = await fetch(`${config.url}/functions/v1/cookidoo`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        authorization: `Bearer ${auth.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...credentials, action, ...params }),
    })
    const text = await res.text()
    try {
      return { status: res.status, data: JSON.parse(text) }
    } catch {
      return { status: res.status, data: { ok: false, error: text.slice(0, 300) } }
    }
  }
}

// --- Ausgabe -----------------------------------------------------------------

function show(label, { status, data }) {
  const ok = data?.ok === true
  console.log(`\n${ok ? '✓' : '✖'} ${label}${status ? `  (HTTP ${status})` : ''}`)
  if (!ok) {
    console.log('  ', data?.error ?? data)
    if (data?.detail) console.log('   Detail:', String(data.detail).slice(0, 300))
    return false
  }
  if (data.session?.cookies) console.log('   Sitzung:', data.session.cookies.join(', '))
  return true
}

const kurz = (value, max = 400) => JSON.stringify(value)?.slice(0, max) ?? '—'

// --- Ablauf ------------------------------------------------------------------

console.log('Cookidoo-Machbarkeitsnachweis')
console.log('─'.repeat(62))
console.log(
  REMOTE
    ? 'Betriebsart: über die Edge Function in Supabase.'
    : 'Betriebsart: direkt von diesem Rechner (kein Supabase nötig).\n' +
        'Für den Weg über die Edge Function: npm run cookidoo:spike -- --remote',
)
console.log('Passwörter werden nicht angezeigt und nirgends gespeichert.')

const email = process.env.COOKIDOO_EMAIL || (await ask('\nCookidoo (E-Mail): '))
const password = await ask('Cookidoo-Passwort: ', { hidden: true })
const language = (await ask('Sprache/Region [de-DE]: ')) || 'de-DE'
const host = (await ask('Cookidoo-Adresse [cookidoo.de]: ')) || 'cookidoo.de'
const tmv = (await ask('Gerät (TM5/TM6/TM7, leer = egal): ')) || undefined

const credentials = { email, password, localization: { language, host } }
const run = REMOTE ? await makeRemoteRunner(credentials) : await makeLocalRunner(credentials)

// 1. Anmeldung und Abo — hier entscheidet sich alles Weitere.
const status = await run('status')
if (!show('Anmeldung und Abo-Status', status)) {
  console.log('\nDamit ist der Nachweis gescheitert — siehe Abbruchkriterium in docs/Cookidoo.md.')
  done(1)
}
console.log('   Abo:', kurz(status.data.subscriptions, 300))

// 2. Eigene Sammlungen
const collections = await run('collections')
if (show('Eigene Sammlungen', collections)) {
  const managed = collections.data.managed?.managedlists ?? collections.data.managed
  const custom = collections.data.custom?.customlists ?? collections.data.custom
  console.log(`   Kochbücher: ${Array.isArray(managed) ? managed.length : '?'}`)
  console.log(`   Eigene Listen: ${Array.isArray(custom) ? custom.length : '?'}`)
  if (Array.isArray(managed) && managed[0]) console.log('   Beispiel:', kurz(managed[0], 300))
}

// 3. Suche
const query = (await ask('\nSuchbegriff zum Testen [Auflauf]: ')) || 'Auflauf'
const search = await run('search', { query, tmv })
let candidates = []
if (show(`Suche nach „${query}“`, search)) {
  const result = search.data.result
  candidates = result?.recipes ?? result?.results ?? []
  console.log(`   Treffer: ${result?.total ?? candidates.length}`)
  for (const [i, recipe] of candidates.slice(0, 5).entries()) {
    console.log(`   ${i + 1}. ${recipe.title ?? recipe.name} — ${recipe.id}`)
  }
  if (candidates.length === 0) {
    console.log('   (Nichts im erwarteten Format — Rohantwort:)')
    console.log('  ', kurz(result, 600))
  }
}

// 4. Auf den Wochenplan legen — der eigentliche Beweis
const recipeId =
  (await ask('\nRezept-ID zum Einplanen (leer = überspringen): ')) || candidates[0]?.id
if (!recipeId) {
  console.log('\nÜbersprungen. Anmeldung und Lesen funktionieren.')
  done(0)
}
const day = (await ask('Datum (YYYY-MM-DD) [heute]: ')) || new Date().toISOString().slice(0, 10)

const planned = await run('plan', { recipeId, day })
if (show(`Rezept ${recipeId} auf ${day} legen`, planned)) {
  console.log('  ', planned.data.hinweis)
  console.log('   Wochenplan danach:', kurz(planned.data.plan, 500))
}

console.log('\n' + '─'.repeat(62))
console.log('Jetzt am Thermomix nachsehen: Erscheint das Rezept unter „Mein Wochenplan“?')
console.log('(Notfalls am Gerät die Synchronisierung anstoßen.)\n')

if ((await ask('Testeintrag wieder entfernen? [j/N]: ')).toLowerCase().startsWith('j')) {
  show('Entfernen', await run('unplan', { recipeId, day }))
}
done(0)
