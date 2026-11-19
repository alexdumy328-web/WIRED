import type { ReactNode } from 'react'

export type Bar = { key: string; label: string; value: number; tone?: string }

/**
 * Column chart in plain HTML. It is a list, so screen readers get "label, value" per item
 * and nothing depends on colour.
 */
export function ColumnChart({ title, bars, caption }: { title: string; bars: Bar[]; caption?: ReactNode }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <figure aria-label={title}>
      <ul className="flex h-48 items-end gap-1.5 sm:gap-2">
        {bars.map((bar) => (
          <li key={bar.key} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center" aria-label={`${bar.label}: ${bar.value}`}>
            <span className="text-[12px] font-semibold tabular-nums">{bar.value}</span>
            <span
              className={`mt-1 block w-full rounded-t-md ${bar.tone ?? 'bg-gold'}`}
              style={{ height: `${Math.max(bar.value > 0 ? 4 : 1, (bar.value / max) * 100)}%` }}
              aria-hidden="true"
            />
          </li>
        ))}
      </ul>
      <ul className="mt-1.5 flex gap-1.5 sm:gap-2" aria-hidden="true">
        {bars.map((bar) => (
          <li key={bar.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted">
            {bar.label}
          </li>
        ))}
      </ul>
      {caption && <figcaption className="mt-3 text-[13px] text-muted">{caption}</figcaption>}
    </figure>
  )
}

/** Horizontal bars with the label on the left and the number on the right. */
export function RowChart({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <ul aria-label={title} className="grid gap-2.5">
      {bars.map((bar) => (
        <li key={bar.key} className="grid grid-cols-[minmax(6rem,9rem)_1fr_2.5rem] items-center gap-3 text-[14px]">
          <span className="truncate">{bar.label}</span>
          <span className="h-3 rounded-full bg-surface-2" aria-hidden="true">
            <span className={`block h-full rounded-full ${bar.tone ?? 'bg-gold'}`} style={{ width: `${(bar.value / max) * 100}%`, minWidth: bar.value > 0 ? 6 : 0 }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{bar.value}</span>
        </li>
      ))}
    </ul>
  )
}
