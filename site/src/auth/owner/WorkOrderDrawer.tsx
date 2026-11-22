import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { fmt, useI18n } from '../../i18n'
import { catalog } from '../../data/catalog'
import { Close } from '../../components/Icons'
import { inertOutside } from '../../lib/inert'
import type { BookingStatus } from '../../types'
import { api } from '../api'
import { Field, Loading, Notice, StatusBadge, useDateFormat } from '../ui'
import { BOOKING_STATUSES, KIND_TONE, kindOf } from './constants'
import { CameraIcon, DocIcon } from './icons'
import { shopDate, type OwnerBooking } from './types'
import { estimateText } from './format'
import { useWorkshopCopy } from './workshop/copy'
import { dayLabel, pdfUrl, sheetLabel, shrinkPhoto, uploadPhoto, type WarrantyView, type WorkOrder } from './workshop/model'
import { ContactButtons, customerMessage, daysUntil, SectionTitle, SheetChip, WarrantyStateBadge } from './workshop/parts'

type Section = 'work' | 'intake' | 'docs' | 'photos' | 'history'
const SECTIONS: Section[] = ['work', 'intake', 'docs', 'photos', 'history']
type Flash = { tone: 'ok' | 'error'; text: string } | null

/**
 * One job, start to finish: who it is for, intake at the counter, the repair, documents, photos
 * and history. Replaces the old booking drawer.
 */
