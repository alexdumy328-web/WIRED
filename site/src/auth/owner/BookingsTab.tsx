import { useCallback, useEffect, useRef, useState } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Loading, Notice, StatusBadge, useDateFormat } from '../ui'
import { BookingDrawer } from './BookingDrawer'
import { BOOKING_STATUSES } from './constants'
import type { OwnerBooking } from './types'

const PAGE = 25

export function BookingsTab({ initialCode, onCode }: { initialCode?: string | null; onCode?: (code: string | null) => void }) {
  const { t } = useI18n()
  const b = t.owner.bookings
  const fmtDate = useDateFormat()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [mode, setMode] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [items, setItems] = useState<OwnerBooking[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [open, setOpen] = useState<string | null>(initialCode ?? null)
  const seq = useRef(0)

  const query = useCallback(
    (skip: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), skip: String(skip) })
      if (q.trim()) params.set('q', q.trim())
      if (status) params.set('status', status)
      if (mode) params.set('mode', mode)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      return `/api/admin/bookings?${params}`
    },
    [q, status, mode, from, to],
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
  }, [query, q])

  const more = async () => {
    const result = await api<{ total: number; items: OwnerBooking[] }>(query(items.length))
    if (result.ok) setItems((current) => [...current, ...result.data.items])
  }

  const dirty = q || status || mode || from || to
  const select = (code: string | null) => {
    setOpen(code)
    onCode?.(code)
  }

  return (
    <div>
      <form className="grid gap-3 rounded-[18px] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="grid gap-1 text-[13px] font-semibold">
          {b.search}
          <input className="field font-normal" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={b.searchPlaceholder} maxLength={100} />
        </label>
        <label className="grid gap-1 text-[13px] font-semibold">
          {b.status}
          <select className="field font-normal" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{b.all}</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.track.statuses[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[13px] font-semibold">
          {b.mode}
          <select className="field font-normal" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">{b.all}</option>
            <option value="shop">{b.modes.shop}</option>
            <option value="mobile">{b.modes.mobile}</option>
          </select>
        </label>
        <label className="grid gap-1 text-[13px] font-semibold">
          {b.from}
          <input className="field font-normal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="grid gap-1 text-[13px] font-semibold">
          {b.to}
          <input className="field font-normal" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn btn-ghost self-end"
          disabled={!dirty}
          onClick={() => {
            setQ('')
            setStatus('')
            setMode('')
            setFrom('')
            setTo('')
          }}
        >
          {b.reset}
        </button>
      </form>

      <p className="mt-4 text-[14px] text-muted" aria-live="polite">
        {state === 'ready' ? fmt(b.total, { n: total }) : ''}
      </p>

      {state === 'loading' && items.length === 0 && <Loading label={t.account.loading} />}
      {state === 'error' && <Notice tone="error">{t.owner.detail.error}</Notice>}
      {state === 'ready' && items.length === 0 && <p className="py-10 text-center text-muted">{b.empty}</p>}

      {items.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-[18px] border border-line" data-lenis-prevent>
          <table className="w-full min-w-[44rem] border-collapse text-left text-[14px]">
            <thead className="bg-surface-2 text-[13px] text-muted">
              <tr>
                {(['code', 'when', 'customer', 'device', 'mode', 'status'] as const).map((key) => (
                  <th key={key} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                    {b.columns[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.code} className="border-t border-line hover:bg-surface">
                  <td className="px-4 py-3">
                    <button type="button" className="font-mono font-bold text-gold underline-offset-4 hover:underline" onClick={() => select(item.code)}>
                      {item.code}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate.dateTime(item.slot)}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{item.contact.name}</span>
                    <span className="block text-muted">{item.contact.phone}</span>
                  </td>
                  <td className="px-4 py-3">{[item.device.brand, item.device.model].filter(Boolean).join(' ') || item.custom || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {b.modes[item.mode]}
                    {item.pickup ? ' + ' + t.owner.pickups.map.toLowerCase() : ''}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
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

      {open && (
        <BookingDrawer
          code={open}
          onClose={() => select(null)}
          onChanged={(updated) => setItems((current) => current.map((i) => (i.code === updated.code ? updated : i)))}
        />
      )}
    </div>
  )
}
