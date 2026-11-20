import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { api } from '../api'
import { Card, Loading, Notice, StatusBadge, useDateFormat } from '../ui'
import { addDays, shopDate, type PickupJob } from './types'

function Day({ label, date, onOpen, version }: { label: string; date: string; onOpen: (code: string) => void; version: number }) {
  const { t } = useI18n()
  const p = t.owner.pickups
  const fmtDate = useDateFormat()
  const [jobs, setJobs] = useState<PickupJob[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    setJobs(null)
    void api<{ jobs: PickupJob[] }>(`/api/admin/pickups?date=${date}`).then((result) => {
      if (!live) return
      if (result.ok) setJobs(result.data.jobs)
      else setError(true)
    })
    return () => {
      live = false
    }
  }, [date, version])

  return (
    <section aria-labelledby={`pk-${date}`}>
      <h3 id={`pk-${date}`} className="text-xl font-bold">
        {label} <span className="text-[15px] font-normal text-muted">{fmtDate.weekday(date)}</span>
      </h3>
      <div className="mt-3 grid gap-3">
        {error && <Notice tone="error">{t.owner.loadError}</Notice>}
        {!jobs && !error && <Loading label={t.account.loading} />}
        {jobs?.length === 0 && <p className="text-muted">{p.none}</p>}
        {jobs?.map((job) => (
          <Card key={job.code} className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono font-bold">
                {fmtDate.time(job.window.from)}–{fmtDate.time(job.window.to)}{' '}
                <button type="button" className="text-gold underline-offset-4 hover:underline" onClick={() => onOpen(job.code)}>
                  {job.code}
                </button>
              </p>
              <div className="flex items-center gap-2">
                {job.urgent && <span className="rounded-full bg-gold px-2.5 py-0.5 text-[12px] font-bold text-on-gold">{p.urgent}</span>}
                <StatusBadge status={job.status} />
              </div>
            </div>
            <p className="mt-2 font-semibold">{job.address}</p>
            <p className="text-[14px] text-muted">
              {job.name}
              {job.device ? `, ${job.device}` : ''} · {t.owner.detail.trips[job.trips]}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn btn-gold h-10 min-h-0" href={job.mapLink} target="_blank" rel="noreferrer">
                {p.map}
              </a>
              <a className="btn btn-ghost h-10 min-h-0" href={`tel:${job.phone.replace(/[^+\d]/g, '')}`}>
                {p.call} {job.phone}
              </a>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}

export function PickupsTab({ onOpen, version = 0 }: { onOpen: (code: string) => void; version?: number }) {
  const { t } = useI18n()
  const today = shopDate()
  return (
    <div>
      <h2 className="display-2 text-2xl">{t.owner.pickups.title}</h2>
      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        <Day label={t.owner.pickups.today} date={today} onOpen={onOpen} version={version} />
        <Day label={t.owner.pickups.tomorrow} date={addDays(today, 1)} onOpen={onOpen} version={version} />
      </div>
    </div>
  )
}