export function WorkOrderDrawer({
  code,
  manager,
  onClose,
  onChanged,
  onCustomer,
}: {
  code: string
  manager: boolean
  onClose: () => void
  onChanged: (booking: OwnerBooking) => void
  onCustomer?: (id: string) => void
}) {
  const { t, lang } = useI18n()
  const c = useWorkshopCopy()
  const [order, setOrder] = useState<WorkOrder | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [section, setSection] = useState<Section>('work')
  // Lives here, not in the form: the form remounts with the saved order and would lose it.
  const [flash, setFlash] = useState<Flash>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    const undoInert = inertOutside(rootRef.current)
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-nested-dialog]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      undoInert()
      returnTo?.focus?.()
    }
  }, [onClose])

  const load = useCallback(
    async (first: boolean) => {
      const result = await api<WorkOrder>(`/api/admin/bookings/${encodeURIComponent(code)}`)
      if (!result.ok) return setLoadError(true)
      setOrder(result.data)
      // A shop job that has not been taken in yet opens on the intake form: that is the next thing to do.
      if (first) setSection(!result.data.intake && result.data.mode === 'shop' && !['done', 'cancelled'].includes(result.data.status) ? 'intake' : 'work')
    },
    [code],
  )

  useEffect(() => {
    setOrder(null)
    setLoadError(false)
    void load(true)
  }, [load])

  /** After any save: refresh the whole order (warranties, photos and history move together) and tell the views. */
  const refresh = useCallback(
    async (saved?: OwnerBooking) => {
      if (saved) onChanged(saved)
      await load(false)
    },
    [load, onChanged],
  )

  const kind = order ? kindOf(order) : 'shop'
  const message = order ? customerMessage(order) : { subject: '', body: '' }

  return (
    <div ref={rootRef} className="fixed inset-0 z-[60]">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label={t.owner.detail.close} tabIndex={-1} />
      <aside role="dialog" aria-modal="true" aria-labelledby="wo-title" data-lenis-prevent className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-line bg-bg">
        {/* Header: identity of the job and the person, always in view. */}
        <header className="border-b border-line px-5 pt-5 sm:px-7 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="wo-title" className="display-2 font-mono text-[1.6rem] leading-none">
                  {code}
                </h2>
                {order && <SheetChip intake={order.intake} />}
              </div>
              {order && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={order.status} />
                  <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${KIND_TONE[kind].chip}`}>{t.owner.calendar.legend[kind]}</span>
                  {order.source === 'walk-in' && <span className="rounded-full border border-line px-2.5 py-0.5 text-[12px] font-semibold text-muted">{c.source['walk-in']}</span>}
                </div>
              )}
            </div>
            <button ref={closeRef} type="button" className="grid size-10 shrink-0 place-items-center rounded-full border border-line hover:border-ink" onClick={onClose} aria-label={t.owner.detail.close}>
              <Close />
            </button>
          </div>

          {order && (
            <div className="mt-4 grid gap-3 rounded-[16px] border border-line bg-surface p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-[17px] font-bold">
                  {order.customer && onCustomer ? (
                    <button type="button" onClick={() => onCustomer(order.customer!.id)} className="truncate text-left underline-offset-4 hover:underline" title={c.wo.customerCard}>
                      {order.contact.name}
                    </button>
                  ) : (
                    order.contact.name
                  )}
                </p>
                <p className="truncate text-[13px] text-muted">
                  {[order.contact.phone, order.contact.email, order.customer?.company?.name].filter(Boolean).join(' · ')}
                </p>
              </div>
              <ContactButtons contact={order.contact} preferred={order.customer?.preferred} message={message} size="sm" />
            </div>
          )}

          <nav role="tablist" aria-label={code} className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1">
            {SECTIONS.map((s) => {
              const on = section === s
              const pending = s === 'intake' && order && !order.intake && order.mode === 'shop' && !['done', 'cancelled'].includes(order.status)
              const count = s === 'photos' ? order?.photoIds?.length : undefined
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  id={`wo-tab-${s}`}
                  aria-selected={on}
                  aria-controls="wo-panel"
                  onClick={() => {
                    setSection(s)
                    setFlash(null)
                  }}
                  className={`relative shrink-0 rounded-t-[10px] px-3.5 pb-3 pt-2 text-[14px] font-semibold transition-colors ${on ? 'text-ink' : 'text-muted hover:text-ink'}`}
                >
                  {c.wo.sections[s]}
                  {pending && <span className="ml-1.5 inline-block size-2 rounded-full bg-gold align-middle" aria-hidden="true" />}
                  {count ? <span className="ml-1.5 text-[12px] text-muted">{count}</span> : null}
                  {on && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-gold" aria-hidden="true" />}
                </button>
              )
            })}
          </nav>
        </header>

        <div id="wo-panel" role="tabpanel" aria-labelledby={`wo-tab-${section}`} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {!order && !loadError && <Loading label={t.account.loading} />}
          {loadError && <Notice tone="error">{t.owner.detail.loadError}</Notice>}
          {flash && section === 'work' && (
            <div className="mb-5">
              <Notice tone={flash.tone}>{flash.text}</Notice>
            </div>
          )}
          {order && section === 'work' && <WorkSection key={order.updatedAt} order={order} manager={manager} onSaved={refresh} onFlash={setFlash} />}
          {order && section === 'intake' && <IntakeSection order={order} onSaved={refresh} />}
          {order && section === 'docs' && <DocsSection order={order} manager={manager} onSaved={refresh} lang={lang} />}
          {order && section === 'photos' && <PhotosSection order={order} onSaved={refresh} />}
          {order && section === 'history' && <HistorySection order={order} />}
        </div>
      </aside>
    </div>
  )
}

// ---- Work: details, repair notes, status and price -------------------------------------------

function WorkSection({ order, manager, onSaved, onFlash }: { order: WorkOrder; manager: boolean; onSaved: (b?: OwnerBooking) => Promise<void>; onFlash: (f: Flash) => void }) {
  const { t, L } = useI18n()
  const c = useWorkshopCopy()
  const d = t.owner.detail
  const fmtDate = useDateFormat()
  const [status, setStatus] = useState<BookingStatus>(order.status)
  const [repair, setRepair] = useState({ diagnosis: order.repair?.diagnosis ?? '', workDone: order.repair?.workDone ?? '', partsUsed: order.repair?.partsUsed ?? '' })
  const [finalLei, setFinalLei] = useState(order.finalLei != null ? String(order.finalLei) : '')
  const [note, setNote] = useState('')
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)

  const price = finalLei.trim() === '' ? null : Number(finalLei)
  const priceValid = price === null || (Number.isInteger(price) && price >= 0 && price <= 1_000_000)
  const priceDirty = manager && priceValid && price !== (order.finalLei ?? null)
  const statusDirty = status !== order.status
  const repairDirty = (['diagnosis', 'workDone', 'partsUsed'] as const).some((k) => repair[k].trim() !== (order.repair?.[k] ?? ''))
  const dirty = statusDirty || priceDirty || repairDirty || note.trim() !== ''

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    onFlash(null)
    const changedRepair = Object.fromEntries((['diagnosis', 'workDone', 'partsUsed'] as const).filter((k) => repair[k].trim() !== (order.repair?.[k] ?? '')).map((k) => [k, repair[k].trim()]))
    const result = await api<OwnerBooking & { notified?: 'sent' | 'failed' | 'skipped' }>(`/api/admin/bookings/${encodeURIComponent(order.code)}/status`, {
      method: 'PATCH',
      body: {
        status,
        notify,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(priceDirty ? { finalLei: price } : {}),
        ...(Object.keys(changedRepair).length ? { repair: changedRepair } : {}),
      },
    })
    setSaving(false)
    if (!result.ok) return onFlash({ tone: 'error', text: result.status === 409 ? d.slotTaken : c.error })
    const { notified, ...saved } = result.data
    onFlash(notified === 'failed' ? { tone: 'error', text: c.mailFailed } : { tone: 'ok', text: notified === 'sent' ? c.mailSent : c.saved })
    await onSaved(saved)
  }

  const jobs = order.jobIds.map((id) => catalog.find((j) => j.id === id)?.name).filter((n): n is NonNullable<typeof n> => Boolean(n)).map((n) => L(n))
  const device = [order.device.brand, order.device.model, order.device.year].filter(Boolean).join(' ')

  return (
    <form onSubmit={(e) => void save(e)} className="grid gap-7">
      <dl className="grid gap-x-6 gap-y-4 text-[14px] sm:grid-cols-2">
        <Detail label={order.intake ? c.wo.received : c.wo.when}>{fmtDate.dateTime(order.intake?.receivedAt ?? order.slot)}</Detail>
        <Detail label={t.owner.bookings.columns.device}>
          {[order.intake?.deviceType, device].filter(Boolean).join(', ') || '-'}
          {order.intake?.serial && <span className="block font-mono text-[13px] font-normal text-muted">{order.intake.serial}</span>}
        </Detail>
        <Detail label={d.issue} wide>
          <span className="whitespace-pre-wrap font-normal">{order.issue}</span>
          {jobs.length > 0 && <span className="mt-1 block font-normal text-muted">{jobs.join(', ')}</span>}
          {order.custom && <span className="mt-1 block font-normal text-muted">{d.custom}: {order.custom}</span>}
        </Detail>
        <Detail label={t.account.bookings.estimate}>{estimateText(order.estimate, d)}</Detail>
        {order.deliveredAt && <Detail label={c.wo.delivered}>{fmtDate.dateTime(order.deliveredAt)}</Detail>}
        {order.location && <Detail label={d.address} wide>{order.location}</Detail>}
      </dl>

      {order.pickup && (
        <section className={`rounded-[16px] border-l-4 ${KIND_TONE.pickup.border} bg-ok/8 p-4`} aria-label={d.pickup}>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ok">{d.pickup}</p>
          <p className="mt-1.5 font-semibold">{order.pickup.address}</p>
          <p className="text-[14px] text-muted">
            {d.trips[order.pickup.trips]}
            {order.pickup.urgent ? `, ${d.urgent.toLowerCase()}` : ''}, {order.pickup.quote.totalLei} lei
          </p>
          {order.mapLink && (
            <a className="btn btn-ghost mt-3 h-9 min-h-0 text-[14px]" href={order.mapLink} target="_blank" rel="noreferrer">
              {d.map}
            </a>
          )}
        </section>
      )}

      <section className="grid gap-4" aria-labelledby="wo-repair">
        <SectionTitle id="wo-repair">{c.wo.repairTitle}</SectionTitle>
        <Field label={c.wo.diagnosis}>
          {(p) => <textarea {...p} className="field min-h-20" maxLength={2000} value={repair.diagnosis} placeholder={c.wo.diagnosisPlaceholder} onChange={(e) => setRepair({ ...repair, diagnosis: e.target.value })} />}
        </Field>
        <Field label={c.wo.workDone}>
          {(p) => <textarea {...p} className="field min-h-20" maxLength={2000} value={repair.workDone} placeholder={c.wo.workDonePlaceholder} onChange={(e) => setRepair({ ...repair, workDone: e.target.value })} />}
        </Field>
        <Field label={c.wo.partsUsed}>
          {(p) => <input {...p} className="field" maxLength={1000} value={repair.partsUsed} placeholder={c.wo.partsUsedPlaceholder} onChange={(e) => setRepair({ ...repair, partsUsed: e.target.value })} />}
        </Field>
      </section>

      <section className="grid gap-4" aria-labelledby="wo-status">
        <SectionTitle id="wo-status">{c.wo.statusTitle}</SectionTitle>
        <StatusPicker value={status} onChange={setStatus} />
        {manager ? (
          <Field label={d.finalLabel} hint={status === 'unrepairable' ? undefined : d.finalHint}>
            {(p) => (
              <input
                {...p}
                className="field max-w-[14rem]"
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
        ) : (
          <p className="text-[14px] text-muted">{c.wo.priceHidden}</p>
        )}
        <Field label={d.noteLabel}>
          {(p) => <textarea {...p} className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={d.notePlaceholder} />}
        </Field>
      </section>

      {/* Pinned to the bottom of the panel so Save never scrolls out of reach. */}
      <div className="sticky -bottom-6 -mx-5 -mb-6 grid gap-3 border-t border-line bg-bg px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-7 sm:px-7">
        {statusDirty &&
          (order.contact.email ? (
            <label className="flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="size-5 accent-[var(--gold)]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              {d.notify}
            </label>
          ) : (
            <p className="text-[14px] text-muted">{d.noEmail}</p>
          ))}
        <div className="flex items-center gap-3">
          {dirty && !saving && <span className="text-[13px] text-muted">{c.wo.unsaved}</span>}
          <button type="submit" className="btn btn-gold ml-auto min-w-40" disabled={saving || !priceValid || !dirty} aria-busy={saving}>
            {d.save}
          </button>
        </div>
      </div>
    </form>
  )
}

/** The workshop flow as a row of choices: faster than a select and shows where the job is. */
function StatusPicker({ value, onChange }: { value: BookingStatus; onChange: (s: BookingStatus) => void }) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t.owner.detail.newStatus} className="flex flex-wrap gap-2">
      {BOOKING_STATUSES.map((s) => {
        const on = value === s
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s)}
            className={`rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-colors ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted hover:border-ink hover:text-ink'}`}
          >
            {t.track.statuses[s]}
          </button>
        )
      })}
    </div>
  )
}

