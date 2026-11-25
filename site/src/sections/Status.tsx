import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { catalog, categoryOrder } from '../data/catalog'
import { Section } from '../components/Section'
import { useScrollGuard } from '../lib/scroll-guard'
import type { BookingStatus } from '../types'

type Lookup = { code: string; status: BookingStatus; updatedAt: string }
const statusOrder: BookingStatus[] = ['received', 'diagnosis', 'waiting-parts', 'repairing', 'ready', 'done']

/** Typical turnaround per shop category, in hours: median of job minimums to median of job maximums. */
function turnaround() {
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  return categoryOrder
    .filter((c) => c !== 'auto')
    .map((c) => {
      const jobs = catalog.filter((j) => j.category === c)
      return { c, min: median(jobs.map((j) => j.etaHours[0])), max: median(jobs.map((j) => j.etaHours[1])) }
    })
}

function TurnaroundChart() {
  const { t } = useI18n()
  const rows = turnaround()
  const maxH = Math.max(...rows.map((r) => r.max), 24)
  const ticksDays = Array.from({ length: Math.ceil(maxH / 24) + 1 }, (_, i) => i)
  const scale = (h: number) => (h / (ticksDays.at(-1)! * 24)) * 100
  const label = (h: number) => (h < 24 ? fmt(t.eta.hours, { n: h }) : fmt(t.eta.days, { n: Math.ceil(h / 24) }))

  return (
    <figure>
      <figcaption className="text-[15px] font-semibold" style={{ fontStretch: '110%' }}>
        {t.eta.chartTitle}
      </figcaption>
      <div className="mt-4 grid grid-cols-[minmax(7rem,auto)_1fr] items-center pr-12 gap-x-4 gap-y-3 text-[14px]">
        {rows.map((r) => (
          <div key={r.c} className="contents">
            <span className="text-muted">{t.services.categories[r.c as Exclude<typeof r.c, 'auto'>].name}</span>
            <div className="relative h-6" title={`${label(r.min)} – ${label(r.max)}`}>
              {ticksDays.map((d) => (
                <span key={d} className="absolute inset-y-0 w-px bg-line" style={{ left: `${scale(d * 24)}%` }} aria-hidden="true" />
              ))}
              <motion.span
                className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-gold"
                style={{ left: `${scale(r.min)}%` }}
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.max(scale(r.max) - scale(r.min), 1.2)}%` }}
                viewport={{ once: true, margin: '-10% 0px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-2 text-[12px] text-muted" style={{ left: `${scale(r.max)}%` }}>
                {label(r.max)}
              </span>
            </div>
          </div>
        ))}
        <span />
        <div className="relative h-4 text-[12px] text-muted" aria-hidden="true">
          {ticksDays.map((d) => (
            <span key={d} className="absolute -translate-x-1/2" style={{ left: `${scale(d * 24)}%` }}>
              {d}
            </span>
          ))}
        </div>
        <span />
        <span className="text-right text-[12px] text-muted">{t.eta.chartUnit}</span>
      </div>
    </figure>
  )
}

function Tracker() {
  const { t, lang } = useI18n()
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'notFound' | 'error'>('idle')
  const [result, setResult] = useState<Lookup | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const hold = useScrollGuard(formRef, code.trim().length > 0)

  const lookup = async (raw: string) => {
    const c = raw.trim().toUpperCase()
    if (!c) return
    setState('loading')
    setResult(null)
    try {
      const r = await fetch(`/api/bookings/${encodeURIComponent(c)}`)
      if (r.status === 404) return setState('notFound')
      if (!r.ok) return setState('error')
      setResult((await r.json()) as Lookup)
      setState('idle')
    } catch {
      setState('error')
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void lookup(code)
  }

  // Booking emails link to /?cod=NT-XXXX#status: fill the code in and look it up straight away.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('cod')?.trim().toUpperCase() ?? ''
    if (!/^NT-[A-Z0-9]{4}$/.test(c)) return
    setCode(c)
    void lookup(c)
    // The hash alone may land before the page has its height; bring the tracker into view once laid out.
    requestAnimationFrame(() => document.getElementById('status')?.scrollIntoView({ block: 'start' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [])

  // An unrepairable device sits where a ready one would: it is waiting to go back.
  const idx = result ? statusOrder.indexOf(result.status === 'unrepairable' ? 'ready' : result.status) : -1
  const barTone = result?.status === 'unrepairable' ? 'bg-rose' : 'bg-ok'
  const when = result
    ? new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest' }).format(new Date(result.updatedAt))
    : ''

  return (
    <div>
      <h3 className="display-2 text-2xl">{t.track.title}</h3>
      <p className="measure mt-2 text-[15px] text-muted">
        {t.track.lead.split(/(NT-[A-Z0-9]{4})/).map((part, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{part}</span> : part))}
      </p>
      <form ref={formRef} onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="track-code">
          {t.track.title}
        </label>
        <input
          id="track-code"
          className="field uppercase sm:max-w-[14rem]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t.track.placeholder}
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
        />
        <button type="submit" className="btn btn-ghost" disabled={state === 'loading'}>
          {t.track.button}
        </button>
      </form>
      <div aria-live="polite" className="min-h-6">
        <AnimatePresence>
          {hold && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-[14px] text-gold">
              {t.scrollHold}
            </motion.p>
          )}
        </AnimatePresence>
        {state === 'loading' && <p className="mt-3 text-[15px] text-muted">{t.account.loading}</p>}
        {state === 'notFound' && <p className="mt-3 text-[15px] text-muted">{t.track.notFound}</p>}
        {state === 'error' && <p className="mt-3 text-[15px] text-muted">{t.track.error}</p>}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
              <p className="text-[13px] text-muted">{result.code}</p>
              <p className="font-semibold" style={{ fontStretch: '110%' }}>
                {t.track.statuses[result.status]}
              </p>
              {/* A cancelled booking has no place on the progress bar. */}
              {idx >= 0 && (
                <ol className="mt-3 flex gap-1.5" aria-label={t.track.title}>
                  {statusOrder.map((s, i) => (
                    <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? barTone : 'bg-line'}`} title={t.track.statuses[s]} />
                  ))}
                </ol>
              )}
              <p className="mt-2 text-[13px] text-muted">{fmt(t.track.updated, { when })}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function Status() {
  const { t } = useI18n()
  const [queue, setQueue] = useState<number | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/stats', { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { queue?: number } | null) => d && typeof d.queue === 'number' && setQueue(d.queue))
      .catch(() => {})
    return () => ctl.abort()
  }, [])

  return (
    <Section
      id="status"
      title={t.eta.title}
      lead={t.eta.lead}
      aside={
        queue !== null && (
          <p className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[14px]">
            <span className="size-2 rounded-full bg-ok" />
            {fmt(t.eta.queueNow, { n: queue })}
          </p>
        )
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="rounded-[24px] border border-line bg-surface p-5 sm:p-8">
          <TurnaroundChart />
        </div>
        <div className="rounded-[24px] border border-line bg-surface p-5 max-lg:order-first sm:p-8">
          <Tracker />
        </div>
      </div>
    </Section>
  )
}
