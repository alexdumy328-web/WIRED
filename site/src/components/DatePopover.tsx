import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { lastOfMonth, MonthCalendar, plusDays } from './MonthCalendar'

/** A button that opens a floating panel; Escape or a click outside closes it and focus returns. */
function Popover({ label, trigger, active, children, align = 'left' }: { label: string; trigger: ReactNode; active: boolean; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    // Focus goes to the picked day (or today) so arrow keys work straight away.
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('[role=grid] button[tabindex="0"]')?.focus())
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`field flex w-full items-center gap-2 text-left font-normal ${active ? 'border-gold/70' : ''}`}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted" />
        <span className={`min-w-0 flex-1 truncate ${active ? '' : 'text-muted'}`}>{trigger}</span>
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={`absolute top-[calc(100%+8px)] z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[20px] border border-muted/30 bg-surface p-4 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55),0_0_0_1px_rgb(255_255_255/0.03)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

export function CalendarIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}

type RangeText = {
  label: string
  any: string
  pickEnd: string
  clear: string
  presets: { today: string; week: string; month: string; next7: string }
}

/**
 * Date range filter: first click sets the start, the second the end, with the range previewed
 * under the pointer in between. Presets cover the ranges the owner asks for most.
 */
export function DateRangeButton({ lang, today, from, to, onChange, text, align }: { lang: 'ro' | 'en'; today: string; from: string; to: string; onChange: (from: string, to: string) => void; text: RangeText; align?: 'left' | 'right' }) {
  const [start, setStart] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const f = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const at = (d: string) => new Date(`${d}T12:00:00Z`)
  const shown = from && to ? (from === to ? f.format(at(from)) : f.formatRange(at(from), at(to))) : from ? `${f.format(at(from))} →` : to ? `→ ${f.format(at(to))}` : text.any

  const monday = plusDays(today, -((at(today).getUTCDay() + 6) % 7))
  const presets: [string, string, string][] = [
    [text.presets.today, today, today],
    [text.presets.week, monday, plusDays(monday, 6)],
    [text.presets.next7, today, plusDays(today, 6)],
    [text.presets.month, `${today.slice(0, 7)}-01`, lastOfMonth(today.slice(0, 7))],
  ]

  return (
    <Popover label={text.label} trigger={shown} active={Boolean(from || to)} align={align}>
      {(close) => (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={!from && !to}
              onClick={() => {
                setStart(null)
                onChange('', '')
                close()
              }}
              className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${!from && !to ? 'border-gold bg-gold text-on-gold' : 'border-line text-muted hover:border-muted hover:text-ink'}`}
            >
              {text.any}
            </button>
            {presets.map(([name, a, b]) => {
              const on = from === a && to === b
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setStart(null)
                    onChange(a, b)
                    close()
                  }}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${on ? 'border-gold bg-gold text-on-gold' : 'border-line text-muted hover:border-muted hover:text-ink'}`}
                >
                  {name}
                </button>
              )
            })}
          </div>
          <MonthCalendar
            lang={lang}
            mode="range"
            today={today}
            label={text.label}
            value={start ?? (from || null)}
            rangeEnd={start ? hover : to || null}
            onHover={setHover}
            onSelect={(d) => {
              if (!start) {
                setStart(d)
                return
              }
              const [a, b] = d < start ? [d, start] : [start, d]
              setStart(null)
              onChange(a, b)
              close()
            }}
          />
          {start && (
            <p className="border-t border-line pt-3 text-[13px] text-muted" aria-live="polite">
              {text.pickEnd}
            </p>
          )}
        </div>
      )}
    </Popover>
  )
}

/** One-day picker in a popover, for pages that look at a single day. */
export function DateButton({ lang, today, value, onChange, label, marks, onView, align }: { lang: 'ro' | 'en'; today: string; value: string; onChange: (d: string) => void; label: string; marks?: Record<string, number>; onView?: (from: string, to: string) => void; align?: 'left' | 'right' }) {
  const f = new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const text = f.format(new Date(`${value}T12:00:00Z`))
  return (
    <Popover label={label} trigger={<span className="inline-block first-letter:uppercase">{text}</span>} active align={align}>
      {(close) => (
        <MonthCalendar
          lang={lang}
          today={today}
          label={label}
          value={value}
          marks={marks}
          onView={onView}
          onSelect={(d) => {
            onChange(d)
            close()
          }}
        />
      )}
    </Popover>
  )
}
