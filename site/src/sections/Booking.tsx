import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { catalog } from '../data/catalog'
import { estimate, formatEta, formatLei } from '../lib/estimate'
import { daysAhead, slotsFor } from '../lib/slots'
import { usePreselect } from '../lib/booking-store'
import { categoryStop, useStation } from '../lib/stations'
import type { BookingRequest, ServiceMode } from '../types'
import type { StopId } from '../three/contract'
import { Check } from '../components/Icons'

type Step = 0 | 1 | 2 | 3
type Errors = Partial<Record<string, string>>

const phoneRe = /^[+0-9 ()-]{8,20}$/
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[14px] font-semibold">
        {label}
        {hint && <span className="font-normal text-muted"> ({hint})</span>}
      </span>
      {children}
      {error && <span className="text-[13px] text-[#c4443b]">{error}</span>}
    </label>
  )
}

export function Booking() {
  const { t, lang, L } = useI18n()
  const pre = usePreselect()
  const [step, setStep] = useState<Step>(0)
  const [mode, setMode] = useState<ServiceMode>('shop')
  const [jobIds, setJobIds] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [customOn, setCustomOn] = useState(false)
  const [device, setDevice] = useState({ brand: '', model: '', year: '' })
  const [issue, setIssue] = useState('')
  const [day, setDay] = useState('')
  const [slot, setSlot] = useState('')
  const [location, setLocation] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', email: '' })
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [taken, setTaken] = useState<string[]>([])
  const [now] = useState(() => new Date())

  // "Book this" buttons elsewhere on the page land here with jobs preselected.
  useEffect(() => {
    if (!pre.nonce || !pre.mode) return
    setMode(pre.mode)
    setJobIds(pre.jobIds)
    setDone(null)
    setStep(pre.jobIds.length ? 1 : 0)
  }, [pre.nonce, pre.mode, pre.jobIds])

  const jobs = useMemo(() => catalog.filter((j) => j.mode === mode), [mode])
  const picked = useMemo(() => catalog.filter((j) => jobIds.includes(j.id)), [jobIds])
  const est = estimate(picked, customOn && custom.trim().length > 0)
  const days = useMemo(() => daysAhead(now, 12, mode), [now, mode])
  const slots = day ? slotsFor(day, mode, new Date(), taken) : []

  // The camera looks at the bench for the first picked job, otherwise the counter.
  const stop: StopId = step === 1 && picked[0] ? categoryStop[picked[0].category] : mode === 'mobile' && step > 0 ? 'door' : 'counter'
  const ref = useStation<HTMLElement>({ stop, frame: -0.5 })

  useEffect(() => {
    if (!days.length) return
    const ctl = new AbortController()
    fetch(`/api/slots?mode=${mode}&from=${days[0]}&to=${days[days.length - 1]}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { taken: [] }))
      .then((d: { taken?: string[] }) => setTaken(d.taken ?? []))
      .catch(() => {})
    return () => ctl.abort()
  }, [mode, days])

  useEffect(() => {
    setSlot('')
  }, [day, mode])

  const toggleJob = (id: string) => setJobIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const validate = (s: Step): Errors => {
    const e: Errors = {}
    if (s === 1) {
      if (!jobIds.length && !(customOn && custom.trim())) e.jobs = t.booking.errors.pickOne
      if (issue.trim().length < 3) e.issue = t.booking.errors.required
    }
    if (s === 2) {
      if (!slot) e.slot = t.booking.errors.required
      if (mode === 'mobile' && location.trim().length < 3) e.location = t.booking.errors.required
    }
    if (s === 3) {
      if (contact.name.trim().length < 2) e.name = t.booking.errors.required
      if (!phoneRe.test(contact.phone.trim())) e.phone = t.booking.errors.phone
      if (contact.email && !emailRe.test(contact.email.trim())) e.email = t.booking.errors.email
      if (!consent) e.consent = t.booking.errors.required
    }
    return e
  }

  const next = () => {
    const e = validate(step)
    setErrors(e)
    if (Object.keys(e).length) return
    setStep((s) => Math.min(s + 1, 3) as Step)
  }

  const submit = async () => {
    const e = validate(3)
    setErrors(e)
    if (Object.keys(e).length) return
    const body: BookingRequest = {
      mode,
      jobIds,
      custom: customOn && custom.trim() ? custom.trim() : undefined,
      device: {
        brand: device.brand.trim() || undefined,
        model: device.model.trim() || undefined,
        year: device.year.trim() || undefined,
      },
      issue: issue.trim(),
      slot,
      location: mode === 'mobile' ? location.trim() : undefined,
      contact: { name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email.trim() || undefined },
      estimate: { priceFrom: est.priceFrom, priceTo: est.priceTo, etaHours: est.etaHours },
      lang,
    }
    setSending(true)
    try {
      const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.status === 409) {
        setTaken((x) => [...x, slot])
        setSlot('')
        setStep(2)
        setErrors({ slot: t.booking.when.noSlots })
        return
      }
      if (!r.ok) throw new Error(String(r.status))
      const d = (await r.json()) as { code: string }
      setDone(d.code)
    } catch {
      setErrors({ server: t.booking.errors.server })
    } finally {
      setSending(false)
    }
  }

  const reset = () => {
    setDone(null)
    setStep(0)
    setJobIds([])
    setCustom('')
    setCustomOn(false)
    setIssue('')
    setDay('')
    setSlot('')
    setErrors({})
  }

  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const dayLabel = (d: string) => {
    const date = new Date(`${d}T12:00:00Z`)
    return {
      wd: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Europe/Bucharest' }).format(date),
      dm: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' }).format(date),
    }
  }
  const stepNames = [t.booking.steps.where, t.booking.steps.what, t.booking.steps.when, t.booking.steps.who]
  const priceText =
    est.priceFrom === 0
      ? '–'
      : est.priceTo > est.priceFrom
        ? fmt(t.services.range, { from: formatLei(est.priceFrom, lang).replace(/\s?lei$/, ''), to: formatLei(est.priceTo, lang).replace(/\s?lei$/, '') })
        : formatLei(est.priceFrom, lang)

  return (
    <section id="programare" ref={ref} className="pointer-events-none relative z-10 scroll-mt-16 py-10 lg:min-h-[100vh] lg:py-20">
      <div className="h-[40vh] lg:hidden" />
      <div className="mx-auto flex max-w-[1320px] justify-end px-4 sm:px-6">
        <div className="panel pointer-events-auto w-full p-5 sm:p-8 lg:w-[min(52rem,62%)]">
          <h2 className="display-2 text-[clamp(1.9rem,3.6vw,3rem)]">{t.booking.title}</h2>
          <p className="measure mt-3 text-muted">{t.booking.lead}</p>

          {done ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8" role="status">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-ok text-white">
                  <Check />
                </span>
                <h3 className="display-2 text-2xl">{t.booking.success.title}</h3>
              </div>
              <p className="measure mt-4">{fmt(t.booking.success.body, { code: done })}</p>
              <p className="mt-6 text-[14px] text-muted">{t.booking.success.code}</p>
              <p className="display text-5xl tracking-wide">{done}</p>
              <button type="button" className="btn btn-ghost mt-8" onClick={reset}>
                {t.booking.success.again}
              </button>
            </motion.div>
          ) : (
            <>
              {/* Step indicator: vias on a trace; past steps are clickable. */}
              <ol className="mt-7 flex items-center">
                {stepNames.map((name, i) => (
                  <li key={name} className="flex flex-1 items-center last:flex-none">
                    <button
                      type="button"
                      onClick={() => i < step && setStep(i as Step)}
                      disabled={i > step}
                      aria-current={i === step ? 'step' : undefined}
                      className="flex items-center gap-2 text-[14px] disabled:cursor-default"
                    >
                      <span
                        className={`grid size-6 place-items-center rounded-full border-2 text-[11px] font-bold transition-colors ${
                          i < step ? 'border-gold bg-gold text-on-gold' : i === step ? 'border-gold text-gold' : 'border-line text-muted'
                        }`}
                      >
                        {i < step ? <Check className="size-3.5" /> : i + 1}
                      </span>
                      <span className={`hidden sm:inline ${i === step ? 'font-semibold' : 'text-muted'}`}>{name}</span>
                    </button>
                    {i < 3 && <span className={`mx-2 h-[2px] flex-1 transition-colors ${i < step ? 'bg-gold' : 'bg-line'}`} />}
                  </li>
                ))}
              </ol>

              <div className="mt-7 grid gap-8 md:grid-cols-[minmax(0,1fr)_15rem]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="min-w-0"
                  >
                    {step === 0 && (
                      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.booking.steps.where}>
                        {(
                          [
                            ['shop', t.booking.where.shop, t.booking.where.shopHint],
                            ['mobile', t.booking.where.mobile, t.booking.where.mobileHint],
                          ] as const
                        ).map(([m, title, hint]) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={mode === m}
                            onClick={() => {
                              if (m !== mode) setJobIds([])
                              setMode(m)
                            }}
                            className={`rounded-[18px] border p-5 text-left transition-colors ${mode === m ? 'border-gold bg-surface' : 'border-line hover:border-muted'}`}
                          >
                            <span className="block font-semibold" style={{ fontStretch: '110%' }}>
                              {title}
                            </span>
                            <span className="mt-1 block text-[14px] text-muted">{hint}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {step === 1 && (
                      <div className="grid gap-5">
                        <fieldset>
                          <legend className="text-[14px] font-semibold">{t.booking.what.pickJobs}</legend>
                          <div className="mt-2 max-h-[18rem] overflow-y-auto overscroll-contain rounded-[14px] border border-line" data-lenis-prevent>
                            {jobs.map((j) => {
                              const on = jobIds.includes(j.id)
                              return (
                                <label key={j.id} className={`flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3 last:border-0 ${on ? 'bg-surface' : ''}`}>
                                  <input type="checkbox" className="mt-1 size-4 accent-[var(--gold)]" checked={on} onChange={() => toggleJob(j.id)} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-medium">{L(j.name)}</span>
                                    <span className="text-[13px] text-muted">
                                      {formatLei(j.priceFrom, lang)}
                                      {j.priceTo && j.priceTo !== j.priceFrom ? ` – ${formatLei(j.priceTo, lang)}` : ''}, {formatEta(j.etaHours, lang)}
                                    </span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                          <label className="mt-3 flex cursor-pointer items-center gap-3 text-[15px]">
                            <input type="checkbox" className="size-4 accent-[var(--gold)]" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} />
                            {t.booking.what.custom}
                          </label>
                          {customOn && (
                            <textarea className="field mt-2 min-h-20" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t.booking.what.customPlaceholder} maxLength={500} />
                          )}
                          {errors.jobs && <p className="mt-2 text-[13px] text-[#c4443b]">{errors.jobs}</p>}
                        </fieldset>
                        <div className={`grid gap-3 ${mode === 'mobile' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                          <Field label={t.booking.what.brand}>
                            <input className="field" value={device.brand} onChange={(e) => setDevice({ ...device, brand: e.target.value })} maxLength={60} />
                          </Field>
                          <Field label={t.booking.what.model}>
                            <input className="field" value={device.model} onChange={(e) => setDevice({ ...device, model: e.target.value })} maxLength={60} />
                          </Field>
                          {mode === 'mobile' && (
                            <Field label={t.booking.what.year}>
                              <input className="field" inputMode="numeric" value={device.year} onChange={(e) => setDevice({ ...device, year: e.target.value })} maxLength={4} />
                            </Field>
                          )}
                        </div>
                        <Field label={t.booking.what.issue} error={errors.issue}>
                          <textarea
                            className="field min-h-24"
                            value={issue}
                            onChange={(e) => setIssue(e.target.value)}
                            placeholder={t.booking.what.issuePlaceholder}
                            maxLength={1500}
                            aria-invalid={!!errors.issue}
                          />
                        </Field>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="grid gap-5">
                        <fieldset>
                          <legend className="text-[14px] font-semibold">{t.booking.when.pickDay}</legend>
                          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2" data-lenis-prevent-horizontal>
                            {days.map((d) => {
                              const l = dayLabel(d)
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => setDay(d)}
                                  aria-pressed={day === d}
                                  className={`flex min-w-[4.6rem] shrink-0 flex-col items-center rounded-[14px] border px-3 py-2.5 transition-colors ${
                                    day === d ? 'border-gold bg-surface' : 'border-line hover:border-muted'
                                  }`}
                                >
                                  <span className="text-[12px] capitalize text-muted">{l.wd}</span>
                                  <span className="font-semibold" style={{ fontStretch: '110%' }}>
                                    {l.dm}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </fieldset>
                        {day && (
                          <fieldset>
                            <legend className="text-[14px] font-semibold">{t.booking.when.pickTime}</legend>
                            {slots.length ? (
                              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                                {slots.map((s) => (
                                  <button
                                    key={s.start}
                                    type="button"
                                    onClick={() => setSlot(s.start)}
                                    aria-pressed={slot === s.start}
                                    className={`rounded-[12px] border py-2.5 font-semibold transition-colors ${slot === s.start ? 'border-gold bg-gold text-on-gold' : 'border-line hover:border-muted'}`}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-[15px] text-muted">{t.booking.when.noSlots}</p>
                            )}
                          </fieldset>
                        )}
                        {errors.slot && <p className="text-[13px] text-[#c4443b]">{errors.slot}</p>}
                        {mode === 'mobile' && (
                          <Field label={t.booking.when.location} error={errors.location}>
                            <input
                              className="field"
                              value={location}
                              onChange={(e) => setLocation(e.target.value)}
                              placeholder={t.booking.when.locationPlaceholder}
                              maxLength={200}
                              autoComplete="street-address"
                              aria-invalid={!!errors.location}
                            />
                          </Field>
                        )}
                      </div>
                    )}

                    {step === 3 && (
                      <div className="grid gap-4">
                        <Field label={t.booking.who.name} error={errors.name}>
                          <input className="field" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" maxLength={80} aria-invalid={!!errors.name} />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label={t.booking.who.phone} error={errors.phone}>
                            <input className="field" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} autoComplete="tel" aria-invalid={!!errors.phone} />
                          </Field>
                          <Field label={t.booking.who.email} hint={t.booking.who.optional} error={errors.email}>
                            <input className="field" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" aria-invalid={!!errors.email} />
                          </Field>
                        </div>
                        <label className="flex cursor-pointer items-start gap-3 text-[14px] text-muted">
                          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--gold)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                          <span>{t.booking.who.consent}</span>
                        </label>
                        {errors.consent && <p className="-mt-2 text-[13px] text-[#c4443b]">{errors.consent}</p>}
                        {errors.server && <p className="text-[14px] text-[#c4443b]">{errors.server}</p>}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <aside className="h-fit rounded-[18px] border border-line bg-surface p-5" aria-live="polite">
                  <p className="text-[14px] font-semibold">{t.booking.summary.title}</p>
                  <dl className="mt-3 grid gap-3 text-[14px]">
                    <div>
                      <dt className="text-muted">{t.booking.summary.price}</dt>
                      <dd className="display-2 text-2xl">{priceText}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t.booking.summary.eta}</dt>
                      <dd className="font-semibold">{est.etaHours[1] ? formatEta(est.etaHours, lang) : '–'}</dd>
                    </div>
                  </dl>
                  {picked.length > 0 && (
                    <ul className="mt-4 grid gap-1.5 border-t border-line pt-3 text-[13px] text-muted">
                      {picked.map((j) => (
                        <li key={j.id}>{L(j.name)}</li>
                      ))}
                    </ul>
                  )}
                  {mode === 'shop' && <p className="mt-4 text-[13px] text-ok">{t.booking.summary.free}</p>}
                  {est.needsDiagnosis && <p className="mt-2 text-[13px] text-muted">{t.booking.summary.diagnosisNote}</p>}
                </aside>
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => Math.max(s - 1, 0) as Step)} disabled={step === 0} style={{ visibility: step === 0 ? 'hidden' : 'visible' }}>
                  {t.booking.back}
                </button>
                {step < 3 ? (
                  <button type="button" className="btn btn-gold" onClick={next}>
                    {t.booking.next}
                  </button>
                ) : (
                  <button type="button" className="btn btn-gold" onClick={submit} disabled={sending}>
                    {sending ? t.booking.sending : t.booking.submit}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
