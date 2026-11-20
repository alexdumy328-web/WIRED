import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fmt, useI18n } from '../../i18n'
import { catalog } from '../../data/catalog'
import { Close } from '../../components/Icons'
import { api } from '../api'
import { Field, Loading, Notice, StatusBadge, useDateFormat } from '../ui'
import { BOOKING_STATUSES } from './constants'
import type { OwnerBooking } from './types'

/** Side sheet with one booking: contact, pickup, history and the status form. */
export function BookingDrawer({ code, onClose, onChanged }: { code: string; onClose: () => void; onChanged: (booking: OwnerBooking) => void }) {
  const { t, L } = useI18n()
  const d = t.owner.detail
  const fmtDate = useDateFormat()
  const [booking, setBooking] = useState<OwnerBooking | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [status, setStatus] = useState<OwnerBooking['status']>('received')
  const [note, setNote] = useState('')
  const [finalLei, setFinalLei] = useState('')
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      returnTo.current?.focus?.()
    }
  }, [onClose])

  useEffect(() => {
    let live = true
    setBooking(null)
    setLoadError(false)
    setMessage(null)
    void api<OwnerBooking>(`/api/admin/bookings/${encodeURIComponent(code)}`).then((result) => {
      if (!live) return
      if (result.ok) {
        setBooking(result.data)
        setStatus(result.data.status)
        setFinalLei(result.data.finalLei != null ? String(result.data.finalLei) : '')
        setNote('')
      } else setLoadError(true)
    })
    return () => {
      live = false
    }
  }, [code])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const result = await api<OwnerBooking>(`/api/admin/bookings/${encodeURIComponent(code)}/status`, {
      method: 'PATCH',
      body: { status, notify, ...(note.trim() ? { note: note.trim() } : {}), ...(priceDirty ? { finalLei: price } : {}) },
    })
    setSaving(false)
    if (result.ok) {
      const { notified, ...saved } = result.data
      setBooking(saved)
      setNote('')
      setMessage(
        notified === 'failed'
          ? { tone: 'error', text: d.savedMailFailed }
          : { tone: 'ok', text: notified === 'sent' ? d.savedMailed : d.saved },
      )
      onChanged(saved)
    } else setMessage({ tone: 'error', text: d.error })
  }

  // The price box: empty clears the final price, anything else must be a whole number of lei.
  const price = finalLei.trim() === '' ? null : Number(finalLei)
  const priceValid = price === null || (Number.isInteger(price) && price >= 0 && price <= 1_000_000)
  const priceDirty = booking != null && priceValid && price !== (booking.finalLei ?? null)
  const statusDirty = booking != null && status !== booking.status

  const jobs = booking?.jobIds.map((id) => catalog.find((job) => job.id === id)?.name).filter((n): n is NonNullable<typeof n> => Boolean(n)).map((n) => L(n)) ?? []

  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label={d.close} tabIndex={-1} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        data-lenis-prevent
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-bg p-5 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="drawer-title" className="display-2 font-mono text-2xl">
              {code}
            </h2>
            {booking && <div className="mt-2"><StatusBadge status={booking.status} /></div>}
          </div>
          <button ref={closeRef} type="button" className="grid size-10 place-items-center rounded-full border border-line" onClick={onClose} aria-label={d.close}>
            <Close />
          </button>
        </div>

        {!booking && !loadError && <Loading label={t.account.loading} />}
        {loadError && <Notice tone="error">{d.loadError}</Notice>}

        {booking && (
          <div className="mt-6 grid gap-6">
            <section aria-labelledby="d-contact">
              <h3 id="d-contact" className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                {d.contact}
              </h3>
              <p className="mt-2 text-lg font-bold">{booking.contact.name}</p>
              <p className="text-[15px]">
                <a className="text-gold underline-offset-4 hover:underline" href={`tel:${booking.contact.phone.replace(/[^+\d]/g, '')}`}>
                  {booking.contact.phone}
                </a>
              </p>
              {booking.contact.email && (
                <p className="text-[15px]">
                  <a className="text-gold underline-offset-4 hover:underline" href={`mailto:${booking.contact.email}`}>
                    {booking.contact.email}
                  </a>
                </p>
              )}
            </section>

            <section>
              <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2">
                <div>
                  <dt className="text-muted">{t.owner.bookings.columns.when}</dt>
                  <dd className="font-semibold">{fmtDate.dateTime(booking.slot)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.owner.bookings.columns.mode}</dt>
                  <dd className="font-semibold">{t.owner.bookings.modes[booking.mode]}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted">{t.owner.bookings.columns.device}</dt>
                  <dd className="font-semibold">
                    {[booking.device.brand, booking.device.model, booking.device.year].filter(Boolean).join(' ') || '-'}
                    {jobs.length > 0 && <span className="block font-normal text-muted">{jobs.join(', ')}</span>}
                    {booking.custom && <span className="block font-normal text-muted">{d.custom}: {booking.custom}</span>}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted">{d.issue}</dt>
                  <dd className="whitespace-pre-wrap">{booking.issue}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.account.bookings.estimate}</dt>
                  <dd className="font-semibold">{fmt(d.estimate, { from: booking.estimate.priceFrom, to: booking.estimate.priceTo })}</dd>
                </div>
                {booking.finalLei != null && (
                  <div>
                    <dt className="text-muted">{t.account.bookings.final}</dt>
                    <dd className="font-semibold">{fmt(d.final, { n: booking.finalLei })}</dd>
                  </div>
                )}
                {booking.location && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted">{d.address}</dt>
                    <dd>{booking.location}</dd>
                  </div>
                )}
              </dl>
            </section>

            {booking.pickup && (
              <section aria-labelledby="d-pickup" className="rounded-[14px] border border-line bg-surface p-4">
                <h3 id="d-pickup" className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                  {d.pickup}
                </h3>
                <p className="mt-2 font-semibold">{booking.pickup.address}</p>
                <p className="text-[14px] text-muted">
                  {d.trips[booking.pickup.trips]}
                  {booking.pickup.urgent ? `, ${d.urgent.toLowerCase()}` : ''}, {booking.pickup.quote.totalLei} lei
                </p>
                {booking.mapLink && (
                  <a className="btn btn-ghost mt-3 h-10 min-h-0" href={booking.mapLink} target="_blank" rel="noreferrer">
                    {d.map}
                  </a>
                )}
              </section>
            )}

            <section aria-labelledby="d-history">
              <h3 id="d-history" className="text-[13px] font-semibold uppercase tracking-wide text-muted">
                {d.history}
              </h3>
              <ol className="mt-3 grid gap-3">
                {booking.statusHistory.map((entry, i) => (
                  <li key={`${entry.at}-${i}`} className="grid grid-cols-[auto_1fr] gap-3 text-[14px]">
                    <span className={`mt-1.5 size-2.5 rounded-full ${i === booking.statusHistory.length - 1 ? 'bg-gold' : 'bg-ok'}`} aria-hidden="true" />
                    <div>
                      <p>
                        <span className="font-semibold">{t.track.statuses[entry.status]}</span>
                        <span className="text-muted">
                          {' '}
                          {fmtDate.dateTime(entry.at)}, {entry.by === 'customer' ? d.byCustomer : entry.by}
                        </span>
                      </p>
                      {entry.note && <p className="mt-0.5 whitespace-pre-wrap text-muted">{entry.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <form onSubmit={(e) => void save(e)} className="grid gap-4 border-t border-line pt-6">
              <Field label={d.newStatus}>
                {(p) => (
                  <select {...p} className="field" value={status} onChange={(e) => setStatus(e.target.value as OwnerBooking['status'])}>
                    {BOOKING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t.track.statuses[s]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={d.finalLabel} hint={d.finalHint}>
                {(p) => (
                  <input
                    {...p}
                    className="field"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1_000_000}
                    step={1}
                    value={finalLei}
                    onChange={(e) => setFinalLei(e.target.value)}
                    aria-invalid={!priceValid || undefined}
                  />
                )}
              </Field>
              <Field label={d.noteLabel}>
                {(p) => <textarea {...p} className="field min-h-24" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={d.notePlaceholder} />}
              </Field>
              {statusDirty &&
                (booking.contact.email ? (
                  <label className="flex items-center gap-3 text-[15px]">
                    <input type="checkbox" className="size-5 accent-[var(--gold)]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                    {d.notify}
                  </label>
                ) : (
                  <p className="text-[14px] text-muted">{d.noEmail}</p>
                ))}
              {message && <Notice tone={message.tone}>{message.text}</Notice>}
              <button type="submit" className="btn btn-gold" disabled={saving || !priceValid || (!statusDirty && !priceDirty && !note.trim())} aria-busy={saving}>
                {d.save}
              </button>
            </form>
          </div>
        )}
      </aside>
    </div>
  )
}
