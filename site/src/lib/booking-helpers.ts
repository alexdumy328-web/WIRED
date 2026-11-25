/** Helpers shared across booking confirmation, status lookup, and customer account screens. */

/**
 * Normalizes a customer tracking code input.
 * Accepts 4-character shorthand ("4k7q" -> "NT-4K7Q") and strips whitespace.
 */
export function normalizeBookingCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (!cleaned) return ''
  if (/^[A-Z0-9]{4}$/.test(cleaned)) return `NT-${cleaned}`
  return cleaned
}

/** Shop-timezone YYYY-MM-DD for a Date or ISO timestamp. */
export function shopDayIso(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d)
}

/** True when a customer can still cancel their own booking (> 2 h before a received slot). */
export function canCancelBooking(status: string, slot: string, now: Date = new Date()): boolean {
  if (status !== 'received') return false
  const ms = new Date(slot).getTime() - now.getTime()
  return Number.isFinite(ms) && ms > 2 * 60 * 60 * 1000
}

/** WhatsApp URL with an optional prefilled message. */
export function whatsappUrl(phone: string, text?: string): string {
  const digits = phone.replace(/[^0-9]/g, '')
  const base = `https://wa.me/${digits}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

/** Builds a portable .ics calendar event (1-hour window) for a confirmed booking. */
export function buildBookingIcs(input: {
  code: string
  title: string
  slot: string
  location: string
  description: string
}): string {
  const start = new Date(input.slot)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z')
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Norgelis Tech//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${input.code.toLowerCase()}@norgelistech.ro`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(input.title)}`,
    `LOCATION:${esc(input.location)}`,
    `DESCRIPTION:${esc(input.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function downloadIcs(code: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `norgelis-${code.toLowerCase()}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
