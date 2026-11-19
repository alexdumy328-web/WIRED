import { useEffect, useState } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Card, Loading, Notice } from '../ui'
import { ColumnChart, RowChart } from './charts'
import { BOOKING_STATUSES } from './constants'
import type { Stats } from './types'

const tone = { received: 'bg-muted', diagnosis: 'bg-blue', 'waiting-parts': 'bg-gold', repairing: 'bg-gold', ready: 'bg-ok', done: 'bg-ok' } as const

export function StatsTab() {
  const { t, lang } = useI18n()
  const s = t.owner.stats
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState(false)

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

  if (error) return <Notice tone="error">{t.owner.detail.error}</Notice>
  if (!stats) return <Loading label={t.account.loading} />

  const week = new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'numeric' })
  const lei = new Intl.NumberFormat(lang === 'ro' ? 'ro-RO' : 'en-GB')
  const categoryName = (key: string) => (key in t.services.categories ? t.services.categories[key as keyof typeof t.services.categories].name : (s.other[key as 'auto' | 'custom'] ?? key))

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="!p-4">
          <p className="text-[13px] text-muted">{s.total}</p>
          <p className="display-2 text-3xl">{stats.total}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[13px] text-muted">{s.active}</p>
          <p className="display-2 text-3xl">{stats.active}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[13px] text-muted">
            {s.revenue}, {s.done.toLowerCase()}
          </p>
          <p className="display-2 text-3xl">{fmt('{n} lei', { n: lei.format(stats.revenue.doneLei) })}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[13px] text-muted">
            {s.revenue}, {s.pipeline.toLowerCase()}
          </p>
          <p className="display-2 text-3xl">{fmt('{n} lei', { n: lei.format(stats.revenue.pipelineLei) })}</p>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-bold">{s.perWeek}</h2>
        <div className="mt-4">
          <ColumnChart title={s.perWeek} bars={stats.weeks.map((w) => ({ key: w.weekStart, label: week.format(new Date(`${w.weekStart}T12:00:00Z`)), value: w.count }))} />
        </div>
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
