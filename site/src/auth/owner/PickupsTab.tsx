import { useEffect, useRef, useState } from 'react'
import { fmt, useI18n } from '../../i18n'
import { api } from '../api'
import { Notice, StatusBadge, useDateFormat } from '../ui'
import { DateButton } from '../../components/DatePopover'
import { Chevron, Phone, Pin } from '../../components/Icons'
import { addDays, shopDate, type PickupJob } from './types'
import { useBusy } from './useBusy'

export function PickupsTab({ onOpen, version = 0 }: { onOpen: (code: string) => void; version?: number }) {
  const { t, lang } = useI18n()
  const p = t.owner.pickups
  const fmtDate = useDateFormat()
  const today = shopDate()
  const [date, setDate] = useState(today)
  const [jobs, setJobs] = useState<PickupJob[] | null>(null)
  const [error, setError] = useState(false)
  const busy = useBusy(version)
  const shown = useRef(date)

  useEffect(() => {
    let live = true
    // A reload after a save keeps the list on screen; only a new day starts empty.
    if (shown.current !== date) setJobs(null)
    shown.current = date
    setError(false)
    void api<{ jobs: PickupJob[] }>(`/api/admin/pickups?date=${date}`).then((result) => {
      if (!live) return
      if (result.ok) setJobs(result.data.jobs)
      else setError(true)
    })
    return () => {
      live = false
    }
  }, [date, version])

  const lei = new Intl.NumberFormat(lang === 'ro' ? 'ro-RO' : 'en-GB')
  const transport = jobs?.reduce((n, j) => n + (j.quoteLei ?? 0), 0) ?? 0
  const quick = [
    [p.today, today],
    [p.tomorrow, addDays(today, 1)],
  ] as const

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {quick.map(([label, d]) => (
          <button
            key={d}
            type="button"
            aria-pressed={date === d}
            onClick={() => setDate(d)}
            className={`rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${date === d ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
        <div className="flex items-center rounded-full border border-line bg-surface p-0.5">
          <button type="button" aria-label={p.prevDay} onClick={() => setDate(addDays(date, -1))} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <Chevron className="size-4 rotate-90" />
          </button>
          <button type="button" aria-label={p.nextDay} onClick={() => setDate(addDays(date, 1))} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <Chevron className="size-4 -rotate-90" />
          </button>
        </div>
        <div className="w-full sm:w-72">
          <DateButton lang={lang} today={today} value={date} onChange={setDate} label={p.pickDay} marks={busy.pickupMarks} onView={busy.load} />
        </div>
      </div>

      {jobs && jobs.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 text-[14px]">
          <span className="rounded-full bg-surface px-3 py-1 font-semibold shadow-[inset_0_0_0_1px_var(--line)]">{jobs.length === 1 ? p.stop : fmt(p.stops, { n: jobs.length })}</span>
          <span className="rounded-full bg-surface px-3 py-1 font-semibold shadow-[inset_0_0_0_1px_var(--line)]">{fmt(p.transport, { n: lei.format(transport) })}</span>
        </div>
      )}

      <div className="mt-5">
        {error && <Notice tone="error">{t.owner.loadError}</Notice>}
        {!jobs && !error && (
          <div className="grid gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-[18px] bg-surface" />
            ))}
          </div>
        )}
        {jobs?.length === 0 && <div className="rounded-[20px] border border-dashed border-line py-14 text-center text-muted">{p.none}</div>}
        {jobs && jobs.length > 0 && (
          <ol className="relative grid gap-3">
            {jobs.map((job, i) => (
              <li key={job.code} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
                <div className="relative flex justify-center">
                  {i < jobs.length - 1 && <span className="absolute top-9 bottom-[-0.75rem] w-px bg-line" aria-hidden="true" />}
                  <span className="relative grid size-9 place-items-center rounded-full bg-ok text-[14px] font-bold text-bg">{i + 1}</span>
                </div>
                <article className="rounded-[18px] border border-line bg-surface p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[15px] font-bold">
                      {fmtDate.time(job.window.from)}–{fmtDate.time(job.window.to)}
                    </p>
                    <div className="flex items-center gap-2">
                      {job.urgent && <span className="rounded-full bg-danger/12 px-2.5 py-0.5 text-[12px] font-bold text-danger">{p.urgent}</span>}
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                  <p className="mt-2 flex items-start gap-2 text-[16px] font-semibold">
                    <Pin className="mt-0.5 size-4 shrink-0 text-ok" />
                    {job.address}
                  </p>
                  <p className="mt-1 text-[14px] text-muted">
                    {job.name}
                    {job.device ? `, ${job.device}` : ''} · {t.owner.detail.trips[job.trips]} ·{' '}
                    <button type="button" className="font-mono font-semibold text-gold underline-offset-4 hover:underline" onClick={() => onOpen(job.code)}>
                      {job.code}
                    </button>
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    <a className="btn h-10 min-h-0 gap-2 bg-ok text-bg hover:brightness-110" href={job.mapLink} target="_blank" rel="noreferrer">
                      <Pin className="size-4" />
                      {p.map}
                    </a>
                    <a className="btn btn-ghost h-10 min-h-0 gap-2" href={`tel:${job.phone.replace(/[^+\d]/g, '')}`}>
                      <Phone className="size-4" />
                      {p.call} {job.phone}
                    </a>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
