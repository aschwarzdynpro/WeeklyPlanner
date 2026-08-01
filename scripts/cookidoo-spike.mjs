/**
 * Führt den Cookidoo-Machbarkeitsnachweis aus (`npm run cookidoo:spike`).
 *
 * Ruft die Edge Function `cookidoo` der Reihe nach mit mehreren Aktionen auf
 * und zeigt, was zurückkommt. Am Ende steht die Frage, ob ein Rezept
 * testweise auf einen Tag gelegt werden soll — danach bitte am Thermomix
 * nachsehen, ob es dort ankommt.
 *
 * Passwörter werden abgefragt und bei der Eingabe nicht angezeigt. Sie landen
 * damit weder in der Shell-History noch in einer Datei; das Skript gibt sie
 * ausschließlich an die eigene Edge Function weiter.
 *
 * Voraussetzung: `supabase functions deploy cookidoo --project-ref <ref>`
 */
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'

// --- Konfiguration aus .env.production ---------------------------------------

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

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

// --- Eingaben ----------------------------------------------------------------

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    if (hidden) {
      // Eingabe verdecken: readline schreibt sonst jedes Zeichen mit.
      rl._writeToOutput = (text) => {
        if (text.includes(question)) rl.output.write(question)
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

// --- Aufrufe -----------------------------------------------------------------

async function signIn({ url, key }, email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await response.json()
  if (!response.ok) fail(`Anmeldung an der App fehlgeschlagen: ${data.error_description ?? data.msg}`)
  return data.access_token
}

async function invoke({ url, key }, token, body) {
  const response = await fetch(`${url}/functions/v1/cookidoo`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return { status: response.status, data: JSON.parse(text) }
  } catch {
    return { status: response.status, data: text }
  }
}

/** Zeigt eine Antwort gekürzt an – die Rohdaten sind teilweise sehr groß. */
function show(label, { status, data }) {
  const ok = data?.ok === true
  console.log(`\n${ok ? '✓' : '✖'} ${label}  (HTTP ${status})`)
  if (!ok) {
    console.log('  ', data?.error ?? data)
    if (data?.detail) console.log('   Detail:', data.detail)
    return false
  }
  if (data.session) {
    console.log(`   Sitzung: ${data.session.cookies.join(', ')} (${data.session.dauerMs} ms)`)
  }
  return true
}

// --- Ablauf ------------------------------------------------------------------

const config = readEnv()

console.log('Cookidoo-Machbarkeitsnachweis')
console.log('─'.repeat(60))
console.log('Zuerst die Anmeldung an der eigenen App, danach die an Cookidoo.')
console.log('Passwörter werden nicht angezeigt und nirgends gespeichert.\n')

const appEmail = process.env.APP_EMAIL || (await ask('App-Konto (E-Mail): '))
const appPassword = await ask('App-Passwort: ', { hidden: true })
const token = await signIn(config, appEmail, appPassword)
console.log('✓ An der App angemeldet.')

const email = process.env.COOKIDOO_EMAIL || (await ask('\nCookidoo (E-Mail): '))
const password = await ask('Cookidoo-Passwort: ', { hidden: true })
const language = (await ask('Sprache/Region [de-DE]: ')) || 'de-DE'
const host = (await ask('Cookidoo-Adresse [cookidoo.de]: ')) || 'cookidoo.de'
const tmv = (await ask('Gerät (TM5/TM6/TM7, leer = egal): ')) || undefined

const credentials = { email, password, localization: { language, host } }

// 1. Anmeldung und Abo
const status = await invoke(config, token, { ...credentials, action: 'status' })
if (!show('Anmeldung und Abo-Status', status)) {
  console.log('\nDamit ist der Nachweis gescheitert — siehe Abbruchkriterium in docs/Cookidoo.md.')
  process.exit(1)
}
console.log('   Abo:', JSON.stringify(status.data.subscriptions)?.slice(0, 300))

// 2. Eigene Sammlungen
const collections = await invoke(config, token, { ...credentials, action: 'collections' })
if (show('Eigene Sammlungen', collections)) {
  const managed = collections.data.managed?.managedlists ?? collections.data.managed
  const custom = collections.data.custom?.customlists ?? collections.data.custom
  console.log(`   Kochbücher: ${Array.isArray(managed) ? managed.length : '?'}`)
  console.log(`   Eigene Listen: ${Array.isArray(custom) ? custom.length : '?'}`)
}

// 3. Suche
const query = (await ask('\nSuchbegriff zum Testen [Auflauf]: ')) || 'Auflauf'
const search = await invoke(config, token, { ...credentials, action: 'search', query, tmv })
let candidates = []
if (show(`Suche nach „${query}“`, search)) {
  const result = search.data.result
  candidates = result?.recipes ?? result?.results ?? []
  console.log(`   Treffer: ${result?.total ?? candidates.length}`)
  for (const [i, recipe] of candidates.slice(0, 5).entries()) {
    console.log(`   ${i + 1}. ${recipe.title ?? recipe.name} — ${recipe.id}`)
  }
  if (candidates.length === 0) {
    console.log('   (Keine Treffer im erwarteten Format — Rohantwort:)')
    console.log('  ', JSON.stringify(result)?.slice(0, 500))
  }
}

// 4. Auf den Wochenplan legen — der eigentliche Beweis
const recipeId =
  (await ask('\nRezept-ID zum Einplanen (leer = überspringen): ')) || candidates[0]?.id
if (!recipeId) {
  console.log('\nÜbersprungen. Anmeldung und Lesen funktionieren.')
  process.exit(0)
}
const day = (await ask('Datum (YYYY-MM-DD) [heute]: ')) || new Date().toISOString().slice(0, 10)

const planned = await invoke(config, token, { ...credentials, action: 'plan', recipeId, day })
if (show(`Rezept ${recipeId} auf ${day} legen`, planned)) {
  console.log('  ', planned.data.hinweis)
  console.log('   Wochenplan danach:', JSON.stringify(planned.data.plan)?.slice(0, 400))
}

console.log('\n' + '─'.repeat(60))
console.log('Jetzt am Thermomix nachsehen: Erscheint das Rezept unter „Mein Wochenplan“?')
console.log('Das ist die Frage, die dieser Nachweis beantworten soll.\n')

if ((await ask('Testeintrag wieder entfernen? [j/N]: ')).toLowerCase().startsWith('j')) {
  show('Entfernen', await invoke(config, token, { ...credentials, action: 'unplan', recipeId, day }))
}
