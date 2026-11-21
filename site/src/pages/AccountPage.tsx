import { useCallback, useEffect, useState } from 'react'
import { fmt, useI18n } from '../i18n'
import { catalog } from '../data/catalog'
import { api } from '../auth/api'
import { authClient } from '../auth/client'
import { Guard } from '../auth/Guard'
import { Card, Loading, Notice, PageShell, StatusBadge, useDateFormat } from '../auth/ui'
import { refreshViewer, isStaff, type Viewer } from '../auth/viewer'
import { openBooking } from '../lib/booking-store'
import { linkTo, navigate } from '../lib/router'
import { estimateText } from '../auth/owner/BookingDrawer'
import type { Booking, BookingStatus } from '../types'

type MyBooking = Omit<Booking, 'statusHistory' | 'userId'> & { timeline: { status: BookingStatus; at: string }[] }

/** /cont: sign in, or the customer's account with their bookings. */
export function AccountPage() {
  return <Guard roles={['customer', 'owner', 'dev']}>{(user) => <Account user={user} />}</Guard>
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
              <dt className="text-muted">{a.profile.role}</dt>
              <dd className="font-semibold">{a.roles[user.role]}</dd>
              <dt className="text-muted">{a.profile.email}</dt>
              <dd className={user.emailVerified ? 'text-ok' : 'text-gold'}>{user.emailVerified ? a.profile.verified : a.profile.notVerified}</dd>
            </dl>
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
        </aside>

        <MyBookings />
      </div>
    </PageShell>
  )
}

function MyBookings() {
  const { t, L, lang } = useI18n()
  const a = t.account
  const fmtDate = useDateFormat()
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ready'; items: MyBooking[] }>({ status: 'loading', items: [] })

  const load = useCallback(async () => {
    const result = await api<{ bookings: MyBooking[] }>('/api/me/bookings')
    setState(result.ok ? { status: 'ready', items: result.data.bookings } : { status: 'error', items: [] })
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const jobsOf = (b: MyBooking) => {
    const names = b.jobIds.map((id) => catalog.find((job) => job.id === id)?.name).filter((n): n is NonNullable<typeof n> => Boolean(n)).map((n) => L(n))
    return names.length ? names.join(', ') : (b.custom ?? '')
  }

  return (
    <section aria-labelledby="my-bookings">
      <h2 id="my-bookings" className="display-2 text-2xl sm:text-3xl">
        {a.bookings.title}
      </h2>
      <div className="mt-4 grid gap-4">
        {state.status === 'loading' && <Loading label={a.bookings.loading} />}
        {state.status === 'error' && <Notice tone="error">{a.bookings.error}</Notice>}
        {state.status === 'ready' && state.items.length === 0 && (
          <Card>
            <p className="text-muted">{a.bookings.empty}</p>
            <button type="button" className="btn btn-gold mt-4" onClick={() => {
                navigate('/')
                openBooking()
              }}>
              {a.bookings.bookNow}
            </button>
          </Card>
        )}
        {state.items.map((b) => (
          <Card key={b.code}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-muted">
                  {a.bookings.code} <span className="font-mono text-ink">{b.code}</span>
                </p>
                <h3 className="mt-1 text-lg font-bold">{[b.device.brand, b.device.model].filter(Boolean).join(' ') || jobsOf(b)}</h3>
                <p className="text-[14px] text-muted">{jobsOf(b)}</p>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-3">
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
              <div>
                <dt className="text-muted">{a.bookings.estimate}</dt>
                <dd className="font-semibold">{estimateText(b.estimate, t.owner.detail)}</dd>
              </div>
              {b.pickup && (
                <div>
                  <dt className="text-muted">{t.booking.summary.pickup}</dt>
                  <dd className="font-semibold">{fmt(t.owner.detail.final, { n: b.pickup.quote.totalLei })}</dd>
                </div>
              )}
              {b.finalLei != null && (
                <div>
                  <dt className="text-muted">{a.bookings.final}</dt>
                  <dd className="font-semibold">{fmt(t.owner.detail.final, { n: b.finalLei })}</dd>
                </div>
              )}
            </dl>
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
        ))}
      </div>
    </section>
  )
}