function Detail({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  )
}

// ---- Intake at the counter -------------------------------------------------------------------

function IntakeSection({ order, onSaved }: { order: WorkOrder; onSaved: (b?: OwnerBooking) => Promise<void> }) {
  const c = useWorkshopCopy()
  const fmtDate = useDateFormat()
  const [editing, setEditing] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const closed = order.status === 'done' || order.status === 'cancelled'

  if (order.intake && !editing) {
    const i = order.intake
    return (
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-line bg-surface p-4">
          <div>
            <p className="font-mono text-[22px] font-bold leading-none">{sheetLabel(order)}</p>
            <p className="mt-1.5 text-[13px] text-muted">{fmt(c.intake.receivedBy, { by: i.by, when: fmtDate.dateTime(i.receivedAt) })}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost h-10 min-h-0 text-[14px]" onClick={() => setEditing(true)}>
              {c.intake.edit}
            </button>
            <a className="btn btn-gold h-10 min-h-0 gap-2 text-[14px]" href={pdfUrl.intake(order.code)} target="_blank" rel="noreferrer">
              <DocIcon className="size-4" />
              {c.docs.open}
            </a>
          </div>
        </div>
        {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
        <dl className="grid gap-x-6 gap-y-4 text-[14px] sm:grid-cols-2">
          <Detail label={c.intake.deviceType}>{i.deviceType}</Detail>
          <Detail label={c.intake.serial}>{i.serial ? <span className="font-mono">{i.serial}</span> : '-'}</Detail>
          <Detail label={c.intake.accessories} wide>{i.accessories || '-'}</Detail>
          <Detail label={c.intake.appearance} wide>{i.appearance || '-'}</Detail>
        </dl>
      </div>
    )
  }

  if (!order.intake && closed) return <Notice tone="info">{c.intake.closed}</Notice>

  return (
    <IntakeForm
      order={order}
      onCancel={order.intake ? () => setEditing(false) : undefined}
      onDone={async (saved, text) => {
        setEditing(false)
        setFlash(text ? { tone: 'ok', text } : null)
        await onSaved(saved)
      }}
    />
  )
}

function IntakeForm({ order, onCancel, onDone }: { order: WorkOrder; onCancel?: () => void; onDone: (b: OwnerBooking, text?: string) => Promise<void> }) {
  const c = useWorkshopCopy()
  const editing = Boolean(order.intake)
  const [fields, setFields] = useState({
    deviceType: order.intake?.deviceType ?? '',
    serial: order.intake?.serial ?? '',
    accessories: order.intake?.accessories ?? '',
    appearance: order.intake?.appearance ?? '',
  })
  const [email, setEmail] = useState(Boolean(order.contact.email))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = fields.deviceType.trim().length >= 2

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setError(null)
    const body = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()]))
    const result = editing
      ? await api<OwnerBooking>(`/api/admin/bookings/${encodeURIComponent(order.code)}/intake`, { method: 'PATCH', body })
      : await api<OwnerBooking & { notified?: string }>(`/api/admin/bookings/${encodeURIComponent(order.code)}/intake`, {
          method: 'POST',
          body: { ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '')), email },
        })
    setSaving(false)
    if (!result.ok) return setError(result.error === 'already' ? c.intake.already : result.error === 'closed' ? c.intake.closed : c.error)
    const saved = result.data
    await onDone(saved, editing ? c.saved : fmt(c.intake.done, { n: sheetLabel(saved) ?? '' }))
    // A fresh sheet is meant to be printed and signed straight away.
    if (!editing) window.open(pdfUrl.intake(order.code), '_blank', 'noopener')
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-5">
      {!editing && (
        <div>
          <h3 className="text-lg font-bold">{c.intake.title}</h3>
          <p className="mt-1 text-[14px] text-muted">{c.intake.lead}</p>
        </div>
      )}
      <Field label={c.intake.deviceType}>
        {(p) => (
          <div className="grid gap-2">
            <input {...p} className="field" required minLength={2} maxLength={60} value={fields.deviceType} onChange={(e) => setFields({ ...fields, deviceType: e.target.value })} />
            <div className="flex flex-wrap gap-1.5">
              {c.intake.presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFields({ ...fields, deviceType: preset })}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${fields.deviceType === preset ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-ink hover:text-ink'}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}
      </Field>
      <Field label={c.intake.serial}>
        {(p) => <input {...p} className="field font-mono" maxLength={80} autoCapitalize="characters" spellCheck={false} value={fields.serial} onChange={(e) => setFields({ ...fields, serial: e.target.value })} />}
      </Field>
      <Field label={c.intake.accessories}>
        {(p) => <input {...p} className="field" maxLength={300} placeholder={c.intake.accessoriesPlaceholder} value={fields.accessories} onChange={(e) => setFields({ ...fields, accessories: e.target.value })} />}
      </Field>
      <Field label={c.intake.appearance}>
        {(p) => <textarea {...p} className="field min-h-20" maxLength={600} placeholder={c.intake.appearancePlaceholder} value={fields.appearance} onChange={(e) => setFields({ ...fields, appearance: e.target.value })} />}
      </Field>
      {!editing &&
        (order.contact.email ? (
          <label className="flex items-center gap-3 text-[15px]">
            <input type="checkbox" className="size-5 accent-[var(--gold)]" checked={email} onChange={(e) => setEmail(e.target.checked)} />
            {c.intake.emailSheet}
          </label>
        ) : (
          <p className="text-[14px] text-muted">{c.intake.noEmail}</p>
        ))}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {c.intake.cancel}
          </button>
        )}
        <button type="submit" className="btn btn-gold min-w-40" disabled={!valid || saving} aria-busy={saving}>
          {editing ? c.intake.saveEdits : c.intake.submit}
        </button>
      </div>
    </form>
  )
}

