/** Shop-local dates (Europe/Bucharest). Slots are stored as UTC ISO strings. */
const ZONE = 'Europe/Bucharest'
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** YYYY-MM-DD in the shop's time zone for an ISO instant. */
export function localDate(iso: string | number | Date): string {
  return dateFmt.format(new Date(iso))
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** First instant (ISO, UTC) of a shop-local day. */
export function startOfLocalDay(date: string): string {
  let t = Date.parse(`${date}T00:00:00.000Z`) - 4 * 3600_000
  for (let i = 0; i < 24 * 4 && localDate(t) < date; i += 1) t += 15 * 60_000
  return new Date(t).toISOString()
}

/** Monday of the week that contains the date. */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay() // 0 = Sunday
  return addDays(date, -((day + 6) % 7))
}

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function isRealDate(value: string): boolean {
  return DATE_ONLY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value)
}

/**
 * The same day `months` calendar months later, clamped to the last day of a shorter month:
 * 31 Aug + 6 = 28 Feb (or 29 in a leap year). Calendar months, never 30-day blocks.
 */
export function addMonthsClamped(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = index - year * 12 // 0-based
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Shop-local calendar year of an instant. */
export function localYear(iso: string | number | Date): number {
  return Number(localDate(iso).slice(0, 4))
}
