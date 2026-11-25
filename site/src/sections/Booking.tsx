import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { catalog } from '../data/catalog'
import { estimate, formatEta, formatLei, jobPrice } from '../lib/estimate'
import { daysAhead, slotsFor } from '../lib/slots'
import { closeBooking, useBooking } from '../lib/booking-store'
import { buildBookingIcs, downloadIcs } from '../lib/booking-helpers'
import { navigate } from '../lib/router'
import { SHOP } from './Contact'
import { modelFor } from '../lib/models'
import { sceneState } from '../three/contract'
import { lockPage } from '../lib/scroll'
import { inertOutside } from '../lib/inert'
import { Logo } from '../components/Logo'
import { DevicePanel } from '../components/Scene3D'
import { MonthCalendar } from '../components/MonthCalendar'
import type { AiEstimate, BookingRequest, ServiceMode } from '../types'
import { VALUE_TIERS, type ValueTier } from '../lib/pricing'
import type { PickupValue } from '../components/PickupMap'

const PickupMap = lazy(() => import('../components/PickupMap'))

type Where = 'shop' | 'pickup' | 'mobile'
import { Check, Close } from '../components/Icons'
import { useViewer } from '../auth/viewer'

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
      {error && <span className="text-[13px] text-danger">{error}</span>}
    </label>
  )
}

export function Booking() {
  const pre = useBooking()
  return <AnimatePresence>{pre.open && <BookingModal key="booking" />}</AnimatePresence>
}