// ---- Documents: service sheet and warranty ---------------------------------------------------

function DocsSection({ order, manager, onSaved, lang }: { order: WorkOrder; manager: boolean; onSaved: (b?: OwnerBooking) => Promise<void>; lang: 'ro' | 'en' }) {
  const c = useWorkshopCopy()
  const valid = order.warranties.find((w) => !w.voided)
  const canIssue = !valid && (order.status === 'ready' || order.status === 'done')
  return (
    <div className="grid gap-6">
      <DocRow title={c.docs.sheet} subtitle={order.intake ? sheetLabel(order)! : c.docs.sheetNone} href={order.intake ? pdfUrl.intake(order.code) : undefined} />
      <section className="grid gap-3" aria-labelledby="wo-warranty">
        <SectionTitle id="wo-warranty">{c.docs.warranty}</SectionTitle>
        {order.warranties.length === 0 && !canIssue && <p className="text-[14px] text-muted">{c.docs.warrantyNone}</p>}
        {order.warranties.map((w) => (
          <WarrantyRow key={w.id} warranty={w} manager={manager} lang={lang} onSaved={onSaved} />
        ))}
        {canIssue && <IssueWarranty order={order} onSaved={onSaved} />}
      </section>
    </div>
  )
}

function DocRow({ title, subtitle, href }: { title: string; subtitle: string; href?: string }) {
  const c = useWorkshopCopy()
  return (
    <div className="flex items-center gap-4 rounded-[16px] border border-line bg-surface p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-surface-2">
        <DocIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="truncate text-[13px] text-muted">{subtitle}</p>
      </div>
      {href && (
        <a className="btn btn-ghost h-10 min-h-0 shrink-0 text-[14px]" href={href} target="_blank" rel="noreferrer">
          {c.docs.open}
        </a>
      )}
    </div>
  )
}

