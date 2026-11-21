import { useEffect, useState } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Notice } from '../ui'
import { DateButton } from '../../components/DatePopover'
import { Chevron } from '../../components/Icons'
import { mondayOf } from '../../components/MonthCalendar'
import { addDays, shopDate, type CalendarSlot, type CalendarWeek } from './types'
import { useBusy } from './useBusy'

const FIRST = 9 // first hour row
const LAST = 18 // the grid ends at this hour
const ROW = 64 // px per hour

/** Opening hours per weekday (0 = Sunday), as [open, close] in hours; null when closed. */
const HOURS: Record<number, [number, number] | null> = { 0: null, 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 18], 6: [10, 14] }

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

/** Bucharest wall-clock hour (with fractions) of an ISO instant. */
function wallHour(iso: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: 'Europe/Bucharest' }).formatToParts(new Date(iso))
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0)
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0)
  return h + m / 60
}

/** A visit takes an hour; a mobile job holds a two-hour window. */
const length = (s: CalendarSlot) => (s.mode === 'mobile' ? 2 : 1)

/** Side-by-side lanes for bookings that overlap in time, like any week calendar. */
function lanes(slots: CalendarSlot[]) {
  const placed: { slot: CalendarSlot; start: number; end: number; lane: number; of: number }[] = []
  let cluster: typeof placed = []
  let clusterEnd = -1
  const close = () => {
    const of = Math.max(1, ...cluster.map((p) => p.lane + 1))
    cluster.forEach((p) => (p.of = of))
    cluster = []
  }
  for (const slot of [...slots].sort((a, b) => a.slot.localeCompare(b.slot))) {
    const start = wallHour(slot.slot)
    const end = start + length(slot)
    if (start >= clusterEnd) close()
    const taken = new Set(cluster.filter((p) => p.end > start).map((p) => p.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    const item = { slot, start, end, lane, of: 1 }
    cluster.push(item)
    placed.push(item)
    clusterEnd = Math.max(clusterEnd, end)
  }
  close()
  return placed
}

const tone = (s: CalendarSlot) =>
  s.mode === 'mobile'
    ? 'border-l-blue bg-blue/12 hover:bg-blue/20'
    : s.pickup
      ? 'border-l-ok bg-ok/12 hover:bg-ok/20'
      : 'border-l-gold bg-gold/12 hover:bg-gold/20'

export function CalendarTab({ onOpen, version = 0, anchor, onAnchor }: { onOpen: (code: string) => void; version?: number; anchor: string; onAnchor: (date: string) => void }) {
  const { t, lang } = useI18n()
  const c = t.owner.calendar
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const [week, setWeek] = useState<CalendarWeek | null>(null)
  const [error, setError] = useState(false)
  const [phoneDay, setPhoneDay] = useState(anchor)
  const today = shopDate()
  const busy = useBusy(version)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => setPhoneDay(anchor), [anchor])

  useEffect(() => {
    let live = true
    // A reload after a save keeps the current grid on screen, so focus can return to it.
    setWeek((w) => (w && w.weekStart === mondayOf(anchor) ? w : null))
    setError(false)
    void api<CalendarWeek>(`/api/admin/calendar?week=${anchor}`).then((result) => {
      if (!live) return
      if (result.ok) setWeek(result.data)
      else setError(true)
    })
    return () => {
      live = false
    }
  }, [anchor, version])

  const start = mondayOf(anchor)
  const f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  const title = f.formatRange(new Date(`${start}T12:00:00Z`), new Date(`${addDays(start, 6)}T12:00:00Z`))
  const wd = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' })
  const total = week?.days.reduce((n, d) => n + d.slots.length, 0) ?? 0
  const hours = Array.from({ length: LAST - FIRST }, (_, i) => FIRST + i)
  const nowHour = wallHour(new Date(now).toISOString())
  const timeLabel = (h: number) => `${String(h).padStart(2, '0')}:00`
  const fmtTime = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' })

  const nav = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="flex shrink-0 items-center rounded-full border border-line bg-surface p-0.5">
        <button type="button" aria-label={c.prev} onClick={() => onAnchor(addDays(anchor, -7))} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink">
          <Chevron className="size-4 rotate-90" />
        </button>
        <button type="button" onClick={() => onAnchor(today)} className="rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors hover:bg-surface-2">
          {c.thisWeek}
        </button>
        <button type="button" aria-label={c.next} onClick={() => onAnchor(addDays(anchor, 7))} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink">
          <Chevron className="size-4 -rotate-90" />
        </button>
      </div>
      <div className="min-w-0 flex-1 sm:w-60 sm:flex-none lg:hidden">
        <DateButton lang={lang} today={today} value={anchor} onChange={onAnchor} label={c.pick} marks={busy.marks} onView={busy.load} />
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-0.5 text-[14px] text-muted" aria-live="polite">
            {week ? fmt(c.count, { n: total }) : ' '}
          </p>
        </div>
        {nav}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        {(
          [
            ['bg-gold', c.legend.shop],
            ['bg-ok', c.legend.pickup],
            ['bg-blue', c.legend.mobile],
          ] as const
        ).map(([dot, name]) => (
          <li key={name} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-[3px] ${dot}`} aria-hidden="true" />
            {name}
          </li>
        ))}
      </ul>

      {error && (
        <div className="mt-4">
          <Notice tone="error">{t.owner.loadError}</Notice>
        </div>
      )}

      {/* Wider screens: a week time grid. */}
      <div className="mt-4 hidden overflow-hidden rounded-[20px] border border-line bg-surface md:block" aria-busy={!week}>
        <div className="grid grid-cols-[3.75rem_repeat(7,minmax(0,1fr))] border-b border-line">
          <span />
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(start, i)
            const isToday = date === today
            const count = week?.days[i]?.slots.length ?? 0
            return (
              <button
                key={date}
                type="button"
                onClick={() => onAnchor(date)}
                className="flex flex-col items-center gap-0.5 border-l border-line py-2.5 transition-colors hover:bg-surface-2/60"
              >
                <span className={`text-[12px] font-semibold uppercase tracking-wider ${isToday ? 'text-gold' : 'text-muted'}`}>{wd.format(new Date(`${date}T12:00:00Z`)).replace('.', '')}</span>
                <span className={`grid size-9 place-items-center rounded-full text-[17px] font-bold tabular-nums ${isToday ? 'bg-gold text-on-gold' : ''}`}>{Number(date.slice(8))}</span>
                <span className="h-4 text-[11px] text-muted">{count ? count : ''}</span>
              </button>
            )
          })}
        </div>
        <div className="relative grid grid-cols-[3.75rem_repeat(7,minmax(0,1fr))]" style={{ height: (LAST - FIRST) * ROW }}>
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-muted" style={{ top: i * ROW }}>
                {i === 0 ? '' : timeLabel(h)}
              </span>
            ))}
          </div>
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(start, i)
            const open = HOURS[weekday(date)]
            const slots = week?.days[i]?.slots ?? []
            return (
              <div key={date} className="relative border-l border-line">
                {hours.map((h, r) => (
                  <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: r * ROW, height: ROW }}>
                    <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line/40" />
                  </div>
                ))}
                {/* Closed time: hatched. */}
                {(open ? [[FIRST, open[0]] as const, [open[1], LAST] as const] : [[FIRST, LAST] as const])
                  .filter(([a, b]) => b > a)
                  .map(([a, b]) => (
                    <div
                      key={a}
                      className="closed-hatch absolute inset-x-0"
                      style={{ top: (a - FIRST) * ROW, height: (b - a) * ROW }}
                      aria-hidden="true"
                    />
                  ))}
                {!open && (
                  <span className="absolute inset-x-0 top-6 text-center text-[12px] font-semibold uppercase tracking-wider text-muted">{c.closed}</span>
                )}
                {lanes(slots).map(({ slot, start: s, end, lane, of }) => {
                  const top = (Math.max(s, FIRST) - FIRST) * ROW
                  const height = (Math.min(end, LAST) - Math.max(s, FIRST)) * ROW
                  return (
                    <button
                      key={slot.code}
                      type="button"
                      onClick={() => onOpen(slot.code)}
                      title={`${slot.name} · ${slot.code}`}
                      className={`absolute flex flex-col justify-start overflow-hidden rounded-[10px] border-l-[3px] px-2 py-1.5 text-left text-[12px] leading-tight transition-colors ${tone(slot)} ${slot.status === 'done' ? 'opacity-55' : ''}`}
                      style={{ top: top + 2, height: height - 4, left: `calc(${(lane / of) * 100}% + 3px)`, width: `calc(${100 / of}% - 6px)` }}
                    >
                      <span className="block font-mono text-[11px] font-bold text-muted">{fmtTime.format(new Date(slot.slot))}</span>
                      <span className="block truncate font-semibold">{slot.name}</span>
                      {height > 56 && <span className="block truncate text-muted">{slot.device || slot.code}</span>}
                    </button>
                  )
                })}
                {date === today && nowHour >= FIRST && nowHour <= LAST && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (nowHour - FIRST) * ROW }} aria-hidden="true">
                    <span className="-ml-1 size-2 rounded-full bg-danger" />
                    <span className="h-[2px] flex-1 bg-danger" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Phones: a day strip and that day's list. */}
      <div className="mt-4 md:hidden">
        <div className="grid grid-cols-7 gap-1 rounded-[18px] border border-line bg-surface p-1.5">
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(start, i)
            const on = date === phoneDay
            const count = week?.days[i]?.slots.length ?? 0
            return (
              <button
                key={date}
                type="button"
                aria-pressed={on}
                onClick={() => setPhoneDay(date)}
                className={`flex flex-col items-center rounded-[12px] py-2 transition-colors ${on ? 'bg-gold text-on-gold' : date === today ? 'text-gold' : ''}`}
              >
                <span className="text-[11px] font-semibold uppercase">{wd.format(new Date(`${date}T12:00:00Z`)).replace('.', '').slice(0, 2)}</span>
                <span className="text-[16px] font-bold tabular-nums">{Number(date.slice(8))}</span>
                <span className={`mt-0.5 size-1 rounded-full ${count ? (on ? 'bg-on-gold' : 'bg-gold') : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>
        <ul className="mt-3 grid gap-2">
          {(week?.days.find((d) => d.date === phoneDay)?.slots ?? []).map((slot) => (
            <li key={slot.code}>
              <button type="button" onClick={() => onOpen(slot.code)} className={`flex w-full gap-3 rounded-[14px] border-l-[3px] px-3.5 py-3 text-left ${tone(slot)} ${slot.status === 'done' ? 'opacity-60' : ''}`}>
                <span className="font-mono text-[14px] font-bold">{fmtTime.format(new Date(slot.slot))}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{slot.name}</span>
                  <span className="block truncate text-[13px] text-muted">{slot.device || slot.code}</span>
                </span>
              </button>
            </li>
          ))}
          {week && !(week.days.find((d) => d.date === phoneDay)?.slots.length) && (
            <li className="py-8 text-center text-muted">{HOURS[weekday(phoneDay)] ? c.free : c.closed}</li>
          )}
        </ul>
      </div>
    </div>
  )
}
