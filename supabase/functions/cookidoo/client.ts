/**
 * Ein schlanker Cookidoo-Client für Deno.
 *
 * Cookidoo hat kein offizielles API. Die hier verwendeten Adressen stammen
 * aus der rekonstruierten Referenzimplementierung
 * https://github.com/miaucl/cookidoo-api (MIT), auf der auch die
 * Home-Assistant-Integration aufsetzt. Sie können sich jederzeit ohne
 * Vorankündigung ändern — alles, was diesen Client benutzt, muss einen
 * Fehlschlag verkraften, ohne die App mitzureißen.
 *
 * Angemeldet wird über den Browser-Flow: Die Anmeldeseite liefert eine
 * `requestId`, die zusammen mit E-Mail und Passwort an den Anmeldedienst
 * geht. Zurück kommen Sitzungs-Cookies — es gibt kein Bearer-Token.
 * Deshalb braucht es hier einen eigenen Cookie-Speicher: `fetch` folgt
 * zwar Weiterleitungen, hebt dabei aber keine Cookies auf.
 */

const CIAM_LOGIN_URL = 'https://ciam.prod.cookidoo.vorwerk-digital.com/login-srv/login'

/** Cookies, ohne die die Anmeldung nicht geklappt hat. */
const REQUIRED_COOKIES = ['_oauth2_proxy', 'v-authenticated']

export interface Localization {
  /** Gastgeber der Regionalausgabe, z. B. "cookidoo.de". */
  host: string
  /** Sprache mit Region, z. B. "de-DE" – steckt in fast jedem Pfad. */
  language: string
}

export const DEFAULT_LOCALIZATION: Localization = {
  host: 'cookidoo.de',
  language: 'de-DE',
}

export class CookidooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'CookidooError'
  }
}

// --- Cookie-Speicher ---------------------------------------------------------

interface StoredCookie {
  value: string
  /** Gastgeber bzw. Domain, für die der Cookie gilt. */
  domain: string
}

/**
 * Minimaler Cookie-Speicher: merkt sich je Name Wert und Domain und gibt
 * für eine Anfrage nur die Cookies heraus, die zum Gastgeber passen.
 * Bewusst kein vollständiges RFC 6265 — es geht um zwei Domains.
 */
export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>()

  store(response: Response, requestUrl: string): void {
    const host = new URL(requestUrl).hostname
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(';')
      const index = pair.indexOf('=')
      if (index < 1) continue
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()

      const domainAttr = attributes
        .map((a) => a.trim())
        .find((a) => a.toLowerCase().startsWith('domain='))
      const domain = domainAttr ? domainAttr.slice(7).replace(/^\./, '') : host

      // Ein leerer Wert ist das Löschen des Cookies.
      if (value === '' || value === '""') this.cookies.delete(name)
      else this.cookies.set(name, { value, domain })
    }
  }

  header(requestUrl: string): string {
    const host = new URL(requestUrl).hostname
    return [...this.cookies.entries()]
      .filter(([, c]) => host === c.domain || host.endsWith(`.${c.domain}`))
      .map(([name, c]) => `${name}=${c.value}`)
      .join('; ')
  }

  has(name: string): boolean {
    return this.cookies.has(name)
  }

  names(): string[] {
    return [...this.cookies.keys()]
  }
}

// --- Anfragen mit Weiterleitungen --------------------------------------------

const MAX_HOPS = 15

/**
 * Führt eine Anfrage aus und folgt Weiterleitungen von Hand, damit die
 * unterwegs gesetzten Cookies erhalten bleiben.
 */
async function followRedirects(
  url: string,
  init: RequestInit,
  jar: CookieJar,
): Promise<{ response: Response; url: string }> {
  let current = url
  let request: RequestInit = { ...init, redirect: 'manual' }

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const cookie = jar.header(current)
    const headers = new Headers(request.headers)
    if (cookie) headers.set('cookie', cookie)

    const response = await fetch(current, { ...request, headers })
    jar.store(response, current)

    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) {
      return { response, url: current }
    }

    // Der Rumpf der Weiterleitung interessiert nicht, muss aber gelesen
    // werden, sonst bleibt die Verbindung offen.
    await response.body?.cancel()
    current = new URL(location, current).toString()
    // Nach einer Weiterleitung wird grundsätzlich mit GET weitergemacht.
    request = { redirect: 'manual' }
  }

  throw new CookidooError('Anmeldung fehlgeschlagen: zu viele Weiterleitungen.')
}

// --- Anmeldung ---------------------------------------------------------------

/**
 * Meldet sich an und liefert den Cookie-Speicher mit der Sitzung.
 * Das Passwort verlässt diese Funktion nicht und wird nirgends protokolliert.
 */