function WarrantyRow({ warranty: w, manager, lang, onSaved }: { warranty: WarrantyView; manager: boolean; lang: 'ro' | 'en'; onSaved: (b?: OwnerBooking) => Promise<void> }) {
  const c = useWorkshopCopy()
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const left = daysUntil(w.endsOn, shopDate())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const result = await api(`/api/admin/warranties/${w.id}/void`, { method: 'POST', body: { reason: reason.trim() } })
    setBusy(false)
    if (!result.ok) return setError(true)
    setVoiding(false)
    await onSaved()
  }

  return (
    <div className="rounded-[16px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-[18px] font-bold">{w.label}</p>
        <WarrantyStateBadge state={w.state} />
        <div className="ml-auto flex gap-2">
          {manager && !w.voided && (
            <button type="button" className="btn btn-ghost h-9 min-h-0 text-[13px]" onClick={() => setVoiding((v) => !v)} aria-expanded={voiding}>
              {c.docs.void}
            </button>
          )}
          <a className="btn btn-ghost h-9 min-h-0 text-[13px]" href={pdfUrl.warranty(w.id)} target="_blank" rel="noreferrer">
            PDF
          </a>
        </div>
      </div>
      <p className="mt-2 text-[14px]">
        {fmt(c.docs.validUntil, { date: dayLabel(w.endsOn, lang) })}
        {w.state !== 'void' && w.state !== 'expired' && <span className="text-muted"> · {left === 0 ? c.warranties.dayLeft : fmt(c.warranties.daysLeft, { n: left })}</span>}
      </p>
      <p className="mt-1 text-[13px] text-muted">{w.work}</p>
      {w.voided && <p className="mt-2 text-[13px] font-semibold text-rose">{fmt(c.docs.voided, { reason: w.voided.reason })}</p>}
      {voiding && (
        <form onSubmit={(e) => void submit(e)} className="mt-3 grid gap-2 border-t border-line pt-3">
          <Field label={c.docs.voidReason}>{(p) => <input {...p} className="field" minLength={3} maxLength={300} required value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          {error && <Notice tone="error">{c.error}</Notice>}
          <button type="submit" className="btn justify-self-end bg-rose text-white hover:brightness-110" disabled={busy || reason.trim().length < 3}>
            {c.docs.voidConfirm}
          </button>
        </form>
      )}
    </div>
  )
}

