/** Percent change of the last four points against the four before; null when there is no base. */
export function change(series: number[]): number | null {
  if (series.length < 8) return null
  const sum = (xs: number[]) => xs.reduce((a, n) => a + n, 0)
  const now = sum(series.slice(-4))
  const before = sum(series.slice(-8, -4))
  if (before === 0) return null
  return Math.round(((now - before) / before) * 100)
}

/** Small trend line under a KPI. Decorative: the full chart and its table sit further down. */
function Sparkline({ values }: { values: number[] }) {
  const w = 120
  const h = 32
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? w / (values.length - 1) : w
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-full overflow-visible" aria-hidden="true">
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill="var(--chart-1)" fillOpacity={0.12} stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--chart-1)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function KpiCard({ label, value, series, delta, note }: { label: string; value: string; series?: number[]; delta?: number | null; note?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4 sm:p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="display-2 whitespace-nowrap text-[clamp(1.5rem,2.2vw,1.9rem)] leading-none tabular-nums">{value}</p>
      {series && series.some((v) => v > 0) && <Sparkline values={series} />}
      {delta != null && (
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <span className={`rounded-full px-2 py-0.5 font-bold tabular-nums ${delta > 0 ? 'bg-ok/12 text-ok' : delta < 0 ? 'bg-danger/12 text-danger' : 'bg-surface-2'}`}>
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
          {note}
        </p>
      )}
    </section>
  )
}
