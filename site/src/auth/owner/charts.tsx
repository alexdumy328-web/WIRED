export type Bar = { key: string; label: string; value: number; tone?: string }

export function RowChart({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  return (
    <ul aria-label={title} className="flex flex-col gap-2.5">
      {bars.map((bar) => (
        <li key={bar.key} className="grid min-w-0 grid-cols-[minmax(5.5rem,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-[14px]">
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