function IssueWarranty({ order, onSaved }: { order: WorkOrder; onSaved: (b?: OwnerBooking) => Promise<void> }) {
  const c = useWorkshopCopy()
  const [months, setMonths] = useState(String(order.defaults.warrantyMonths || 3))
  const [work, setWork] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const n = Number(months)
  const valid = Number.isInteger(n) && n >= 1 && n <= 60

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFlash(null)
    const result = await api<WarrantyView & { notified: string }>(`/api/admin/bookings/${encodeURIComponent(order.code)}/warranty`, {
      method: 'POST',
      body: { months: n, ...(work.trim() ? { work: work.trim() } : {}) },
    })
    setBusy(false)
    if (!result.ok) return setFlash({ tone: 'error', text: c.error })
    await onSaved()
    window.open(pdfUrl.warranty(result.data.id), '_blank', 'noopener')
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4 rounded-[16px] border border-dashed border-gold/60 p-4">
      <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Field label={c.docs.months} hint={fmt(c.docs.monthsHint, { n: order.defaults.warrantyMonths })}>
          {(p) => <input {...p} className="field" type="number" inputMode="numeric" min={1} max={60} step={1} value={months} onChange={(e) => setMonths(e.target.value)} aria-invalid={!valid || undefined} />}
        </Field>
        <Field label={c.docs.work} hint={c.docs.workHint}>
          {(p) => <input {...p} className="field" maxLength={1000} value={work} placeholder={order.repair?.workDone ?? ''} onChange={(e) => setWork(e.target.value)} />}
        </Field>
      </div>
      {order.status === 'ready' && <p className="text-[13px] text-muted">{c.docs.ridesAlong}</p>}
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      <button type="submit" className="btn btn-gold justify-self-end" disabled={!valid || busy} aria-busy={busy}>
        {c.docs.issue}
      </button>
    </form>
  )
}

