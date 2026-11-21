import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Chevron } from './Icons'

/** Dates are 'YYYY-MM-DD' strings, read at UTC noon so time zones never shift a day. */
const at = (d: string) => new Date(`${d}T12:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

export function plusDays(date: string, n: number): string {
  const d = at(date)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export function plusMonths(month: string, n: number): string {
  const d = at(`${month}-01`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return iso(d).slice(0, 7)
}

/** Monday of the week holding the date. */
export function mondayOf(date: string): string {
  return plusDays(date, -((at(date).getUTCDay() + 6) % 7))
}

export function lastOfMonth(month: string): string {
  return plusDays(`${plusMonths(month, 1)}-01`, -1)
}

/** The 6 × 7 grid shown for a month: Monday first, padded with the neighbouring months. */
export function monthGrid(month: string): string[] {
  const start = mondayOf(`${month}-01`)
  return Array.from({ length: 42 }, (_, i) => plusDays(start, i))
}

export type CalendarMode = 'single' | 'week' | 'range'

type Props = {
  lang: 'ro' | 'en'
  /** The picked day (single), any day of the picked week (week) or the first day (range). */
  value: string | null
  /** Range mode: the last day, inclusive. */
  rangeEnd?: string | null
  mode?: CalendarMode
  onSelect: (date: string) => void
  /** Days that cannot be picked (closed, full, out of range). */
  isDisabled?: (date: string) => boolean
  /** Bookings per day: up to three dots under the number. */
  marks?: Record<string, number>
  /** Called with the first and last day on screen, so the parent can load marks for them. */
  onView?: (from: string, to: string) => void
  /** Navigation stops at these months (YYYY-MM). */
  minMonth?: string
  maxMonth?: string
  today: string
  /** Range mode: the day under the pointer, to preview the range before the second click. */
  onHover?: (date: string | null) => void
  label: string
  size?: 'md' | 'lg'
}

/**
 * A month grid that works like the date pickers in booking tools: arrow keys move a day or a week,
 * Page Up/Down change month, Home/End jump to the ends of the week, Enter or Space picks.
 * Only the focused day is in the tab order, so Tab leaves the grid in one step.
 */
export function MonthCalendar({ lang, value, rangeEnd, mode = 'single', onSelect, isDisabled, marks, onView, minMonth, maxMonth, today, onHover, label, size = 'md' }: Props) {
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const [month, setMonth] = useState((value ?? today).slice(0, 7))
  const [focus, setFocus] = useState(value ?? today)
  const grid = useMemo(() => monthGrid(month), [month])
  const ref = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  // A value set from outside (another control, "today" button) brings its month into view.
  useEffect(() => {
    if (!value) return
    setFocus(value)
    setMonth(value.slice(0, 7))
  }, [value])

  useEffect(() => {
    onView?.(grid[0]!, grid[41]!)
    // onView is a callback prop; reloading on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid])

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    ref.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus()
  }, [focus, month])

  const canGo = (m: string) => (!minMonth || m >= minMonth) && (!maxMonth || m <= maxMonth)
  const go = (n: number) => {
    const m = plusMonths(month, n)
    if (!canGo(m)) return
    setMonth(m)
    setFocus(`${m}-01`)
  }

  const moveFocus = (date: string) => {
    const m = date.slice(0, 7)
    if (!canGo(m)) return
    moved.current = true
    setFocus(date)
    if (m !== month) setMonth(m)
  }

  const onKey = (e: KeyboardEvent, date: string) => {
    const dow = (at(date).getUTCDay() + 6) % 7
    const step: Record<string, () => string> = {
      ArrowLeft: () => plusDays(date, -1),
      ArrowRight: () => plusDays(date, 1),
      ArrowUp: () => plusDays(date, -7),
      ArrowDown: () => plusDays(date, 7),
      Home: () => plusDays(date, -dow),
      End: () => plusDays(date, 6 - dow),
      PageUp: () => iso(new Date(Date.UTC(at(date).getUTCFullYear(), at(date).getUTCMonth() - 1, Math.min(at(date).getUTCDate(), 28), 12))),
      PageDown: () => iso(new Date(Date.UTC(at(date).getUTCFullYear(), at(date).getUTCMonth() + 1, Math.min(at(date).getUTCDate(), 28), 12))),
    }
    const next = step[e.key]
    if (!next) return
    e.preventDefault()
    moveFocus(next())
  }

  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at(`${month}-01`))
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const longName = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const heads = grid.slice(0, 7).map((d) => dayName.format(at(d)).replace('.', '').slice(0, 2))

  const week = mode === 'week' && value ? mondayOf(value) : null
  const lo = mode === 'range' && value ? (rangeEnd && rangeEnd < value ? rangeEnd : value) : null
  const hi = mode === 'range' && value ? (rangeEnd && rangeEnd < value ? value : (rangeEnd ?? value)) : null
  const inBand = (d: string) => (week ? d >= week && d <= plusDays(week, 6) : lo && hi ? d >= lo && d <= hi : false)
  const bandStart = (d: string) => (week ? d === week : d === lo)
  const bandEnd = (d: string) => (week ? d === plusDays(week, 6) : d === hi)
  const picked = (d: string) => (mode === 'week' ? false : mode === 'range' ? d === lo || d === hi : d === value)

  // Rows: the last row is dropped when it belongs entirely to the next month.
  const rows = grid[35]!.slice(0, 7) === month ? 6 : 5
  const cell = size === 'lg' ? 'max-w-14' : 'max-w-10'

  return (
    <div ref={ref} className="select-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="pl-1 text-[15px] font-bold first-letter:uppercase" aria-live="polite">
          {title}
        </p>
        <div className="flex gap-1">
          {([-1, 1] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => go(n)}
              disabled={!canGo(plusMonths(month, n))}
              aria-label={new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(at(`${plusMonths(month, n)}-01`))}
              className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            >
              <Chevron className={`size-4 ${n < 0 ? 'rotate-90' : '-rotate-90'}`} />
            </button>
          ))}
        </div>
      </div>
      <div role="grid" aria-label={`${label}, ${title}`} className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => onHover?.(null)}>
        <div role="row" className="contents">
          {heads.map((h, i) => (
            <span key={i} role="columnheader" className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {h}
            </span>
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div role="row" key={r} className="contents">
            {grid.slice(r * 7, r * 7 + 7).map((d) => {
              const outside = d.slice(0, 7) !== month
              const off = isDisabled?.(d) ?? false
              const sel = picked(d)
              const band = inBand(d)
              const dots = Math.min(marks?.[d] ?? 0, 3)
              return (
                <div
                  role="gridcell"
                  key={d}
                  aria-selected={sel || band}
                  className={`relative flex justify-center ${band ? 'bg-gold/12' : ''} ${band && bandStart(d) ? 'rounded-l-full' : ''} ${band && bandEnd(d) ? 'rounded-r-full' : ''}`}
                >
                  <button
                    type="button"
                    data-date={d}
                    tabIndex={d === focus ? 0 : -1}
                    disabled={off}
                    aria-label={longName.format(at(d)) + (marks?.[d] ? ` (${marks[d]})` : '')}
                    aria-current={d === today ? 'date' : undefined}
                    onClick={() => {
                      setFocus(d)
                      onSelect(d)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') return
                      onKey(e, d)
                    }}
                    onFocus={() => setFocus(d)}
                    onMouseEnter={() => onHover?.(d)}
                    className={`relative flex aspect-square w-full ${cell} flex-col items-center justify-center rounded-full text-[14px] font-semibold tabular-nums transition-[background-color,color,box-shadow] duration-150
                      ${sel ? 'bg-gold text-on-gold shadow-[0_6px_18px_-8px_var(--gold)]' : off ? 'text-muted/35' : outside ? 'text-muted/60 hover:bg-surface-2' : 'hover:bg-surface-2'}
                      ${d === today && !sel ? 'ring-1 ring-inset ring-gold/70 text-gold' : ''}
                      disabled:cursor-not-allowed`}
                  >
                    {Number(d.slice(8))}
                    {dots > 0 && (
                      <span className="absolute bottom-[18%] flex gap-0.5" aria-hidden="true">
                        {Array.from({ length: dots }, (_, i) => (
                          <span key={i} className={`size-1 rounded-full ${sel ? 'bg-on-gold' : 'bg-gold'}`} />
                        ))}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
