import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

export type TrendSeries = {
  key: string
  label: string
  /** CSS custom property holding the series colour (validated per theme in index.css). */
  colorVar: '--chart-1' | '--chart-2'
}

export type TrendRow = { label: string; long: string } & Record<string, number | string>

type Colors = Record<'--chart-1' | '--chart-2' | '--line' | '--muted' | '--surface' | '--ink', string>
const VARS: (keyof Colors)[] = ['--chart-1', '--chart-2', '--line', '--muted', '--surface', '--ink']

/** Reads the chart colours from CSS and follows theme changes (data-theme switch or the system setting). */
function useColors(): Colors {
  const read = (): Colors => {
    const cs = getComputedStyle(document.documentElement)
    return Object.fromEntries(VARS.map((v) => [v, cs.getPropertyValue(v).trim()])) as Colors
  }
  const [colors, setColors] = useState<Colors>(read)
  useEffect(() => {
    const update = () => setColors(read())
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    return () => {
      mo.disconnect()
      mq.removeEventListener('change', update)
    }
  }, [])
  return colors
}

function useReducedMotion() {
  const [rm, setRm] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setRm(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return rm
}

/**
 * Line chart for a trend over time: one y axis, 2px lines, a legend plus a name at the end
 * of each line, a crosshair tooltip and the same numbers as a table underneath.
 */
export function TrendChart({
  title,
  lead,
  rows,
  series,
  format,
  tableLabel,
  periodLabel,
  empty,
}: {
  title: string
  lead: string
  rows: TrendRow[]
  series: TrendSeries[]
  format: (n: number) => string
  tableLabel: string
  periodLabel: string
  empty: string
}) {
  const c = useColors()
  const rm = useReducedMotion()
  const hasData = rows.some((r) => series.some((s) => Number(r[s.key]) > 0))
  const last = rows.length - 1
  // The legend above names the series; the end point only marks the latest value.

  const Tip = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null
    const row = rows.find((r) => r.label === label)
    return (
      <div className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] shadow-lg">
        <p className="font-semibold">{row?.long ?? label}</p>
        <ul className="mt-1 grid gap-0.5">
          {series.map((s) => {
            const p = payload.find((x) => x.dataKey === s.key)
            return (
              <li key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: c[s.colorVar] }} aria-hidden="true" />
                <span className="text-muted">{s.label}</span>
                <span className="ml-auto pl-3 font-semibold tabular-nums">{format(Number(p?.value ?? 0))}</span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <figure aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-0.5 max-w-[60ch] text-[14px] text-muted">{lead}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" aria-label={title}>
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: c[s.colorVar] }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 h-60" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c['--line']} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: c['--line'] }} tick={{ fill: c['--muted'], fontSize: 12 }} minTickGap={12} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: c['--muted'], fontSize: 12 }} tickFormatter={(v: number) => format(v)} width={64} allowDecimals={false} />
            <Tooltip content={Tip} cursor={{ stroke: c['--muted'], strokeWidth: 1 }} isAnimationActive={false} />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={c[s.colorVar]}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; index?: number }) =>
                  props.index === last && props.cx != null && props.cy != null ? (
                    <g key={`end-${s.key}`}>
                      <circle cx={props.cx} cy={props.cy} r={4} fill={c[s.colorVar]} stroke={c['--surface']} strokeWidth={2} />
                    </g>
                  ) : (
                    <g key={`d-${s.key}-${props.index}`} />
                  )
                }
                activeDot={{ r: 5, fill: c[s.colorVar], stroke: c['--surface'], strokeWidth: 2 }}
                isAnimationActive={!rm}
                animationDuration={500}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!hasData && <p className="mt-2 text-[13px] text-muted">{empty}</p>}

      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-ink">{tableLabel}</summary>
        <div className="mt-2 overflow-x-auto" data-lenis-prevent>
          <table className="w-full min-w-[360px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-1.5 pr-3 font-semibold">{periodLabel}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 pr-3 text-right font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.long} className="border-b border-line/60">
                  <td className="py-1.5 pr-3">{r.long}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 pr-3 text-right tabular-nums">
                      {format(Number(r[s.key] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
