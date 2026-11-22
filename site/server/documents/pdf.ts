import { readFile } from 'node:fs/promises'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import QRCode from 'qrcode'
import type { CompanyDetails } from '../admin/settings.ts'

/**
 * Small layout kit for the shop's A4 documents. Archivo is embedded (subset) so Romanian
 * diacritics print correctly; the standard PDF fonts cannot show ș, ț, ă, î or â.
 */

const FONT_FILES = { regular: 'Archivo-Regular.ttf', semibold: 'Archivo-SemiBold.ttf', bold: 'Archivo-ExtraBold.ttf' } as const
type Weight = keyof typeof FONT_FILES

let fontBytes: Promise<Record<Weight, Uint8Array>> | null = null
/** The TTFs sit next to this file in development and next to the bundle on Vercel (scripts/vercel-build.mjs copies them). */
function loadFonts() {
  fontBytes ??= (async () => {
    const entries = await Promise.all(
      (Object.keys(FONT_FILES) as Weight[]).map(async (w) => [w, new Uint8Array(await readFile(new URL(`./fonts/${FONT_FILES[w]}`, import.meta.url)))] as const),
    )
    return Object.fromEntries(entries) as Record<Weight, Uint8Array>
  })().catch((error: unknown) => {
    fontBytes = null
    throw error
  })
  return fontBytes
}

export const INK = rgb(0x15 / 255, 0x17 / 255, 0x1a / 255)
export const MUTED = rgb(0x59 / 255, 0x60 / 255, 0x68 / 255)
export const LINE = rgb(0xd7 / 255, 0xdc / 255, 0xe0 / 255)
export const GOLD = rgb(0x8f / 255, 0x6a / 255, 0x10 / 255)
export const TINT = rgb(0xf6 / 255, 0xf3 / 255, 0xeb / 255)

const A4: [number, number] = [595.28, 841.89]
export const MARGIN = 48

export type Pen = {
  doc: PDFDocument
  page: PDFPage
  fonts: Record<Weight, PDFFont>
  /** Distance from the top of the page, in points. Grows as content is placed. */
  y: number
  readonly width: number
  /** Starts a new page when fewer than `needed` points are left above the footer. */
  ensure(needed: number): void
  text(value: string, opts?: { x?: number; size?: number; weight?: Weight; color?: RGB; width?: number; lineGap?: number; align?: 'left' | 'right' }): number
  rule(opts?: { color?: RGB; thickness?: number; gap?: number }): void
  gap(points: number): void
  /** Label above value, in columns. Returns the tallest column's height. */
  fields(columns: { label: string; value: string }[][], opts?: { gap?: number }): void
  box(x: number, top: number, w: number, h: number, opts?: { fill?: RGB; border?: RGB }): void
}

/** Breaks text into lines that fit `width` at `size`, keeping the author's own line breaks. */
export function wrap(font: PDFFont, value: string, size: number, width: number): string[] {
  const out: string[] = []
  for (const paragraph of value.replace(/\r/g, '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next
        continue
      }
      if (line) out.push(line)
      // A single word wider than the column (a long serial number) is cut by characters.
      let rest = word
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1
        out.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    if (line) out.push(line)
  }
  return out
}

/** Only characters Archivo can draw; anything else (emoji, control characters) becomes a space. */
export function printable(font: PDFFont, value: string): string {
  const supported = new Set(font.getCharacterSet())
  let out = ''
  for (const ch of value.normalize('NFC')) {
    const code = ch.codePointAt(0)!
    if (ch === '\n') out += ch
    // Romanian comma-below letters are what Archivo has; old cedilla forms are mapped onto them.
    else if (code === 0x15f) out += supported.has(0x219) ? 'ș' : 's'
    else if (code === 0x15e) out += supported.has(0x218) ? 'Ș' : 'S'
    else if (code === 0x163) out += supported.has(0x21b) ? 'ț' : 't'
    else if (code === 0x162) out += supported.has(0x21a) ? 'Ț' : 'T'
    else out += supported.has(code) ? ch : ' '
  }
  return out
}

