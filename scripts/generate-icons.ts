/**
 * Erzeugt die App-Icons unter public/icons (`npm run icons`).
 *
 * Warum ein Skript und keine fertigen Bilddateien: Das Icon ist ein paar
 * Rechtecke und Kreise in den Farben der App. Als Code lässt es sich
 * nachvollziehen und anpassen, ohne ein Grafikprogramm zu öffnen — und die
 * Ergebnisse bleiben bei jedem Lauf identisch.
 *
 * PNG wird von Hand geschrieben, damit das Projekt keine Bildbibliothek
 * braucht: ein PNG ist ein zlib-gepackter Strom aus Bildzeilen, und zlib
 * bringt Node mit. Gezeichnet wird in vierfacher Auflösung und danach
 * heruntergerechnet — das ergibt die weichen Kanten.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// --- Farben (die der App, siehe src/styles.css) ------------------------------

const ACCENT = '#d97b3a'
const ACCENT_DARK = '#c2661f'
const PAPER = '#fffaf3'
const DOT = '#e6dbcd'

type RGB = [number, number, number]

function rgb(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

// --- Zeichenfläche -----------------------------------------------------------

/** Die Zeichnung entsteht in diesem Koordinatensystem und wird danach skaliert. */
const GRID = 1000

class Canvas {
  readonly size: number
  /** RGBA, je Kanal 0…255. */
  readonly data: Float32Array

  constructor(size: number) {
    this.size = size
    this.data = new Float32Array(size * size * 4)
  }

  private plot(x: number, y: number, color: RGB): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return
    const i = (y * this.size + x) * 4
    this.data[i] = color[0]
    this.data[i + 1] = color[1]
    this.data[i + 2] = color[2]
    this.data[i + 3] = 255
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGB): void {
    for (let py = Math.round(y); py < Math.round(y + h); py += 1) {
      for (let px = Math.round(x); px < Math.round(x + w); px += 1) this.plot(px, py, color)
    }
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number, color: RGB): void {
    const radius = Math.min(r, w / 2, h / 2)
    for (let py = Math.round(y); py < Math.round(y + h); py += 1) {
      for (let px = Math.round(x); px < Math.round(x + w); px += 1) {
        // Nur in den vier Ecken muss überhaupt gerundet werden.
        const dx = Math.max(x + radius - px, px - (x + w - 1 - radius), 0)
        const dy = Math.max(y + radius - py, py - (y + h - 1 - radius), 0)
        if (dx * dx + dy * dy <= radius * radius) this.plot(px, py, color)
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, color: RGB): void {
    for (let py = Math.round(cy - r); py <= Math.round(cy + r); py += 1) {
      for (let px = Math.round(cx - r); px <= Math.round(cx + r); px += 1) {
        const dx = px - cx
        const dy = py - cy
        if (dx * dx + dy * dy <= r * r) this.plot(px, py, color)
      }
    }
  }

  /** Mittelt je `factor`×`factor` Punkte zu einem – daher die weichen Kanten. */
  downsample(factor: number): { size: number; rgba: Uint8Array } {
    const size = this.size / factor
    const out = new Uint8Array(size * size * 4)
    const samples = factor * factor
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        for (let sy = 0; sy < factor; sy += 1) {
          for (let sx = 0; sx < factor; sx += 1) {
            const i = ((y * factor + sy) * this.size + (x * factor + sx)) * 4
            const alpha = this.data[i + 3] / 255
            r += this.data[i] * alpha
            g += this.data[i + 1] * alpha
            b += this.data[i + 2] * alpha
            a += alpha
          }
        }
        const j = (y * size + x) * 4
        // Farbe über die deckenden Anteile mitteln, sonst werden Kanten grau.
        out[j] = a > 0 ? Math.round(r / a) : 0
        out[j + 1] = a > 0 ? Math.round(g / a) : 0
        out[j + 2] = a > 0 ? Math.round(b / a) : 0
        out[j + 3] = Math.round((a / samples) * 255)
      }
    }
    return { size, rgba: out }
  }
}