function BookingModal() {
  const { t, lang, L } = useI18n()
  const pre = useBooking()
  const [confirm, setConfirm] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<Step>(0)
  const [mode, setMode] = useState<ServiceMode>('shop')
  const [where, setWhere] = useState<Where>('shop')
  const [tier, setTier] = useState<ValueTier | 'unknown' | null>(null)
  const [ai, setAi] = useState<{ status: 'idle' | 'loading' | 'error'; data: AiEstimate | null }>({ status: 'idle', data: null })
  const [pickup, setPickup] = useState<PickupValue | null>(null)
  const [urgent, setUrgent] = useState(false)
  const [jobIds, setJobIds] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [customOn, setCustomOn] = useState(false)
  const [device, setDevice] = useState({ brand: '', model: '', year: '' })
  const [issue, setIssue] = useState('')
  const [day, setDay] = useState('')
  const [slot, setSlot] = useState('')
  const [location, setLocation] = useState('')
  const [contact, setContact] = useState(() => {
    let savedPhone = ''
    try {
      savedPhone = window.localStorage.getItem('nt_last_phone') ?? ''
    } catch {
      // Ignore storage errors (private browsing).
    }
    return { name: '', phone: savedPhone, email: '' }
  })
  // Signed in: fill name and email unless the customer already typed something.
  const { user: account } = useViewer()
  useEffect(() => {
    if (account) setContact((c) => ({ ...c, name: c.name || account.name, email: c.email || account.email }))
  }, [account])
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [bookedRecap, setBookedRecap] = useState<{ slot: string; whereText: string; price: string } | null>(null)
  const [taken, setTaken] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [now] = useState(() => new Date())
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(now)

  // "Book this" buttons elsewhere on the page land here with jobs preselected.
  useEffect(() => {
    if (!pre.nonce) return
    if (pre.mode) {
      setMode(pre.mode)
      setWhere(pre.mode === 'mobile' ? 'mobile' : 'shop')
    }
    setJobIds(pre.jobIds)
    setDone(null)
    setStep(pre.jobIds.length ? 1 : 0)
  }, [pre.nonce, pre.mode, pre.jobIds])

  // While open: page scroll locked, focus moves in.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    // A part lit by hovering a price row stays lit on touch screens; start the popup clean.
    sceneState.highlight = null
    lockPage(true)
    // Everything beside the dialog goes inert, so Tab cannot reach the page hidden behind it.
    const node = dialog.current
    const undoInert = inertOutside(node)
    node?.focus()
    return () => {
      undoInert()
      lockPage(false)
      prev?.focus?.()
    }
  }, [])

  const jobs = useMemo(() => catalog.filter((j) => j.mode === mode), [mode])
  const picked = useMemo(() => catalog.filter((j) => jobIds.includes(j.id)), [jobIds])
  const tierValue = tier && tier !== 'unknown' ? tier : null
  const est = estimate(picked, customOn && custom.trim().length > 0, tierValue)
  const days = useMemo(() => daysAhead(now, 12, mode), [now, mode])
  // Urgent pickup also offers today's windows from one hour ahead (slotsFor keeps a 2 h margin).
  const urgentAvailableToday = where === 'pickup' && slotsFor(todayIso, mode, new Date(Date.now() - 60 * 60 * 1000), taken).length > 0
  const slotNow = where === 'pickup' && urgent ? new Date(Date.now() - 60 * 60 * 1000) : new Date()
  const slots = day ? slotsFor(day, mode, slotNow, taken) : []
  // Days with at least one free slot; the rest show crossed out in the calendar.
  const openDays = new Set(days.filter((d) => slotsFor(d, mode, slotNow, taken).length > 0))
  const firstOpen = days.find((d) => openDays.has(d))

  // Urgent applies only to today; clear it if today has no slots left or the customer picks another day.
  useEffect(() => {
    if (urgent && !urgentAvailableToday) setUrgent(false)
  }, [urgent, urgentAvailableToday])
  const needsValue = picked.some((j) => j.hourly?.byValue) || customOn
  // The price list figure, the same one the server stores and emails. The AI card shows its own guide price.
  const repair: [number, number] = [est.priceFrom, est.priceTo]
  const transport = where === 'pickup' && pickup?.quote && !pickup.quote.tooFar ? pickup.quote.totalLei : 0
  const aiText = [customOn ? custom.trim() : '', issue.trim()].filter(Boolean).join('\n\n')

  const runAi = async () => {
    setAi({ status: 'loading', data: null })
    try {
      const r = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          mode,
          jobIds,
          device: { brand: device.brand.trim() || undefined, model: device.model.trim() || undefined, year: device.year.trim() || undefined },
          deviceValue: tierValue ?? undefined,
          issue: aiText.slice(0, 1500),
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setAi({ status: 'idle', data: (await r.json()) as AiEstimate })
    } catch {
      setAi({ status: 'error', data: null })
    }
  }

  // The 3D viewer shows the device for the job picked last, otherwise a laptop (or the car parts).
  const lastJob = catalog.find((j) => j.id === jobIds[jobIds.length - 1])
  const model = lastJob ? modelFor(lastJob) : mode === 'mobile' ? 'auto' : 'laptop'

  const dirty =
    !done &&
    (jobIds.length > 0 || pickup !== null || custom.trim() !== '' || issue.trim() !== '' || slot !== '' || contact.name !== '' || contact.phone !== '' || device.brand !== '' || device.model !== '')
  const requestClose = () => (dirty ? setConfirm(true) : closeBooking())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (confirm) setConfirm(false)
      else requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!days.length) return
    const ctl = new AbortController()
    setSlotsLoading(true)
    fetch(`/api/slots?mode=${mode}&from=${days[0]}&to=${days[days.length - 1]}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { taken: [] }))
      .then((d: { taken?: string[] }) => {
        const nextTaken = d.taken ?? []
        setTaken(nextTaken)
        setSlot((cur) => (cur && nextTaken.includes(cur) ? '' : cur))
      })
      .catch(() => {})
      .finally(() => {
        if (!ctl.signal.aborted) setSlotsLoading(false)
      })
    return () => ctl.abort()
  }, [mode, days])

  useEffect(() => {
    setSlot('')
  }, [day, mode])

  // Arriving at the time step: open on the first day that still has room.
  useEffect(() => {
    if (step === 2 && (!day || !openDays.has(day)) && firstOpen) setDay(firstOpen)
    // Only on entering the step or when the first free day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, firstOpen])

  // Each step starts at the top, not wherever the last one was scrolled to.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [step, done])

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
      if (where === 'pickup' && (!pickup || !pickup.quote)) e.pickup = t.booking.pickup.required
      if (where === 'pickup' && pickup?.quote?.tooFar) e.pickup = t.booking.pickup.tooFar
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
      deviceValue: tierValue ?? undefined,
      aiEstimate: ai.data ?? undefined,
      pickup:
        where === 'pickup' && pickup?.quote
          ? {
              address: pickup.address,
              lat: pickup.lat,
              lon: pickup.lon,
              trips: pickup.trips,
              urgent,
              quote: { totalLei: pickup.quote.totalLei, oneWayKm: pickup.quote.oneWayKm, urgentLei: pickup.quote.urgentLei },
            }
          : undefined,
      contact: { name: contact.name.trim(), phone: contact.phone.trim(), email: contact.email.trim() || undefined },
      estimate: { priceFrom: repair[0] + transport, priceTo: repair[1] + transport, etaHours: est.etaHours },
      lang,
    }
    setSending(true)
    try {
      const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.status === 409) {
        setTaken((x) => [...x, slot])
        setSlot('')
        setStep(2)
        setErrors({ slot: t.booking.when.slotGone })
        return
      }
      if (r.status === 400) {
        const d = (await r.json().catch(() => null)) as { issues?: { path?: string | string[]; code?: string; message?: string }[] } | null
        const issues = d?.issues ?? []
        const paths = issues.map((i) => (Array.isArray(i.path) ? i.path[0] : i.path))
        if (paths.includes('slot')) {
          // The window passed its cutoff while the form was open.
          setSlot('')
          setStep(2)
          setErrors({ slot: t.booking.when.slotGone })
          return
        }
        if (paths.includes('pickup')) {
          setStep(2)
          const far = issues.some((i) => i.code === 'too_far')
          setErrors({ pickup: far ? t.booking.pickup.tooFar : t.booking.pickup.required })
          return
        }
      }
      if (!r.ok) throw new Error(String(r.status))
      const d = (await r.json()) as { code: string }
      try {
        window.localStorage.setItem('nt_last_phone', contact.phone.trim())
      } catch {
        // Ignore storage errors.
      }
      const whereText =
        where === 'pickup' && pickup?.address
          ? pickup.address
          : mode === 'mobile' && location.trim()
            ? location.trim()
            : t.contact.address
      setBookedRecap({ slot, whereText, price: priceText })
      setCopied(false)
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
  const dayLong = (d: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
  const stepNames = [t.booking.steps.where, t.booking.steps.what, where === 'pickup' || mode === 'mobile' ? t.booking.steps.whereWhen : t.booking.steps.when, t.booking.steps.who]
  const rangeText = ([lo, hi]: [number, number]) =>
    lo === 0 && hi === 0
      ? '–'
      : hi > lo
        ? fmt(t.services.range, { from: formatLei(lo, lang).replace(/\s?lei$/, ''), to: formatLei(hi, lang).replace(/\s?lei$/, '') })
        : formatLei(lo, lang)
  const priceText = repair[1] === 0 && transport === 0 ? '–' : rangeText([repair[0] + transport, repair[1] + transport])
  const windowLabel = (start: string) => {
    const [h, m] = start.split(':').map(Number)
    return `${start}–${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  return (
    <motion.div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-title"
      tabIndex={-1}
      className="fixed inset-0 z-[90] flex flex-col bg-bg outline-none"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <DevicePanel model={model} inDialog className="absolute inset-y-0 right-0 hidden w-[40vw] border-l border-line bg-surface-2 lg:block" />
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4 sm:px-6 lg:mr-[40vw]">
        <Logo />
        <button type="button" onClick={requestClose} className="grid size-10 place-items-center rounded-full border border-line transition-colors hover:border-ink" aria-label={t.booking.close}>
          <Close />
        </button>
      </div>
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6 lg:mr-[40vw]"
            role="alertdialog"
            aria-label={t.booking.confirmClose.title}
          >
            <p className="font-semibold">{t.booking.confirmClose.title}</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost h-10 min-h-0" onClick={() => setConfirm(false)} autoFocus>
                {t.booking.confirmClose.stay}
              </button>
              <button type="button" className="btn btn-gold h-10 min-h-0" onClick={closeBooking}>
                {t.booking.confirmClose.leave}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:mr-[40vw]" data-lenis-prevent>
      <div className="mx-auto max-w-[56rem] px-4 py-8 sm:px-6 sm:py-12">
        <h2 id="booking-title" className="display-2 text-[clamp(2rem,3.6vw,3rem)]">{t.booking.title}</h2>
        <p className="measure mt-3 text-lg text-muted">{t.booking.lead}</p>
        <div className="mt-8">

          {done ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} role="status">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-ok text-on-gold">
                  <Check />
                </span>
                <h3 className="display-2 text-2xl">{t.booking.success.title}</h3>
              </div>
              <p className="measure mt-4">{fmt(t.booking.success.body, { code: done })}</p>
              <p className="mt-6 text-[14px] text-muted">{t.booking.success.code}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <p className="display text-5xl tracking-wide">{done}</p>
                <button
                  type="button"
                  className="btn btn-ghost h-10 min-h-0 px-4 text-[14px]"
                  onClick={() => {
                    void navigator.clipboard?.writeText(done)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1800)
                  }}
                >
                  {copied ? t.booking.success.copied : t.booking.success.copy}
                </button>
              </div>
              {bookedRecap && (
                <dl className="mt-6 grid gap-3 rounded-[18px] border border-line bg-surface p-4 text-[14px] sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">{t.account.bookings.when}</dt>
                    <dd className="font-semibold">
                      {new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(bookedRecap.slot))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t.owner.detail.address}</dt>
                    <dd className="font-semibold">{bookedRecap.whereText}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t.booking.summary.price}</dt>
                    <dd className="font-semibold">{bookedRecap.price}</dd>
                  </div>
                </dl>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => {
                    const tracked = done
                    closeBooking()
                    if (account) {
                      navigate('/cont')
                    } else {
                      window.history.replaceState(null, '', `/?cod=${encodeURIComponent(tracked)}#status`)
                      window.dispatchEvent(new CustomEvent('nt:track', { detail: tracked }))
                      document.getElementById('status')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                >
                  {t.booking.success.track}
                </button>
                {bookedRecap && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      const ics = buildBookingIcs({
                        code: done,
                        title: `Norgelis Tech, ${done}`,
                        slot: bookedRecap.slot,
                        location: bookedRecap.whereText,
                        description: `${t.booking.success.code}: ${done}\n${t.booking.summary.price}: ${bookedRecap.price}`,
                      })
                      downloadIcs(done, ics)
                    }}
                  >
                    {t.booking.success.calendar}
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={reset}>
                  {t.booking.success.again}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeBooking}>
                  {t.booking.close}
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Step indicator: vias on a trace; past steps are clickable. */}
              <ol className="flex items-center">
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

              <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
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
                      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t.booking.steps.where}>
                        {(
                          [
                            ['shop', t.booking.where.shop, t.booking.where.shopHint],
                            ['pickup', t.booking.where.pickup, t.booking.where.pickupHint],
                            ['mobile', t.booking.where.mobile, t.booking.where.mobileHint],
                          ] as const
                        ).map(([w, title, hint]) => (
                          <button
                            key={w}
                            type="button"
                            role="radio"
                            aria-checked={where === w}
                            onClick={() => {
                              const m: ServiceMode = w === 'mobile' ? 'mobile' : 'shop'
                              if (m !== mode) setJobIds([])
                              setMode(m)
                              setWhere(w)
                            }}
                            className={`rounded-[18px] border p-5 text-left transition-colors ${where === w ? 'border-gold bg-surface' : 'border-line hover:border-muted'}`}
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
                        <fieldset className="min-w-0">
                          <legend className="text-[14px] font-semibold">{t.booking.what.pickJobs}</legend>
                          <div className="mt-2 max-h-[18rem] overflow-y-auto overscroll-contain rounded-[14px] border border-line" data-lenis-prevent>
                            {jobs.map((j) => {
                              const on = jobIds.includes(j.id)
                              const [lo, hi] = jobPrice(j, tierValue)
                              return (
                                <label key={j.id} className={`flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3 last:border-0 ${on ? 'bg-surface' : ''}`}>
                                  <input type="checkbox" className="mt-1 size-4 accent-[var(--gold)]" checked={on} onChange={() => toggleJob(j.id)} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-medium">{L(j.name)}</span>
                                    <span className="text-[13px] text-muted">
                                      {formatLei(lo, lang)}
                                      {hi !== lo ? ` – ${formatLei(hi, lang)}` : ''}, {formatEta(j.etaHours, lang)}
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
                          {errors.jobs && <p className="mt-2 text-[13px] text-danger">{errors.jobs}</p>}
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
                        {needsValue && (
                          <fieldset className="min-w-0">
                            <legend className="text-[14px] font-semibold">{t.booking.what.value}</legend>
                            <p className="mt-1 text-[13px] text-muted">{t.booking.what.valueHint}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {([...VALUE_TIERS, 'unknown'] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  aria-pressed={tier === v}
                                  onClick={() => setTier(v)}
                                  className={`rounded-full border px-3.5 py-2 text-[14px] transition-colors ${tier === v ? 'border-gold bg-surface font-semibold' : 'border-line hover:border-muted'}`}
                                >
                                  {t.booking.what.valueTiers[v]}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                        )}
                        {customOn && (
                          <div className="rounded-[18px] border border-line p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{t.booking.ai.title}</p>
                                <p className="measure mt-1 text-[14px] text-muted">{t.booking.ai.lead}</p>
                              </div>
                              <button type="button" className="btn btn-ghost h-10 min-h-0" onClick={runAi} disabled={aiText.length < 10 || ai.status === 'loading'}>
                                {ai.status === 'loading' ? t.booking.ai.loading : t.booking.ai.button}
                              </button>
                            </div>
                            <div aria-live="polite">
                              {ai.status === 'error' && <p className="mt-3 text-[14px] text-muted">{t.booking.ai.unavailable}</p>}
                              {ai.data && <AiCard data={ai.data} />}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {step === 2 && (
                      <div className="grid gap-5">
                        {where === 'pickup' && (
                          <div className="grid gap-3">
                            <div>
                              <p className="font-semibold">{t.booking.pickup.title}</p>
                              <p className="measure mt-1 text-[14px] text-muted">{t.booking.pickup.lead}</p>
                            </div>
                            <label className={`flex items-start gap-3 rounded-[14px] border border-line p-3.5 ${urgentAvailableToday ? 'cursor-pointer' : 'opacity-60'}`}>
                              <input
                                type="checkbox"
                                className="mt-0.5 size-4 accent-[var(--gold)]"
                                checked={urgent}
                                disabled={!urgentAvailableToday}
                                onChange={(e) => {
                                  const nextUrgent = e.target.checked
                                  setUrgent(nextUrgent)
                                  if (nextUrgent) setDay(todayIso)
                                }}
                              />
                              <span>
                                <span className="block text-[15px] font-semibold">{t.booking.pickup.urgentToggle}</span>
                                <span className="block text-[13px] text-muted">
                                  {urgentAvailableToday ? t.booking.pickup.urgentHint : t.booking.pickup.urgentUnavailableToday}
                                </span>
                              </span>
                            </label>
                            <Suspense fallback={<div className="h-[300px] animate-pulse rounded-[18px] border border-line bg-surface md:h-[360px]" />}>
                              <PickupMap value={pickup} onChange={setPickup} lang={lang} labels={t.booking.pickup} urgent={urgent} phone={SHOP.phone} />
                            </Suspense>
                            {errors.pickup && <p className="text-[13px] text-danger">{errors.pickup}</p>}
                          </div>
                        )}
                        <div className="grid gap-5 rounded-[20px] border border-line bg-surface p-4 sm:p-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-6">
                          <div className="min-w-0">
                            <p className="mb-2 text-[14px] font-semibold">{t.booking.when.pickDay}</p>
                            <MonthCalendar
                              lang={lang}
                              today={todayIso}
                              label={t.booking.when.pickDay}
                              value={day || null}
                              onSelect={(d) => {
                                setDay(d)
                                if (d !== todayIso && urgent) setUrgent(false)
                              }}
                              isDisabled={(d) => !openDays.has(d)}
                              minMonth={days[0]?.slice(0, 7)}
                              maxMonth={days[days.length - 1]?.slice(0, 7)}
                            />
                            <p className="mt-3 text-[13px] text-muted">
                              {!openDays.has(todayIso) && slotsFor(todayIso, mode, new Date(0)).length > 0 && `${t.booking.when.todayFull} `}
                              {t.booking.when.closedHint}
                            </p>
                          </div>
                          <fieldset className="min-w-0 md:border-l md:border-line md:pl-6">
                            <legend className="text-[14px] font-semibold">{where === 'pickup' ? t.booking.when.pickWindow : t.booking.when.pickTime}</legend>
                            {day && <p className="mt-1 text-[14px] text-muted first-letter:uppercase">{dayLong(day)}</p>}
                            {slotsLoading ? (
                              <p className="mt-3 text-[14px] text-muted">{t.booking.when.loadingSlots}</p>
                            ) : !day ? (
                              <p className="mt-3 text-[14px] text-muted">{t.booking.when.pickDayFirst}</p>
                            ) : slots.length ? (
                              <div className={`mt-3 grid gap-2 ${where === 'pickup' ? 'grid-cols-2' : 'grid-cols-3 md:grid-cols-2 lg:grid-cols-3'}`}>
                                {slots.map((s) => (
                                  <button
                                    key={s.start}
                                    type="button"
                                    onClick={() => setSlot(s.start)}
                                    aria-pressed={slot === s.start}
                                    className={`rounded-[12px] border py-2.5 text-[15px] font-semibold tabular-nums transition-colors ${slot === s.start ? 'border-gold bg-gold text-on-gold' : 'border-line hover:border-gold/60 hover:bg-surface-2'}`}
                                  >
                                    {where === 'pickup' ? windowLabel(s.label) : s.label}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-[14px] text-muted">{t.booking.when.noSlots}</p>
                            )}
                          </fieldset>
                        </div>
                        {errors.slot && <p className="text-[13px] text-danger">{errors.slot}</p>}
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
                            {!account && !errors.email && <span className="text-[12px] text-muted">{t.booking.who.guestEmailNote}</span>}
                          </Field>
                        </div>
                        <label className="flex cursor-pointer items-start gap-3 text-[14px] text-muted">
                          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--gold)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                          <span>{t.booking.who.consent}</span>
                        </label>
                        {errors.consent && <p className="-mt-2 text-[13px] text-danger">{errors.consent}</p>}
                        {errors.server && <p className="text-[14px] text-danger">{errors.server}</p>}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <aside className={`h-fit rounded-[18px] border border-line bg-surface p-5 ${step === 0 ? 'hidden xl:block' : ''}`} aria-live="polite">
                  <p className="text-[14px] font-semibold">{t.booking.summary.title}</p>
                  <dl className="mt-3 grid gap-3 text-[14px]">
                    {transport > 0 && (
                      <>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">{t.booking.summary.repair}</dt>
                          <dd className="font-semibold">{rangeText(repair)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">{t.booking.summary.pickup}</dt>
                          <dd className="font-semibold">{formatLei(transport, lang)}</dd>
                        </div>
                      </>
                    )}
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
                  <p className="mt-2 text-[13px] text-muted">{t.booking.summary.paymentNote}</p>
                  {est.partsExtra && <p className="mt-2 text-[13px] text-muted">{t.booking.summary.partsExtra}</p>}
                  {est.needsDiagnosis && <p className="mt-2 text-[13px] text-muted">{t.booking.summary.diagnosisNote}</p>}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
      {!done && (
        <div className="shrink-0 border-t border-line bg-bg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:mr-[40vw]">
          <div className="mx-auto flex max-w-[56rem] items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost min-h-11 px-4 text-[15px] sm:min-h-12 sm:px-[1.35rem] sm:text-[17px]"
              onClick={() => setStep((s) => Math.max(s - 1, 0) as Step)}
              disabled={step === 0}
              style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
            >
              {t.booking.back}
            </button>
            {priceText !== '–' && (
              <div className="min-w-0 text-center xl:hidden">
                <p className="truncate text-[15px] font-bold tabular-nums">{priceText}</p>
                {est.etaHours[1] > 0 && <p className="truncate text-[12px] text-muted">{formatEta(est.etaHours, lang)}</p>}
              </div>
            )}
            {step < 3 ? (
              <button type="button" className="btn btn-gold min-h-11 px-5 text-[15px] sm:min-h-12 sm:px-[1.35rem] sm:text-[17px]" onClick={next}>
                {t.booking.next}
              </button>
            ) : (
              <button type="button" className="btn btn-gold min-h-11 px-5 text-[15px] sm:min-h-12 sm:px-[1.35rem] sm:text-[17px]" onClick={submit} disabled={sending}>
                {sending ? t.booking.sending : t.booking.submit}
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function AiCard({ data }: { data: AiEstimate }) {
  const { t, lang } = useI18n()
  const lei = (n: number) => formatLei(n, lang)
  const range = ([lo, hi]: [number, number]) => (hi > lo ? `${lei(lo).replace(/\s?lei$/, '')}–${lei(hi)}` : lei(lo))
  const pct = Math.round(((data.labour[1] / Math.max(data.labourHours[1] * data.rate[1], 1)) - 1) * 100)
  const rate = data.rate[0] === data.rate[1] ? fmt(t.services.perHour, { rate: data.rate[0] }) : fmt(t.services.perHourRange, { from: data.rate[0], to: data.rate[1] })
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid gap-3 border-t border-line pt-4 text-[14px]">
      <p>{data.summary}</p>
      <dl className="grid gap-1.5">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">
            {t.booking.ai.labour}: {fmt(t.booking.ai.hours, { from: data.labourHours[0], to: data.labourHours[1] })} {fmt(t.booking.ai.rate, { rate })}
          </dt>
          <dd className="shrink-0 font-semibold">{range(data.labour)}</dd>
        </div>
        {pct > 0 && <p className="text-[13px] text-muted">{fmt(t.booking.ai.consumables, { pct })}</p>}
        {data.parts.length > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">
              {t.booking.ai.parts}: {data.parts.map((p) => p.name).join(', ')}
            </dt>
            <dd className="shrink-0 font-semibold">{range(data.partsTotal)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 border-t border-line pt-2">
          <dt className="font-semibold">{t.booking.ai.total}</dt>
          <dd className="shrink-0 font-semibold">{range(data.total)}</dd>
        </div>
      </dl>
      <p className="text-[13px] text-muted">{t.booking.ai.confidence[data.confidence]}</p>
      {data.questions.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold">{t.booking.ai.questions}</p>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-muted">
            {data.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[12px] text-muted">{t.booking.ai.disclaimer}</p>
    </motion.div>
  )
}