export async function createPen(meta: { title: string; subject: string; author: string }): Promise<Pen> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const bytes = await loadFonts()
  const fonts = {
    regular: await doc.embedFont(bytes.regular, { subset: true }),
    semibold: await doc.embedFont(bytes.semibold, { subset: true }),
    bold: await doc.embedFont(bytes.bold, { subset: true }),
  }
  doc.setTitle(meta.title)
  doc.setSubject(meta.subject)
  doc.setAuthor(meta.author)
  doc.setCreator(meta.author)
  doc.setProducer('Norgelis Tech')
  doc.setLanguage('ro-RO')

  const width = A4[0] - MARGIN * 2
  const pen: Pen = {
    doc,
    page: doc.addPage(A4),
    fonts,
    y: MARGIN,
    width,
    ensure(needed) {
      if (pen.y + needed > A4[1] - MARGIN - 24) {
        pen.page = doc.addPage(A4)
        pen.y = MARGIN
      }
    },
    text(value, opts = {}) {
      const size = opts.size ?? 10
      const font = fonts[opts.weight ?? 'regular']
      const w = opts.width ?? width
      const x = opts.x ?? MARGIN
      const leading = size * 1.35 + (opts.lineGap ?? 0)
      const lines = wrap(font, printable(font, value), size, w)
      for (const line of lines) {
        pen.ensure(leading)
        const lx = opts.align === 'right' ? x + w - font.widthOfTextAtSize(line, size) : x
        pen.page.drawText(line, { x: lx, y: A4[1] - pen.y - size, size, font, color: opts.color ?? INK })
        pen.y += leading
      }
      return lines.length * leading
    },
    rule(opts = {}) {
      const gap = opts.gap ?? 10
      pen.y += gap
      pen.page.drawLine({ start: { x: MARGIN, y: A4[1] - pen.y }, end: { x: A4[0] - MARGIN, y: A4[1] - pen.y }, thickness: opts.thickness ?? 0.75, color: opts.color ?? LINE })
      pen.y += gap
    },
    gap(points) {
      pen.y += points
    },
    fields(rows, opts = {}) {
      for (const row of rows) {
        const colGap = 16
        const colW = (width - colGap * (row.length - 1)) / row.length
        // Measure first so the row moves to the next page as one piece.
        const heights = row.map((c) => 12 + wrap(fonts.semibold, printable(fonts.semibold, c.value || '-'), 10.5, colW).length * 14.2)
        pen.ensure(Math.max(...heights))
        const top = pen.y
        let bottom = top
        row.forEach((c, i) => {
          pen.y = top
          const x = MARGIN + i * (colW + colGap)
          pen.text(c.label.toUpperCase(), { x, size: 7.5, weight: 'semibold', color: MUTED, width: colW })
          pen.text(c.value || '-', { x, size: 10.5, weight: 'semibold', width: colW })
          bottom = Math.max(bottom, pen.y)
        })
        pen.y = bottom + (opts.gap ?? 8)
      }
    },
    box(x, top, w, h, opts = {}) {
      pen.page.drawRectangle({
        x,
        y: A4[1] - top - h,
        width: w,
        height: h,
        ...(opts.fill ? { color: opts.fill } : {}),
        ...(opts.border ? { borderColor: opts.border, borderWidth: 0.75 } : {}),
      })
    },
  }
  return pen
}

/** Draws a QR code as vector squares: sharp at any zoom and in print, no image to embed. */
export function drawQr(pen: Pen, value: string, x: number, top: number, size: number) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const quiet = 2
  const cell = size / (n + quiet * 2)
  pen.box(x, top, size, size, { fill: rgb(1, 1, 1) })
  for (let row = 0; row < n; row += 1) {
    let run = 0
    for (let col = 0; col <= n; col += 1) {
      const dark = col < n && qr.modules.data[row * n + col] === 1
      if (dark) {
        run += 1
        continue
      }
      // Draw each horizontal run of dark modules as one rectangle.
      if (run) pen.box(x + (quiet + col - run) * cell, top + (quiet + row) * cell, run * cell + 0.05, cell + 0.05, { fill: INK })
      run = 0
    }
  }
}

/** Shop name, legal details and the document title, with the number on the right. */
export function header(pen: Pen, company: CompanyDetails, title: string, number: string, date: string) {
  const top = pen.y
  pen.text(company.name || 'Norgelis Tech', { size: 17, weight: 'bold' })
  const legal = [company.cui && `CUI ${company.cui}`, company.regCom && `Reg. Com. ${company.regCom}`].filter(Boolean).join('  ·  ')
  const contact = [company.address, company.phone, company.email].filter(Boolean).join('  ·  ')
  const bank = [company.iban && `IBAN ${company.iban}`, company.bank].filter(Boolean).join('  ·  ')
  for (const line of [legal, contact, bank]) if (line) pen.text(line, { size: 8.5, color: MUTED, width: pen.width * 0.62 })
  const leftBottom = pen.y
  pen.y = top
  const rightW = pen.width * 0.36
  const rightX = MARGIN + pen.width - rightW
  pen.text(title.toUpperCase(), { x: rightX, width: rightW, size: 8, weight: 'semibold', color: GOLD, align: 'right' })
  pen.text(number, { x: rightX, width: rightW, size: 20, weight: 'bold', align: 'right' })
  pen.text(date, { x: rightX, width: rightW, size: 9, color: MUTED, align: 'right' })
  pen.y = Math.max(leftBottom, pen.y)
  pen.rule({ color: INK, thickness: 1.25, gap: 12 })
}

export function sectionTitle(pen: Pen, value: string) {
  pen.ensure(40)
  pen.gap(6)
  pen.text(value, { size: 11, weight: 'bold' })
  pen.gap(4)
}

/** Two signature lines side by side. */
export function signatures(pen: Pen, left: string, right: string) {
  pen.ensure(70)
  pen.gap(28)
  const colW = (pen.width - 40) / 2
  const y = pen.y
  for (const [i, label] of [left, right].entries()) {
    const x = MARGIN + i * (colW + 40)
    pen.page.drawLine({ start: { x, y: A4[1] - y - 30 }, end: { x: x + colW, y: A4[1] - y - 30 }, thickness: 0.75, color: INK })
    pen.y = y + 36
    pen.text(label, { x, width: colW, size: 8.5, color: MUTED })
  }
}

/** Page numbers and a quiet footer line on every page. */
export function footer(pen: Pen, note: string) {
  const pages = pen.doc.getPages()
  pages.forEach((page, i) => {
    const size = 7.5
    const font = pen.fonts.regular
    const label = pages.length > 1 ? `${note}  ·  ${i + 1}/${pages.length}` : note
    page.drawText(printable(font, label), { x: MARGIN, y: MARGIN - 18, size, font, color: MUTED })
  })
}

export function roDate(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(new Date(iso))
}

export function roDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }).format(new Date(iso))
}

/** YYYY-MM-DD shown as DD.MM.YYYY. */
export function roDay(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}`
}