// --- Das Motiv: ein Kalenderblatt --------------------------------------------

interface Options {
  /** Anteil der Fläche, den das Motiv einnimmt (maskierbare Icons brauchen Luft). */
  inset: number
  /** Eckenradius des Hintergrunds, im Raster von 1000. */
  corner: number
}

function drawIcon(canvas: Canvas, { inset, corner }: Options): void {
  // Der Hintergrund geht immer bis an den Rand – bei maskierbaren Icons
  // schneidet das System seine Form daraus, und ein Rand würde mitwandern.
  canvas.fillRoundRect(
    0,
    0,
    canvas.size,
    canvas.size,
    (corner * canvas.size) / GRID,
    rgb(ACCENT),
  )

  // Das Motiv sitzt mittig; `inset` hält es aus dem Bereich heraus, den die
  // Maske abschneiden könnte.
  const scale = (canvas.size / GRID) * inset
  const offset = (canvas.size * (1 - inset)) / 2
  const u = (value: number) => offset + value * scale

  // Aufhängung oben
  canvas.fillRoundRect(u(322), u(148), 62 * scale, 130 * scale, 31 * scale, rgb(PAPER))
  canvas.fillRoundRect(u(616), u(148), 62 * scale, 130 * scale, 31 * scale, rgb(PAPER))

  // Kalenderblatt
  canvas.fillRoundRect(u(170), u(232), 660 * scale, 600 * scale, 64 * scale, rgb(PAPER))

  // Kopfband; der zweite Aufruf begradigt die unteren beiden Ecken wieder.
  canvas.fillRoundRect(u(170), u(232), 660 * scale, 150 * scale, 64 * scale, rgb(ACCENT_DARK))
  canvas.fillRect(u(170), u(320), 660 * scale, 62 * scale, rgb(ACCENT_DARK))

  // Sechs Tage – einer ist der heutige.
  const columns = [320, 500, 680]
  const rows = [540, 700]
  rows.forEach((cy, rowIndex) => {
    columns.forEach((cx, columnIndex) => {
      const today = rowIndex === 0 && columnIndex === 1
      canvas.fillCircle(u(cx), u(cy), 52 * scale, rgb(today ? ACCENT : DOT))
    })
  })
}

// --- PNG schreiben -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePNG(size: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // 8 Bit je Kanal
  header[9] = 6 // RGBA
  // Zeilen tragen je ein führendes Filter-Byte; 0 heißt "unverändert".
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Lauf --------------------------------------------------------------------

const SUPERSAMPLE = 4

function write(file: string, size: number, options: Options): void {
  const canvas = new Canvas(size * SUPERSAMPLE)
  drawIcon(canvas, options)
  const { size: outSize, rgba } = canvas.downsample(SUPERSAMPLE)
  writeFileSync(file, encodePNG(outSize, rgba))
  console.log(`${file} (${outSize}×${outSize})`)
}

// Bezogen auf das Projektverzeichnis, nicht auf die Datei: `npm run icons`
// bündelt das Skript vorher nach node_modules/.cache.
const iconDir = resolve(process.cwd(), 'public', 'icons')
mkdirSync(iconDir, { recursive: true })

// Normale Icons: abgerundetes Quadrat, wie es auf dem Startbildschirm liegt.
write(resolve(iconDir, 'icon-192.png'), 192, { inset: 1, corner: 220 })
write(resolve(iconDir, 'icon-512.png'), 512, { inset: 1, corner: 220 })

// Maskierbar: Android schneidet daraus eigene Formen (Kreis, Tropfen …).
// Deshalb randlos füllen und das Motiv in den sicheren inneren Bereich legen.
write(resolve(iconDir, 'icon-maskable-512.png'), 512, { inset: 0.85, corner: 0 })

// iOS nimmt nicht die Icons aus dem Manifest, sondern das apple-touch-icon,
// und rundet die Ecken selbst — hier also ein volles Quadrat.
write(resolve(iconDir, 'apple-touch-icon.png'), 180, { inset: 1, corner: 0 })
