import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { api } from '../api'
import { Loading, Notice, useDateFormat } from '../ui'
import { addDays, shopDate, type CalendarWeek } from './types'

/** Capitalise the first letter only: Romanian keeps month names lower case ("Lun., 16 nov."). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function CalendarTab({ onOpen }: { onOpen: (code: string) => void }) {
  const { t, lang } = useI18n()
  const c = t.owner.calendar
  const fmtDate = useDateFormat()
  const [anchor, setAnchor] = useState(shopDate())
  const [week, setWeek] = useState<CalendarWeek | null>(null)
  const [error, setError] = useState(false)
  const today = shopDate()
  // "16–22 nov." for the week on screen, so paging never loses the owner.
  const range = (start: string) => {
    const f = new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    const a = new Date(`${start}T12:00:00Z`)
    const b = new Date(`${addDays(start, 6)}T12:00:00Z`)
    return f.formatRange(a, b)
  }

  useEffect(() => {
    let live = true
    setWeek(null)
    setError(false)
    void api<CalendarWeek>(`/api/admin/calendar?week=${anchor}`).then((result) => {
      if (!live) return
      if (result.ok) setWeek(result.data)
      else setError(true)
    })
    return () => {
      live = false
    }
  }, [anchor])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display-2 text-2xl">
          {c.title}
          {week && ' '}
          {week && <span className="ml-1 font-sans text-[17px] font-semibold text-muted">{range(week.weekStart)}</span>}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost h-10 min-h-0" onClick={() => setAnchor(addDays(anchor, -7))}>
            {c.prev}
          </button>
          <button type="button" className="btn btn-ghost h-10 min-h-0" onClick={() => setAnchor(shopDate())}>
            {c.thisWeek}
          </button>
          <button type="button" className="btn btn-ghost h-10 min-h-0" onClick={() => setAnchor(addDays(anchor, 7))}>
            {c.next}
          </button>
        </div>
      </div>

      {error && <Notice tone="error">{t.owner.loadError}</Notice>}
      {!week && !error && <Loading label={t.account.loading} />}
      {week && (
        <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7" aria-live="polite">
          {week.days.map((day) => (
            <li key={day.date} className={`rounded-[14px] border bg-surface p-3 ${day.date === today ? 'border-gold' : 'border-line'}`}>
              <h3 className="text-[14px] font-bold">{cap(fmtDate.weekday(day.date))}</h3>
              {day.slots.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">{c.free}</p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {day.slots.map((slot) => (
                    <li key={slot.code}>
                      <button
                        type="button"
                        onClick={() => onOpen(slot.code)}
                        className={`w-full rounded-[10px] border border-line px-2.5 py-2 text-left text-[13px] transition-colors hover:border-gold ${slot.status === 'done' ? 'opacity-60' : ''}`}
                      >
                        <span className="flex items-center justify-between gap-2 font-mono font-bold">
                          {fmtDate.time(slot.slot)}
                          <span className={`size-2 rounded-full ${slot.mode === 'mobile' ? 'bg-blue' : 'bg-gold'}`} title={t.owner.bookings.modes[slot.mode]} />
                        </span>
                        <span className="block font-semibold">{slot.name}</span>
                        <span className="block truncate text-muted">{slot.device || slot.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
