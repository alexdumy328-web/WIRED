import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { fmt, useI18n } from '../i18n'
import { catalog } from '../data/catalog'
import { api } from '../auth/api'
import { authClient } from '../auth/client'
import { Guard } from '../auth/Guard'
import { Card, Loading, Notice, PageShell, StatusBadge, useDateFormat } from '../auth/ui'
import { refreshViewer, isStaff, type Viewer } from '../auth/viewer'
import { IOS_APP_RELEASES } from '../data/app'
import { openBooking } from '../lib/booking-store'
import { canCancelBooking, shopDayIso, whatsappUrl } from '../lib/booking-helpers'
import { linkTo, navigate } from '../lib/router'
import { estimateText } from '../auth/owner/format'
import { useWorkshopCopy } from '../auth/owner/workshop/copy'
import { dayLabel, pdfUrl } from '../auth/owner/workshop/model'
import { DriverStatusBanner } from '../components/DriverStatusBanner'
import { SHOP } from '../sections/Contact'
import type { Booking, BookingStatus, WarrantyState } from '../types'

type MyBooking = Omit<Booking, 'statusHistory' | 'userId' | 'intake' | 'repair'> & {
  timeline: { status: BookingStatus; at: string }[]
  collectedAt?: string
  intake?: { number: number; year: number; receivedAt: string; deviceType: string }
  repair?: { workDone: string }
  warranty?: { id: string; label: string; startsOn: string; endsOn: string; months: number; state: WarrantyState }
}

const PROGRESS_ORDER: BookingStatus[] = ['received', 'diagnosis', 'waiting-parts', 'repairing', 'ready', 'done']

/** /cont: sign in, or the customer's account with their bookings. */
export function AccountPage() {
  return <Guard roles={['customer', 'driver', 'technician', 'owner', 'dev']}>{(user) => <Account user={user} />}</Guard>
}

