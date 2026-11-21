import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Notice, StatusBadge, useDateFormat } from '../ui'
import { KIND_TONE, kindOf } from './constants'
import { BoxIcon, ClockIcon, VanIcon, WrenchIcon } from './icons'
import { addDays, shopDate, type CalendarSlot, type CalendarWeek, type OwnerBooking, type PickupJob, type Stats } from './types'

type Data = { day: string; todayCount: number; slots: CalendarSlot[]; pickups: PickupJob[]; stats: Stats; ready: OwnerBooking[] }

function Kpi({ icon: Icon, label, value, tone, onClick }: { icon: ComponentType<{ className?: string }>; label: string; value: ReactNode; tone: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-[18px] border border-line bg-surface p-4 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-muted sm:p-5"
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${tone}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-muted">{label}</span>
        <span className="display-2 block text-[1.9rem] leading-none tabular-nums">{value}</span>
      </span>
    </button>
  )
}

export function TodayTab({ onOpen, version, onGo }: { onOpen: (code: string) => void; version: number; onGo: (tab: 'bookings' | 'pickups' | 'calendar') => void }) {
  const { t, lang } = useI18n()
  const d = t.owner.today
  const fmtDate = useDateFormat()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const today = shopDate()

  useEffect(() => {
    let live = true
    setError(false)
    void Promise.all([
      api<CalendarWeek>(`/api/admin/calendar?week=${today}`),
      api<{ jobs: PickupJob[] }>(`/api/admin/pickups?date=${today}`),
      api<Stats>('/api/admin/stats'),
      api<{ items: OwnerBooking[] }>('/api/admin/bookings?status=ready&limit=6&skip=0'),
    ]).then(async ([week, pickups, stats, ready]) => {
      if (!live) return
      if (!week.ok || !pickups.ok || !stats.ok || !ready.ok) return setError(true)
      let day = today
      let slots = week.data.days.find((x) => x.date === today)?.slots ?? []
      // A quiet day (or after hours): show the next day that has bookings instead of an empty card.
      if (slots.length === 0) {
        const busy = await api<{ days: Record<string, { total: number }> }>(`/api/admin/busy?from=${addDays(today, 1)}&to=${addDays(today, 14)}`)
        const next = busy.ok ? Object.keys(busy.data.days).sort()[0] : undefined
        if (next) {
          const w = await api<CalendarWeek>(`/api/admin/calendar?week=${next}`)
          if (w.ok) {
            day = next
            slots = w.data.days.find((x) => x.date === next)?.slots ?? []
          }
        }
      }
      if (!live) return
      setData({
        day,
        todayCount: week.data.days.find((x) => x.date === today)?.slots.length ?? 0,
        slots,
        pickups: pickups.data.jobs,
        stats: stats.data,
        ready: ready.data.items,
      })
    })
    return () => {
      live = false
    }
  }, [today, version])

  if (error) return <Notice tone="error">{t.owner.loadError}</Notice>

  const now = Date.now()
  const isToday = data?.day === today
  const nextIndex = data && isToday ? data.slots.findIndex((s) => Date.parse(s.slot) + 3600_000 > now) : -1
  const skeleton = <span className="inline-block h-7 w-10 animate-pulse rounded-md bg-surface-2 align-middle" />

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ClockIcon} label={d.visits} value={data ? data.todayCount : skeleton} tone="bg-surface-2 text-ink" onClick={() => onGo('calendar')} />
        <Kpi icon={VanIcon} label={d.pickups} value={data ? data.pickups.length : skeleton} tone="bg-ok/15 text-ok" onClick={() => onGo('pickups')} />
        <Kpi icon={BoxIcon} label={d.ready} value={data ? (data.stats.byStatus.ready ?? 0) : skeleton} tone="bg-surface-2 text-ink" onClick={() => onGo('bookings')} />
        <Kpi icon={WrenchIcon} label={d.inShop} value={data ? data.stats.active : skeleton} tone="bg-surface-2 text-ink" onClick={() => onGo('bookings')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-[20px] border border-line bg-surface p-5 sm:p-6" aria-labelledby="agenda-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="agenda-title" className="text-lg font-bold first-letter:uppercase">
              {data && data.day !== today ? fmt(d.agendaNext, { day: new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${data.day}T12:00:00Z`)) }) : d.agenda}
            </h2>
            <button type="button" onClick={() => onGo('calendar')} className="shrink-0 whitespace-nowrap text-[14px] font-semibold text-gold underline-offset-4 hover:underline">
              {d.seeAll}
            </button>
          </div>
          {!data ? (
            <div className="mt-5 grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-[14px] bg-surface-2" />
              ))}
            </div>
          ) : data.slots.length === 0 ? (
            <p className="mt-8 pb-4 text-center text-muted">{d.agendaEmpty}</p>
          ) : (
            <ol className="relative mt-5">
              {data.slots.map((s, i) => {
                const past = isToday && Date.parse(s.slot) + 3600_000 <= now
                return (
                  <li key={s.code} className="relative grid grid-cols-[3.5rem_1.25rem_minmax(0,1fr)] gap-x-3">
                    {i === nextIndex && i > 0 && (
                      <div className="col-span-3 -mt-1 mb-2 flex items-center gap-2" aria-hidden="true">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-danger">{d.now}</span>
                        <span className="h-px flex-1 bg-danger/60" />
                      </div>
                    )}
                    <span className={`pt-3 text-right font-mono text-[14px] font-bold ${past ? 'text-muted' : ''}`}>{fmtDate.time(s.slot)}</span>
                    <span className="relative flex justify-center">
                      <span className={`absolute top-0 w-px ${i === data.slots.length - 1 ? 'h-5' : 'h-full'} bg-line`} aria-hidden="true" />
                      <span className={`relative mt-4 size-3 rounded-full border-2 ${past ? 'border-line bg-surface-2' : `${KIND_TONE[kindOf(s)].border} bg-surface`}`} aria-hidden="true" />
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpen(s.code)}
                      className={`mb-2.5 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[14px] border border-line px-4 py-3 text-left transition-colors hover:border-gold/60 hover:bg-surface-2/50 ${past ? 'opacity-60' : ''}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{s.name}</span>
                        <span className="block text-[13px] text-muted sm:truncate">
                          <span className="font-mono">{s.code}</span>
                          {s.device ? ` · ${s.device}` : ''}
                          {s.mode === 'mobile' ? ` · ${t.owner.calendar.legend.mobile}` : s.pickup ? ` · ${t.owner.calendar.legend.pickup}` : ''}
                        </span>
                      </span>
                      <StatusBadge status={s.status} />
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section className="rounded-[20px] border border-line bg-surface p-5 sm:p-6" aria-labelledby="ready-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="ready-title" className="text-lg font-bold">
              {d.readyList}
            </h2>
            <button type="button" onClick={() => onGo('bookings')} className="shrink-0 whitespace-nowrap text-[14px] font-semibold text-gold underline-offset-4 hover:underline">
              {d.seeAll}
            </button>
          </div>
          {!data ? (
            <div className="mt-5 grid gap-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-[14px] bg-surface-2" />
              ))}
            </div>
          ) : data.ready.length === 0 ? (
            <p className="mt-8 pb-4 text-center text-muted">{d.readyEmpty}</p>
          ) : (
            <ul className="mt-4 grid gap-1">
              {data.ready.map((b) => (
                <li key={b.code} className="flex items-center gap-2 rounded-[12px] pr-2 transition-colors hover:bg-surface-2">
                  <button type="button" onClick={() => onOpen(b.code)} className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] px-2 py-2.5 text-left">
                    <Initials name={b.contact.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.contact.name}</span>
                      <span className="block truncate text-[13px] text-muted">{[b.device.brand, b.device.model].filter(Boolean).join(' ') || b.code}</span>
                    </span>
                  </button>
                  <a
                    href={`tel:${b.contact.phone.replace(/[^+\d]/g, '')}`}
                    aria-label={`${t.owner.pickups.call} ${b.contact.name}`}
                    className="shrink-0 rounded-full border border-line px-3 py-1 text-[13px] font-semibold transition-colors hover:border-gold hover:text-gold"
                  >
                    {t.owner.pickups.call}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/** Round initials badge; the hue is picked from the name so a customer keeps their colour. */
export function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  // Neutral on purpose: gold, green and blue already mean workshop, pickup and on site.
  const tone = 'bg-surface-2 text-ink'
  return (
    <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ${tone}`} aria-hidden="true">
      {letters || '?'}
    </span>
  )
}