export async function login(
  email: string,
  password: string,
  localization: Localization = DEFAULT_LOCALIZATION,
): Promise<CookieJar> {
  const jar = new CookieJar()
  const { language, host } = localization

  // Schritt 1: Anmeldeseite ansteuern, Weiterleitungen bis zum Anmeldedienst folgen.
  const redirect = encodeURIComponent(`/foundation/${language}/for-you`)
  const start = `https://${host}/profile/${language}/login?redirectAfterLogin=${redirect}`
  const { response: page } = await followRedirects(start, { method: 'GET' }, jar)
  if (!page.ok) {
    throw new CookidooError(
      `Anmeldeseite nicht erreichbar (Status ${page.status}).`,
      page.status,
    )
  }
  const html = await page.text()

  // Schritt 2: Die requestId aus dem Formular herausholen.
  const requestId =
    html.match(/<input[^>]*name=["']requestId["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
    html.match(/<input[^>]*value=["']([0-9a-f-]{36})["'][^>]*name=["']requestId["']/i)?.[1]
  if (!requestId) {
    throw new CookidooError(
      'Anmeldung fehlgeschlagen: Die Anmeldeseite sah anders aus als erwartet ' +
        '(keine requestId gefunden). Vermutlich hat Cookidoo den Ablauf geändert.',
    )
  }

  // Schritt 3: Zugangsdaten abschicken und den Weiterleitungen zurück folgen.
  const body = new URLSearchParams({ requestId, username: email, password })
  await followRedirects(
    CIAM_LOGIN_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    jar,
  )

  // Schritt 4: Sitzung prüfen.
  const missing = REQUIRED_COOKIES.filter((name) => !jar.has(name))
  if (missing.length > 0) {
    throw new CookidooError(
      'Anmeldung fehlgeschlagen — bitte E-Mail und Passwort prüfen. ' +
        `Erwartete Sitzungs-Cookies fehlen: ${missing.join(', ')}.`,
    )
  }
  return jar
}

// --- API-Aufrufe -------------------------------------------------------------

async function call(
  jar: CookieJar,
  method: string,
  url: string,
  options: { accept?: string; json?: unknown } = {},
): Promise<unknown> {
  const headers = new Headers({ accept: options.accept ?? 'application/json' })
  const cookie = jar.header(url)
  if (cookie) headers.set('cookie', cookie)

  const init: RequestInit = { method, headers, redirect: 'manual' }
  if (options.json !== undefined) {
    headers.set('content-type', 'application/json')
    init.body = JSON.stringify(options.json)
  }

  const response = await fetch(url, init)
  jar.store(response, url)

  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel()
    throw new CookidooError('Cookidoo hat die Sitzung abgelehnt.', response.status)
  }
  if (response.status >= 300) {
    const detail = await response.text().catch(() => '')
    throw new CookidooError(
      `Cookidoo antwortete mit Status ${response.status}.`,
      response.status,
      detail.slice(0, 400),
    )
  }
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new CookidooError(
      'Antwort von Cookidoo war kein JSON — vermutlich wurde auf eine Anmeldeseite umgeleitet.',
      response.status,
      text.slice(0, 200),
    )
  }
}

const base = (l: Localization) => `https://${l.host}`

/** Abo-Status; ohne aktives Abo bleiben die Rezepte verschlossen. */
export function getSubscriptions(jar: CookieJar, l = DEFAULT_LOCALIZATION) {
  return call(jar, 'GET', `${base(l)}/ownership/subscriptions`)
}

/** Kochbücher, die dem Konto gehören. */
export function getManagedCollections(jar: CookieJar, l = DEFAULT_LOCALIZATION) {
  return call(jar, 'GET', `${base(l)}/organize/${l.language}/api/managed-list`, {
    accept: 'application/vnd.vorwerk.organize.managed-list.mobile+json',
  })
}

/** Selbst angelegte Listen. */
export function getCustomCollections(jar: CookieJar, l = DEFAULT_LOCALIZATION) {
  return call(jar, 'GET', `${base(l)}/organize/${l.language}/api/custom-list`, {
    accept: 'application/vnd.vorwerk.organize.custom-list.mobile+json',
  })
}

export interface SearchOptions {
  query?: string
  /** Gerätetyp, z. B. "TM6" – filtert auf Rezepte, die das Gerät kann. */
  tmv?: string
  totalTime?: number
  page?: number
  pageSize?: number
}

/**
 * Rezeptsuche. Die Adresse steht nicht in den Konstanten der
 * Referenzimplementierung, sondern wird dort im Code zusammengesetzt:
 * `{host}/search/{sprache-ohne-region}`.
 */
export function searchRecipes(
  jar: CookieJar,
  options: SearchOptions,
  l = DEFAULT_LOCALIZATION,
) {
  const locale = l.language.split('-')[0]
  const params = new URLSearchParams()
  if (options.query) params.set('query', options.query)
  if (options.tmv) params.set('tmv', options.tmv)
  if (options.totalTime) params.set('totalTime', String(options.totalTime))
  if (options.page !== undefined) params.set('page', String(options.page))
  if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize))
  return call(jar, 'GET', `${base(l)}/search/${locale}?${params}`)
}

/** Einzelnes Rezept samt Zutaten und Schritten. */
export function getRecipe(jar: CookieJar, id: string, l = DEFAULT_LOCALIZATION) {
  return call(jar, 'GET', `${base(l)}/recipes/recipe/${l.language}/${id}`)
}

/** Was für die Woche ab `day` (ISO-Datum) geplant ist. */
export function getWeekPlan(jar: CookieJar, day: string, l = DEFAULT_LOCALIZATION) {
  return call(jar, 'GET', `${base(l)}/planning/${l.language}/api/my-week/${day}`)
}

/**
 * Legt Rezepte auf einen Tag in „Mein Wochenplan“ — das ist der Weg zum
 * Gerät: Der Thermomix synchronisiert den Wochenplan von selbst.
 */
export function planRecipes(
  jar: CookieJar,
  day: string,
  recipeIds: string[],
  l = DEFAULT_LOCALIZATION,
) {
  return call(jar, 'PUT', `${base(l)}/planning/${l.language}/api/my-day`, {
    json: { recipeIds, dayKey: day },
  })
}

/** Nimmt ein Rezept wieder vom Tag herunter. */
export function unplanRecipe(
  jar: CookieJar,
  day: string,
  recipeId: string,
  l = DEFAULT_LOCALIZATION,
) {
  return call(
    jar,
    'DELETE',
    `${base(l)}/planning/${l.language}/api/my-day/${day}/recipes/${recipeId}`,
  )
}