function Account({ user }: { user: Viewer }) {
  const { t } = useI18n()
  const a = t.account
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)
    try {
      await authClient.signOut()
    } finally {
      await refreshViewer()
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <h1 className="display-2 text-4xl sm:text-5xl">{a.title}</h1>
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
        <aside className="grid gap-4">
          <Card>
            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-ink text-2xl font-bold text-bg" aria-hidden="true">
                {(user.name || user.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{user.name || user.email}</h2>
                {user.name && <p className="truncate text-[14px] text-muted">{user.email}</p>}
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
              {isStaff(user) && (
                <>
                  <dt className="text-muted">{a.profile.role}</dt>
                  <dd className="font-semibold">{a.roles[user.role]}</dd>
                </>
              )}
              <dt className="text-muted">{a.profile.email}</dt>
              <dd className={user.emailVerified ? 'text-ok' : 'text-gold'}>{user.emailVerified ? a.profile.verified : a.profile.notVerified}</dd>
            </dl>
            {!user.emailVerified && <VerifyEmailBox email={user.email} />}
            <button type="button" className="btn btn-ghost mt-5 w-full" onClick={() => void signOut()} disabled={busy}>
              {a.actions.signOut}
            </button>
          </Card>

          {isStaff(user) && (
            <Card>
              <h2 className="text-[15px] font-bold">{a.dashboards.title}</h2>
              <div className="mt-3 grid gap-2">
                <a href="/admin" onClick={linkTo('/admin')} className="btn btn-gold">
                  {a.dashboards.owner}
                </a>
                {user.role === 'dev' && (
                  <a href="/dev" onClick={linkTo('/dev')} className="btn btn-ghost">
                    {a.dashboards.dev}
                  </a>
                )}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="text-[15px] font-bold">{t.contact.title}</h2>
            <p className="mt-2 text-[14px] text-muted">{t.contact.address}</p>
            <p className="mt-1 text-[13px] text-muted">{t.contact.hours.join(' · ')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:${SHOP.phone}`} className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]">
                {t.actionBar.call}
              </a>
              <a href={whatsappUrl(SHOP.phone)} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]">
                {t.actionBar.whatsapp}
              </a>
              <a href={SHOP.maps} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]">
                {t.contact.directions}
              </a>
            </div>
          </Card>

          <Card>
            <h2 className="text-[15px] font-bold">{a.iosApp.title}</h2>
            <p className="mt-2 text-[14px] text-muted">{a.iosApp.hint}</p>
            <a href={IOS_APP_RELEASES} target="_blank" rel="noreferrer" className="btn btn-ghost mt-3 w-full">
              {a.iosApp.download}
            </a>
          </Card>
        </aside>

        <MyBookings />
      </div>
    </PageShell>
  )
}

function VerifyEmailBox({ email }: { email: string }) {
  const { t } = useI18n()
  const a = t.account
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [info, setInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const sendCode = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' })
      if (res.error) {
        setError(res.error.status === 429 ? a.errors.rateLimited : a.errors.generic)
        return
      }
      setOpen(true)
      setCooldown(45)
      setInfo(fmt(a.msgs.confirmSent, { email }))
    } catch {
      setError(a.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) {
      setError(a.errors.code)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await authClient.emailOtp.verifyEmail({ email, otp: code.trim() })
      if (res.error) {
        setError(res.error.code === 'INVALID_OTP' || res.error.code === 'OTP_EXPIRED' ? a.errors.invalidCode : a.errors.generic)
        return
      }
      await refreshViewer()
    } catch {
      setError(a.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="mt-3 grid gap-2">
        {error && <Notice tone="error">{error}</Notice>}
        <button type="button" className="btn btn-gold h-10 min-h-0 w-full text-[14px]" onClick={() => void sendCode()} disabled={busy}>
          {a.actions.verifyEmail}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void verify(e)} className="mt-4 grid gap-2.5 border-t border-line pt-4">
      {info && <p className="text-[13px] text-muted">{info}</p>}
      <input
        className="field tracking-[0.35em]"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder={a.fields.code}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-gold h-9 min-h-0 flex-1 text-[13px]" disabled={busy}>
          {a.actions.verify}
        </button>
        <button
          type="button"
          className="text-[13px] font-semibold text-gold disabled:text-muted"
          disabled={busy || cooldown > 0}
          onClick={() => void sendCode()}
        >
          {cooldown > 0 ? fmt(a.actions.resendIn, { s: cooldown }) : a.actions.resend}
        </button>
      </div>
    </form>
  )
}

function MyBookings() {
  const { t, L, lang } = useI18n()
  const a = t.account
  const c = useWorkshopCopy()
  const fmtDate = useDateFormat()
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ready'; items: MyBooking[]; refreshError: boolean }>({
    status: 'loading',
    items: [],
    refreshError: false,
  })
  const [refreshing, setRefreshing] = useState(false)
  const [todayIso] = useState(() => shopDayIso(new Date()))

  const load = useCallback(async () => {
    const result = await api<{ bookings: MyBooking[] }>('/api/me/bookings')
    setRefreshing(false)
    setState((prev) => {
      if (result.ok) return { status: 'ready', items: result.data.bookings, refreshError: false }
      if (prev.status === 'ready') return { ...prev, refreshError: true }
      return { status: 'error', items: [], refreshError: false }
    })
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const refresh = () => {
    setRefreshing(true)
    void load()
  }

  const isFinal = (s: BookingStatus) => s === 'done' || s === 'cancelled'
  const isToday = (b: MyBooking) =>
    !isFinal(b.status) &&
    (shopDayIso(b.slot) === todayIso || (Boolean(b.pickup) && (b.status === 'ready' || b.status === 'unrepairable')))

  const todayItems = state.items.filter(isToday).sort((x, y) => x.slot.localeCompare(y.slot))
  const todayCodes = new Set(todayItems.map((b) => b.code))
  const activeItems = state.items
    .filter((b) => !isFinal(b.status) && !todayCodes.has(b.code))
    .sort((x, y) => {
      const rank = (s: BookingStatus) => (s === 'ready' || s === 'unrepairable' ? 0 : 1)
      return rank(x.status) - rank(y.status) || y.slot.localeCompare(x.slot)
    })
  const pastItems = state.items.filter((b) => isFinal(b.status))

  const jobsOf = (b: MyBooking) => {
    const names = b.jobIds
      .map((id) => catalog.find((job) => job.id === id)?.name)
      .filter((n): n is NonNullable<typeof n> => Boolean(n))
      .map((n) => L(n))
    return names.length ? names.join(', ') : (b.custom ?? '')
  }

  return (
    <section aria-labelledby="my-bookings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-bookings" className="display-2 text-2xl sm:text-3xl">
          {a.bookings.title}
        </h2>
        {state.status === 'ready' && (
          <button type="button" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]" onClick={refresh} disabled={refreshing}>
            {a.actions.refresh}
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-6">
        {state.status === 'loading' && <Loading label={a.bookings.loading} />}
        {state.status === 'error' && (
          <div className="grid gap-3">
            <Notice tone="error">{a.bookings.error}</Notice>
            <div>
              <button type="button" className="btn btn-ghost h-10 min-h-0 text-[14px]" onClick={refresh}>
                {a.actions.refresh}
              </button>
            </div>
          </div>
        )}
        {state.refreshError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-danger/40 px-4 py-2.5 text-[14px] text-danger">
            <span>{a.bookings.error}</span>
            <button type="button" className="btn btn-ghost h-8 min-h-0 px-3 text-[13px] text-ink" onClick={refresh}>
              {a.actions.refresh}
            </button>
          </div>
        )}
        {state.status === 'ready' && state.items.length === 0 && (
          <Card>
            <p className="text-muted">{a.bookings.empty}</p>
            <button
              type="button"
              className="btn btn-gold mt-4"
              onClick={() => {
                navigate('/')
                openBooking()
              }}
            >
              {a.bookings.bookNow}
            </button>
          </Card>
        )}

        {todayItems.length > 0 && (
          <div className="grid gap-4">
            <h3 className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-wide text-ok">
              <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
              {a.bookings.today}
            </h3>
            {todayItems.map((b) => (
              <BookingCard key={b.code} booking={b} jobsText={jobsOf(b)} today onChanged={load} fmtDate={fmtDate} c={c} lang={lang} />
            ))}
          </div>
        )}

        {activeItems.length > 0 && (
          <div className="grid gap-4">
            {todayItems.length > 0 && <h3 className="text-[14px] font-bold uppercase tracking-wide text-muted">{a.bookings.active}</h3>}
            {activeItems.map((b) => (
              <BookingCard key={b.code} booking={b} jobsText={jobsOf(b)} today={false} onChanged={load} fmtDate={fmtDate} c={c} lang={lang} />
            ))}
          </div>
        )}

        {pastItems.length > 0 && (
          <div className="grid gap-4">
            <h3 className="text-[14px] font-bold uppercase tracking-wide text-muted">{a.bookings.past}</h3>
            {pastItems.map((b) => (
              <BookingCard key={b.code} booking={b} jobsText={jobsOf(b)} today={false} onChanged={load} fmtDate={fmtDate} c={c} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function BookingCard({
  booking: b,
  jobsText,
  today,
  onChanged,
  fmtDate,
  c,
  lang,
}: {
  booking: MyBooking
  jobsText: string
  today: boolean
  onChanged: () => Promise<void>
  fmtDate: ReturnType<typeof useDateFormat>
  c: ReturnType<typeof useWorkshopCopy>
  lang: 'ro' | 'en'
}) {
  const { t } = useI18n()
  const a = t.account
  const [copied, setCopied] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const idx = PROGRESS_ORDER.indexOf(b.status === 'unrepairable' ? 'ready' : b.status)
  const barTone = b.status === 'unrepairable' ? 'bg-rose' : 'bg-ok'
  const driverActive =
    today &&
    Boolean(b.pickup) &&
    ((b.status === 'received' && b.pickup?.trips !== 'dropoff' && !b.collectedAt) ||
      ((b.status === 'ready' || b.status === 'unrepairable') && b.pickup?.trips !== 'pickup'))
  const showDirections = !b.pickup && b.mode === 'shop' && (b.status === 'received' || b.status === 'ready' || b.status === 'unrepairable')
  const cancellable = canCancelBooking(b.status, b.slot)
  const toPay =
    b.finalLei != null && (b.status === 'ready' || b.status === 'done' || b.status === 'unrepairable')
      ? b.finalLei + (b.pickup?.quote.totalLei ?? 0)
      : null

  const cancel = async () => {
    setCancelling(true)
    setCancelError(null)
    const res = await api(`/api/me/bookings/${encodeURIComponent(b.code)}/cancel`, { method: 'POST' })
    setCancelling(false)
    if (!res.ok) {
      setCancelError(a.bookings.cancelError)
      return
    }
    setConfirmCancel(false)
    await onChanged()
  }

  return (
    <Card className={today ? 'border-ok/40' : ''}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-muted">
            <span>
              {a.bookings.code} <span className="font-mono text-ink">{b.code}</span>
            </span>
            <button
              type="button"
              className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
              onClick={() => {
                void navigator.clipboard?.writeText(b.code)
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              }}
            >
              {copied ? a.bookings.copied : a.bookings.copyCode}
            </button>
            {b.intake && <span>· {fmt(c.account.sheet, { n: `${b.intake.number}/${b.intake.year}` })}</span>}
          </p>
          <h3 className="mt-1 text-lg font-bold">{[b.device.brand, b.device.model].filter(Boolean).join(' ') || jobsText}</h3>
          {jobsText && <p className="text-[14px] text-muted">{jobsText}</p>}
        </div>
        <StatusBadge status={b.status} />
      </div>

      {idx >= 0 && (
        <ol className="mt-4 flex gap-1.5" aria-label={t.track.title}>
          {PROGRESS_ORDER.map((s, i) => (
            <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? barTone : 'bg-line'}`} title={t.track.statuses[s]} />
          ))}
        </ol>
      )}

      <DriverStatusBanner code={b.code} active={driverActive} />

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-3">
        <div>
          <dt className="text-muted">{a.bookings.when}</dt>
          <dd className="font-semibold">{fmtDate.dateTime(b.slot)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.owner.bookings.columns.mode}</dt>
          <dd className="font-semibold">
            {a.bookings.where[b.mode]}
            {b.pickup ? `, ${a.bookings.pickup.toLowerCase()}` : ''}
          </dd>
        </div>
        {toPay != null ? (
          <div>
            <dt className="text-muted">{a.bookings.toPay}</dt>
            <dd className="font-semibold text-ok">{fmt(t.owner.detail.final, { n: toPay })}</dd>
          </div>
        ) : (
          <div>
            <dt className="text-muted">{a.bookings.estimate}</dt>
            <dd className="font-semibold">{estimateText(b.estimate, t.owner.detail)}</dd>
          </div>
        )}
        {b.pickup && (
          <div>
            <dt className="text-muted">{t.booking.summary.pickup}</dt>
            <dd className="font-semibold">{fmt(t.owner.detail.final, { n: b.pickup.quote.totalLei })}</dd>
          </div>
        )}
        {b.finalLei != null && toPay == null && (
          <div>
            <dt className="text-muted">{a.bookings.final}</dt>
            <dd className="font-semibold">{fmt(t.owner.detail.final, { n: b.finalLei })}</dd>
          </div>
        )}
        {b.mode === 'mobile' && b.location && (
          <div className="sm:col-span-3">
            <dt className="text-muted">{a.bookings.location}</dt>
            <dd className="font-semibold">{b.location}</dd>
          </div>
        )}
      </dl>

      {b.repair?.workDone && (
        <div className="mt-4 text-[14px]">
          <p className="text-muted">{c.account.workDone}</p>
          <p className="whitespace-pre-wrap">{b.repair.workDone}</p>
        </div>
      )}

      {b.warranty && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
          <span className="font-semibold">{fmt(c.account.warranty, { label: b.warranty.label })}</span>
          <span className={b.warranty.state === 'expired' ? 'text-muted' : 'text-ok'}>
            {fmt(b.warranty.state === 'expired' ? c.account.expired : c.account.validUntil, { date: dayLabel(b.warranty.endsOn, lang) })}
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {b.intake && (
          <a className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]" href={pdfUrl.myIntake(b.code)} target="_blank" rel="noreferrer">
            {c.account.sheetPdf}
          </a>
        )}
        {b.warranty && (
          <a className="btn btn-gold h-9 min-h-0 px-3 text-[13px]" href={pdfUrl.myWarranty(b.warranty.id)} target="_blank" rel="noreferrer">
            {c.account.warrantyPdf}
          </a>
        )}
        <a
          className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]"
          href={whatsappUrl(SHOP.phone, fmt(a.bookings.whatsappAbout, { code: b.code }))}
          target="_blank"
          rel="noreferrer"
        >
          {t.actionBar.whatsapp}
        </a>
        <a className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]" href={`tel:${SHOP.phone}`}>
          {t.actionBar.call}
        </a>
        {showDirections && (
          <a className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]" href={SHOP.maps} target="_blank" rel="noreferrer">
            {t.contact.directions}
          </a>
        )}
        {cancellable && !confirmCancel && (
          <button type="button" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px] text-danger" onClick={() => setConfirmCancel(true)}>
            {a.bookings.cancel}
          </button>
        )}
      </div>

      {confirmCancel && (
        <div role="alertdialog" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-danger/40 bg-danger/5 p-3 text-[14px]">
          <span className="font-semibold">{fmt(a.bookings.cancelConfirm, { code: b.code })}</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
              {a.bookings.cancelKeep}
            </button>
            <button
              type="button"
              className="btn h-9 min-h-0 bg-danger px-3 text-[13px] text-white"
              onClick={() => void cancel()}
              disabled={cancelling}
            >
              {a.bookings.cancelYes}
            </button>
          </div>
        </div>
      )}
      {cancelError && <p className="mt-2 text-[13px] text-danger">{cancelError}</p>}

      <p className="mt-4 text-[13px] font-semibold text-muted">{a.bookings.timeline}</p>
      <ol className="mt-2 grid gap-2" lang={lang}>
        {b.timeline.map((entry, i) => (
          <li key={`${entry.status}-${entry.at}-${i}`} className="flex items-center gap-3 text-[14px]">
            <span className={`size-2.5 shrink-0 rounded-full ${i === b.timeline.length - 1 ? 'bg-gold' : 'bg-ok'}`} aria-hidden="true" />
            <span className="font-semibold">{t.track.statuses[entry.status]}</span>
            <span className="text-muted">{fmtDate.dateTime(entry.at)}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
