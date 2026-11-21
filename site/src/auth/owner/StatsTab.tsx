import { useEffect, useState } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Card, Loading, Notice } from '../ui'
import { KpiCard, change } from './KpiCard'
import { RowChart } from './charts'
import { TrendChart, type TrendRow } from './TrendChart'
import { BOOKING_STATUSES } from './constants'
import type { Stats } from './types'

const tone = { received: 'bg-muted', diagnosis: 'bg-blue', 'waiting-parts': 'bg-gold', repairing: 'bg-gold', ready: 'bg-ok', done: 'bg-ok', cancelled: 'bg-line' } as const

export function StatsTab() {
  const { t, lang } = useI18n()
  const s = t.owner.stats
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState(false)
  const [range, setRange] = useState<'weeks' | 'months'>('weeks')

  useEffect(() => {
    let live = true
    void api<Stats>('/api/admin/stats').then((result) => {
      if (!live) return
      if (result.ok) setStats(result.data)
      else setError(true)
    })
    return () => {
      live = false
    }
  }, [])

  if (error) return <Notice tone="error">{t.owner.loadError}</Notice>
  if (!stats) return <Loading label={t.account.loading} />

  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const lei = new Intl.NumberFormat(locale)
  const tr = s.trend
  // Trend rows: short axis label + a full period name for the tooltip and the table.
  const day = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'numeric' })
  const dayLong = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  const mon = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short' })
  const monLong = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' })
  const weekly = stats.trend?.weekly ?? []
  const points = (range === 'weeks' ? stats.trend?.weekly : stats.trend?.monthly) ?? []
  const rows: TrendRow[] = points.map((p) => {
    const d = new Date(`${p.start}T12:00:00Z`)
    return {
      label: range === 'weeks' ? day.format(d) : mon.format(d),
      long: range === 'weeks' ? fmt(tr.weekOf, { date: dayLong.format(d) }) : monLong.format(d),
      earned: p.doneLei + p.transportLei,
      booked: p.bookedLei,
      created: p.created,
      done: p.done,
    }
  })
  const leiFmt = (n: number) => `${lei.format(Math.round(n))} lei`
  const countFmt = (n: number) => lei.format(Math.round(n))
  const categoryName = (key: string) => (key in t.services.categories ? t.services.categories[key as keyof typeof t.services.categories].name : (s.other[key as 'auto' | 'custom'] ?? key))

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={s.total} value={lei.format(stats.total)} series={weekly.map((w) => w.created)} delta={change(weekly.map((w) => w.created))} note={s.delta} />
        <KpiCard label={s.active} value={lei.format(stats.active)} />
        <KpiCard label={`${s.revenue}, ${s.done.toLowerCase()}`} value={`${lei.format(stats.revenue.doneLei)} lei`} series={weekly.map((w) => w.doneLei + w.transportLei)} delta={change(weekly.map((w) => w.doneLei + w.transportLei))} note={s.delta} />
        <KpiCard label={`${s.revenue}, ${s.pipeline.toLowerCase()}`} value={`${lei.format(stats.revenue.pipelineLei)} lei`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold text-muted">{tr.range}</span>
        <div role="group" aria-label={tr.range} className="inline-grid grid-cols-2 rounded-full border border-line p-0.5 text-[14px]">
          {(['weeks', 'months'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={`rounded-full px-4 py-1.5 font-semibold transition-colors ${range === r ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {tr.ranges[r]}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <TrendChart
          title={tr.income}
          lead={tr.incomeLead}
          rows={rows}
          series={[
            { key: 'earned', label: tr.series.earned, colorVar: '--chart-1' },
            { key: 'booked', label: tr.series.booked, colorVar: '--chart-2' },
          ]}
          format={leiFmt}
          tableLabel={tr.table}
          periodLabel={tr.period}
          empty={tr.empty}
        />
      </Card>

      <Card>
        <TrendChart
          title={tr.bookings}
          lead={tr.bookingsLead}
          rows={rows}
          series={[
            { key: 'created', label: tr.series.created, colorVar: '--chart-2' },
            { key: 'done', label: tr.series.done, colorVar: '--chart-1' },
          ]}
          format={countFmt}
          tableLabel={tr.table}
          periodLabel={tr.period}
          empty={tr.empty}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">{s.byCategory}</h2>
          <div className="mt-4">
            <RowChart
              title={s.byCategory}
              bars={Object.entries(stats.byCategory)
                .sort((x, y) => y[1] - x[1])
                .map(([key, value]) => ({ key, label: categoryName(key), value }))}
            />
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">{s.byStatus}</h2>
          <div className="mt-4">
            <RowChart title={s.byStatus} bars={BOOKING_STATUSES.map((key) => ({ key, label: t.track.statuses[key], value: stats.byStatus[key] ?? 0, tone: tone[key] }))} />
          </div>
        </Card>
      </div>
      <p className="text-[13px] text-muted">{s.note}</p>
    </div>
  )
}
