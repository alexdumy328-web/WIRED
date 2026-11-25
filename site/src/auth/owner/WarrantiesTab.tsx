import { useEffect, useRef, useState } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Notice } from '../ui'
import { SearchIcon } from './icons'
import { shopDate } from './types'
import { useWorkshopCopy } from './workshop/copy'
import { dayLabel, pdfUrl, type WarrantyView } from './workshop/model'
import { daysUntil, WarrantyStateBadge } from './workshop/parts'

const FILTERS = ['', 'valid', 'expiring', 'expired', 'void'] as const
type Filter = (typeof FILTERS)[number]
const PAGE = 50

/** Every warranty certificate: what is still covered, what runs out soon, what was voided. */
export function WarrantiesTab({ onOpen, version }: { onOpen: (code: string) => void; version: number }) {
  const c = useWorkshopCopy()
  const { lang } = useI18n()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('')
  const [items, setItems] = useState<WarrantyView[] | null>(null)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<{ valid: number; expiring: number } | null>(null)
  const [error, setError] = useState(false)
  const seq = useRef(0)
  const today = shopDate()

  const url = (skip: number) => `/api/admin/warranties?limit=${PAGE}&skip=${skip}${filter ? `&state=${filter}` : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`

  useEffect(() => {
    const mine = ++seq.current
    const timer = setTimeout(
      () => {
        void api<{ total: number; items: WarrantyView[] }>(url(0)).then((r) => {
          if (mine !== seq.current) return
          if (!r.ok) return setError(true)
          setError(false)
          setItems(r.data.items)
          setTotal(r.data.total)
        })
      },
      q ? 250 : 0,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url is derived from q and filter
  }, [q, filter, version])

  useEffect(() => {
    void api<{ warranties: { valid: number; expiring: number } }>('/api/admin/counts').then((r) => r.ok && setCounts(r.data.warranties))
  }, [version])

  const more = async () => {
    const r = await api<{ items: WarrantyView[] }>(url(items?.length ?? 0))
    if (r.ok) setItems((cur) => [...(cur ?? []), ...r.data.items])
  }

  const left = (w: WarrantyView) => {
    if (w.state === 'void' || w.state === 'expired') return null
    const n = daysUntil(w.endsOn, today)
    return n === 0 ? c.warranties.dayLeft : fmt(c.warranties.daysLeft, { n })
  }

  return (
    <div>
      {counts && (
        <p className="mb-4 text-[15px]">
          <span className="font-semibold">{fmt(c.warranties.running, { n: counts.valid })}</span>
          {counts.expiring > 0 && <span className="text-gold"> · {fmt(c.warranties.expiringCount, { n: counts.expiring })}</span>}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative">
          <span className="sr-only">{c.warranties.search}</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="field pl-10" type="search" maxLength={100} value={q} placeholder={c.warranties.search} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div role="group" aria-label={c.tabs.warranties} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" data-lenis-prevent>
          {FILTERS.map((f) => (
            <button
              key={f || 'all'}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-colors ${filter === f ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink'}`}
            >
              {c.warranties.filters[f || 'all']}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {error && <Notice tone="error">{c.error}</Notice>}
        {!items && !error && (
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[14px] bg-surface" />
            ))}
          </div>
        )}
        {items?.length === 0 && <p className="rounded-[20px] border border-dashed border-line py-14 text-center text-muted">{c.warranties.empty}</p>}
        {items && items.length > 0 && (
          <>
            {/* Phones: one card per warranty so nothing needs sideways table scrolling. */}
            <ul className="grid gap-2 sm:hidden">
              {items.map((w) => (
                <li key={w.id} className="rounded-[16px] border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block font-mono text-[15px] font-bold">{w.label}</span>
                      <button type="button" className="font-mono text-[12px] text-muted underline-offset-4 hover:text-gold hover:underline" onClick={() => onOpen(w.bookingCode)}>
                        {w.bookingCode}
                      </button>
                    </div>
                    <WarrantyStateBadge state={w.state} />
                  </div>
                  <p className="mt-2 truncate font-semibold">{w.customerName}</p>
                  <p className="truncate text-[13px] text-muted">{w.device}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-2.5 text-[13px]">
                    <span className="text-muted">
                      {dayLabel(w.endsOn, lang)}
                      {left(w) ? ` · ${left(w)}` : ''}
                    </span>
                    <a className="font-semibold text-gold underline-offset-4 hover:underline" href={pdfUrl.warranty(w.id)} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-[20px] border border-line bg-surface sm:block" data-lenis-prevent>
            <table className="w-full min-w-[46rem] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-line text-[12px] uppercase tracking-wider text-muted">
                  {[c.warranties.number, c.warranties.customer, c.warranties.device, c.warranties.issued, c.warranties.expires, ''].map((h, i) => (
                    <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id} className="border-t border-line/70 first:border-t-0">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="block font-mono font-bold">{w.label}</span>
                      <button type="button" className="font-mono text-[12px] text-muted underline-offset-4 hover:text-gold hover:underline" onClick={() => onOpen(w.bookingCode)}>
                        {w.bookingCode}
                      </button>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 font-semibold">{w.customerName}</td>
                    <td className="max-w-[14rem] truncate px-4 py-3">{w.device}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{dayLabel(w.startsOn, lang)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex items-center gap-2">
                        {dayLabel(w.endsOn, lang)}
                        <WarrantyStateBadge state={w.state} />
                      </span>
                      {left(w) && <span className="block text-[12px] text-muted">{left(w)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a className="text-[13px] font-semibold text-gold underline-offset-4 hover:underline" href={pdfUrl.warranty(w.id)} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        {items && items.length < total && (
          <div className="mt-4 text-center">
            <button type="button" className="btn btn-ghost" onClick={() => void more()}>
              {c.customers.more}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