// ---- Photos ----------------------------------------------------------------------------------

function PhotosSection({ order, onSaved }: { order: WorkOrder; onSaved: (b?: OwnerBooking) => Promise<void> }) {
  const c = useWorkshopCopy()
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ids = order.photoIds ?? []
  const room = 6 - ids.length

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    const list = [...files].slice(0, room)
    if (files.length > room) setError(c.photos.full)
    setBusy(list.length)
    let failed = false
    for (const file of list) {
      try {
        const result = await uploadPhoto(order.code, await shrinkPhoto(file))
        if (!result.ok) failed = true
      } catch {
        failed = true
      }
      setBusy((n) => n - 1)
    }
    if (failed) setError(c.photos.failed)
    if (inputRef.current) inputRef.current.value = ''
    await onSaved()
  }

  const remove = async (id: string) => {
    const result = await api(`/api/admin/photos/${id}`, { method: 'DELETE' })
    if (!result.ok) setError(c.error)
    await onSaved()
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">{c.photos.title}</h3>
          <p className="text-[13px] text-muted">{c.photos.hint}</p>
        </div>
        <label className={`btn btn-gold h-10 min-h-0 cursor-pointer gap-2 text-[14px] ${room <= 0 || busy ? 'pointer-events-none opacity-50' : ''}`}>
          <CameraIcon className="size-4" />
          {busy ? c.photos.uploading : c.photos.add}
          <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={room <= 0 || busy > 0} onChange={(e) => void add(e.target.files)} />
        </label>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {ids.length === 0 && busy === 0 ? (
        <p className="rounded-[16px] border border-dashed border-line px-4 py-10 text-center text-[14px] text-muted">{c.photos.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ids.map((id) => (
            <li key={id} className="group relative aspect-[4/3] overflow-hidden rounded-[14px] border border-line bg-surface-2">
              <a href={`/api/admin/photos/${id}`} target="_blank" rel="noreferrer" aria-label={c.photos.open}>
                <img src={`/api/admin/photos/${id}`} alt="" loading="lazy" className="size-full object-cover" />
              </a>
              <button
                type="button"
                onClick={() => void remove(id)}
                aria-label={c.photos.remove}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/60 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                <Close className="size-4" />
              </button>
            </li>
          ))}
          {Array.from({ length: busy }, (_, i) => (
            <li key={`up-${i}`} className="aspect-[4/3] animate-pulse rounded-[14px] bg-surface-2" />
          ))}
        </ul>
      )}
    </div>
  )
}

// ---- History ---------------------------------------------------------------------------------

function HistorySection({ order }: { order: WorkOrder }) {
  const { t } = useI18n()
  const fmtDate = useDateFormat()
  const d = t.owner.detail
  return (
    <ol className="grid gap-4">
      {[...order.statusHistory].reverse().map((entry, i) => (
        <li key={`${entry.at}-${i}`} className="grid grid-cols-[auto_1fr] gap-3 text-[14px]">
          <span className={`mt-1.5 size-2.5 rounded-full ${i === 0 ? 'bg-gold' : 'bg-line'}`} aria-hidden="true" />
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
  )
}
