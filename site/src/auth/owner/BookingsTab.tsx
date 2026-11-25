import { useCallback, useEffect, useRef, useState } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Notice, STATUS_DOT, StatusBadge } from '../ui'
import { DateRangeButton } from '../../components/DatePopover'
import { Close } from '../../components/Icons'
import { BOOKING_STATUSES, KIND_TONE, kindOf } from './constants'
import { SearchIcon } from './icons'
import { Initials } from './TodayTab'
import { shopDate, type OwnerBooking } from './types'
import { sheetLabel } from './workshop/model'

const PAGE = 25


export function BookingsTab({ version = 0, onOpen }: { version?: number; onOpen: (code: string) => void }) {
  const { t, lang } = useI18n()
  const b = t.owner.bookings
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [mode, setMode] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Remembered per browser: whoever works the list picks their order once.
  const [sort, setSortState] = useState(() => {
    try {
      return localStorage.getItem('owner.bookings.sort') ?? ''
    } catch {
      return ''
    }
  })
  const setSort = (v: string) => {
    setSortState(v)
    try {
      localStorage.setItem('owner.bookings.sort', v)
    } catch {
      /* private mode: kept for this visit only */
    }
  }
  const [items, setItems] = useState<OwnerBooking[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const seq = useRef(0)
  const today = shopDate()

  const query = useCallback(
    (skip: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), skip: String(skip) })
      if (q.trim()) params.set('q', q.trim())
      if (status) params.set('status', status)
      if (mode) params.set('mode', mode)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (sort) params.set('sort', sort)
      return `/api/admin/bookings?${params}`
    },
    [q, status, mode, from, to, sort],
  )

  // Reload when a filter changes; the search box waits a moment while the owner types.
  useEffect(() => {
    const mine = ++seq.current
    setState('loading')
    const timer = setTimeout(
      () => {
        void api<{ total: number; items: OwnerBooking[] }>(query(0)).then((result) => {
          if (mine !== seq.current) return
          if (result.ok) {
            setItems(result.data.items)
            setTotal(result.data.total)
            setState('ready')
          } else setState('error')
        })
      },
      q ? 300 : 0,
    )
    return () => clearTimeout(timer)
  }, [query, q, version])

  // Counts on the status chips, across all bookings.
  useEffect(() => {
    void api<{ byStatus: Record<string, number> }>('/api/admin/counts').then((r) => r.ok && setCounts(r.data.byStatus))
  }, [version])

  const more = async () => {
    const result = await api<{ total: number; items: OwnerBooking[] }>(query(items.length))
    if (result.ok) setItems((current) => [...current, ...result.data.items])
  }

  const dirty = q || status || mode || from || to
  const all = counts ? Object.values(counts).reduce((a, n) => a + n, 0) : null

  const dayText = (iso: string) => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso))
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }).format(new Date(iso))
    const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    const diff = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
    const day =
      Math.abs(diff) <= 1
        ? rel.format(diff, 'day')
        : new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest', ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }).format(new Date(iso))
    return { day: day.charAt(0).toUpperCase() + day.slice(1), time, soon: diff === 0 }
  }
  const lei = new Intl.NumberFormat(locale)
  const price = (item: OwnerBooking) =>
    item.finalLei != null
      ? `${lei.format(item.finalLei)} lei`
      : item.estimate.priceTo > 0
        ? `${lei.format(item.estimate.priceFrom)}–${lei.format(item.estimate.priceTo)}`
        : '–'
  const device = (item: OwnerBooking) => [item.device.brand, item.device.model].filter(Boolean).join(' ') || item.custom || '–'

  const chip = (value: string, label: string, n: number | null | undefined, tone?: string) => {
    const on = status === value
    return (
      <button
        key={value || 'all'}
        type="button"
        aria-pressed={on}
        onClick={() => setStatus(value)}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-colors ${
          on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:border-muted hover:text-ink'
        }`}
      >
        {tone && <span className={`size-2 rounded-full ${tone}`} aria-hidden="true" />}
        {label}
        {n != null && <span className={`rounded-full px-1.5 text-[12px] tabular-nums ${on ? 'bg-bg/20' : 'bg-surface-2'}`}>{n}</span>}
      </button>
    )
  }

  return (
    <div>
      {/* Status chips: the first filter most owners reach for. */}
      <div role="group" aria-label={b.status} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" data-lenis-prevent>
        {chip('', b.all, all)}
        {BOOKING_STATUSES.map((s) => chip(s, t.track.statuses[s], counts ? (counts[s] ?? 0) : null, STATUS_DOT[s]))}
      </div>

      <form className="mt-4 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_14rem_15rem_auto]" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="relative">
          <span className="sr-only">{b.search}</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="field w-full pl-10 font-normal" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={b.searchPlaceholder} maxLength={100} />
        </label>
        <div role="group" aria-label={b.mode} className="grid grid-cols-4 rounded-full border border-line bg-surface p-0.5 text-[13px] sm:inline-grid sm:text-[14px]">
          {(
            [
              ['', b.all],
              ['shop', b.modes.shop],
              ['pickup', b.modes.pickup],
              ['mobile', b.modes.mobile],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v || 'all'}
              type="button"
              aria-pressed={mode === v}
              onClick={() => setMode(v)}
              className={`whitespace-nowrap rounded-full px-1.5 py-1.5 font-semibold transition-colors sm:px-3.5 ${mode === v ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <label className="sr-only" htmlFor="bookings-sort">{b.sort.label}</label>
          <select id="bookings-sort" className="field min-w-0 flex-1 py-2 text-[14px]" value={sort} onChange={(e) => setSort(e.target.value)} title={b.sort.label}>
            <option value="">{b.sort.slot_desc}</option>
            <option value="slot_asc">{b.sort.slot_asc}</option>
            <option value="upcoming">{b.sort.upcoming}</option>
            <option value="updated">{b.sort.updated}</option>
            <option value="created">{b.sort.created}</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <DateRangeButton
            lang={lang}
            today={today}
            from={from}
            to={to}
            align="right"
            onChange={(a, z) => {
              setFrom(a)
              setTo(z)
            }}
            text={b.range}
          />
        </div>
        {dirty ? (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-muted transition-colors hover:text-ink sm:col-span-2 lg:col-span-1"
            onClick={() => {
              setQ('')
              setStatus('')
              setMode('')
              setFrom('')
              setTo('')
            }}
          >
            <Close className="size-4" />
            {b.reset}
          </button>
        ) : (
          <span className="hidden lg:block" />
        )}
      </form>

      <p className="mt-4 text-[14px] text-muted" aria-live="polite">
        {state === 'ready' ? fmt(b.total, { n: total }) : ' '}
      </p>

      {state === 'error' && <Notice tone="error">{t.account.bookings.error}</Notice>}
      {state === 'loading' && items.length === 0 && (
        <div className="mt-2 grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[14px] bg-surface" />
          ))}
        </div>
      )}
      {state === 'ready' && items.length === 0 && (
        <div className="mt-2 rounded-[20px] border border-dashed border-line py-14 text-center text-muted">{b.empty}</div>
      )}

      {items.length > 0 && (
        // Phones: one card per booking, the whole card opens it. Wider screens: the table.
        <ul className={`mt-2 grid gap-2 sm:hidden ${state === 'loading' ? 'opacity-60' : ''}`}>
          {items.map((item) => {
            const when = dayText(item.slot)
            return (
              <li key={item.code}>
                <button type="button" onClick={() => onOpen(item.code)} className="flex w-full gap-3 rounded-[16px] border border-line bg-surface p-3.5 text-left transition-colors hover:border-muted">
                  <Initials name={item.contact.name} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{item.contact.name}</span>
                      <span className={`shrink-0 text-[13px] font-semibold ${when.soon ? 'text-gold' : 'text-muted'}`}>
                        {when.day}, {when.time}
                      </span>
                    </span>
                    <span className="truncate text-[13px] text-muted">
                      <span className="font-mono">{item.code}</span>
                      {item.intake && <span className="font-mono font-semibold text-ink"> · {sheetLabel(item)}</span>} · {device(item)}
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <StatusBadge status={item.status} />
                        <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${KIND_TONE[kindOf(item)].chip}`}>{b.modes[kindOf(item)]}</span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums">{price(item)}</span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > 0 && (
        <div className={`mt-2 hidden overflow-x-auto rounded-[20px] border border-line bg-surface transition-opacity sm:block ${state === 'loading' ? 'opacity-60' : ''}`} data-lenis-prevent>
          <table className="w-full min-w-[52rem] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px] uppercase tracking-wider text-muted">
                {(['customer', 'when', 'device', 'mode', 'price', 'status'] as const).map((key) => (
                  <th key={key} scope="col" className={`whitespace-nowrap px-4 py-3 font-semibold ${key === 'price' ? 'text-right' : ''}`}>
                    {b.columns[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const when = dayText(item.slot)
                return (
                  <tr
                    key={item.code}
                    onClick={() => onOpen(item.code)}
                    className="cursor-pointer border-t border-line/70 transition-colors first:border-t-0 hover:bg-surface-2/60"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Initials name={item.contact.name} />
                        <div className="min-w-0">
                          {/* The real control for keyboards and screen readers; the row click is a shortcut. */}
                          <button type="button" className="block max-w-[14rem] truncate text-left font-semibold hover:text-gold" onClick={(e) => { e.stopPropagation(); onOpen(item.code) }}>
                            {item.contact.name}
                          </button>
                          <span className="block text-[13px] text-muted">
                            <span className="font-mono">{item.code}</span>
                            {item.intake && <span className="font-mono font-semibold text-ink"> · {sheetLabel(item)}</span>} · {item.contact.phone}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`block font-semibold ${when.soon ? 'text-gold' : ''}`}>{when.day}</span>
                      <span className="block font-mono text-[13px] text-muted">{when.time}</span>
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3">{device(item)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-semibold ${KIND_TONE[kindOf(item)].chip}`}>
                        {b.modes[kindOf(item)]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{price(item)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {items.length < total && (
        <div className="mt-4 text-center">
          <button type="button" className="btn btn-ghost" onClick={() => void more()}>
            {b.loadMore}
          </button>
        </div>
      )}

    </div>
  )
}
