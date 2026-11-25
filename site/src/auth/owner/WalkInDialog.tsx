import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fmt, useI18n } from '../../i18n'
import { Close } from '../../components/Icons'
import { inertOutside } from '../../lib/inert'
import type { ContactChannel, Customer } from '../../types'
import { api } from '../api'
import { Field, Notice } from '../ui'
import { SearchIcon } from './icons'
import type { OwnerBooking } from './types'
import { useWorkshopCopy } from './workshop/copy'
import { pdfUrl, type CustomerSummary } from './workshop/model'

const CHANNELS: ContactChannel[] = ['phone', 'whatsapp', 'sms', 'email']
const PHONE = /^[+0-9 ()-]{8,20}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type NewCustomer = { name: string; phone: string; email: string; preferred: ContactChannel; isCompany: boolean; companyName: string; cui: string; regCom: string }
const EMPTY: NewCustomer = { name: '', phone: '', email: '', preferred: 'phone', isCompany: false, companyName: '', cui: '', regCom: '' }

/**
 * A device brought to the counter without a booking. One form: the customer (found or new), the
 * device and the fault. Creating it numbers the sheet and opens it for printing.
 */
export function WalkInDialog({ preset, onClose, onCreated }: { preset?: Customer | null; onClose: () => void; onCreated: (booking: OwnerBooking) => void }) {
  const { lang } = useI18n()
  const c = useWorkshopCopy()
  const w = c.walkIn
  const rootRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Customer | null>(preset ?? null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CustomerSummary[] | null>(null)
  const [fresh, setFresh] = useState<NewCustomer>(EMPTY)
  const [device, setDevice] = useState({ deviceType: '', brand: '', model: '', serial: '', accessories: '', appearance: '' })
  const [issue, setIssue] = useState('')
  const [estimate, setEstimate] = useState({ from: '', to: '' })
  const [email, setEmail] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    const undo = inertOutside(rootRef.current)
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      undo()
      returnTo?.focus?.()
    }
  }, [onClose])

  // Search as the owner types; a short pause keeps it to one request per word.
  useEffect(() => {
    if (picked || q.trim().length < 2) return setResults(null)
    let live = true
    const timer = setTimeout(() => {
      void api<{ items: CustomerSummary[] }>(`/api/admin/customers?limit=6&q=${encodeURIComponent(q.trim())}`).then((r) => live && r.ok && setResults(r.data.items))
    }, 220)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q, picked])

  const freshValid =
    fresh.name.trim().length >= 2 &&
    (fresh.phone.trim() === '' || PHONE.test(fresh.phone.trim())) &&
    (fresh.email.trim() === '' || EMAIL.test(fresh.email.trim())) &&
    (fresh.preferred === 'email' ? fresh.email.trim() !== '' : fresh.phone.trim() !== '')
  const fromN = estimate.from.trim() === '' ? 0 : Number(estimate.from)
  const toN = estimate.to.trim() === '' ? fromN : Number(estimate.to)
  const estimateValid = Number.isInteger(fromN) && Number.isInteger(toN) && fromN >= 0 && toN >= fromN
  const valid = (picked || freshValid) && device.deviceType.trim().length >= 2 && issue.trim().length >= 3 && estimateValid
  const customerEmail = picked ? picked.email : fresh.email.trim()

  const pickExisting = async (id: string) => {
    const r = await api<{ customer: Customer }>(`/api/admin/customers/${id}`)
    if (r.ok) {
      setPicked(r.data.customer)
      setConflict(null)
      setError(null)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return setError(picked || freshValid ? null : w.needCustomer)
    setSaving(true)
    setError(null)
    setConflict(null)
    const trim = (v: string) => v.trim() || undefined
    const body = {
      ...(picked
        ? { customerId: picked.id }
        : {
            customer: {
              name: fresh.name.trim(),
              ...(trim(fresh.phone) ? { phone: fresh.phone.trim() } : {}),
              ...(trim(fresh.email) ? { email: fresh.email.trim() } : {}),
              preferred: fresh.preferred,
              ...(fresh.isCompany ? { company: { name: trim(fresh.companyName), cui: trim(fresh.cui), regCom: trim(fresh.regCom) } } : {}),
            },
          }),
      deviceType: device.deviceType.trim(),
      device: { brand: trim(device.brand), model: trim(device.model) },
      ...(trim(device.serial) ? { serial: device.serial.trim() } : {}),
      ...(trim(device.accessories) ? { accessories: device.accessories.trim() } : {}),
      ...(trim(device.appearance) ? { appearance: device.appearance.trim() } : {}),
      issue: issue.trim(),
      estimate: { priceFrom: fromN, priceTo: toN },
      lang,
      email: email && Boolean(customerEmail),
    }
    const result = await api<OwnerBooking>('/api/admin/walk-ins', { method: 'POST', body })
    setSaving(false)
    if (result.ok) {
      onCreated(result.data)
      window.open(pdfUrl.intake(result.data.code), '_blank', 'noopener')
      return
    }
    if (result.error === 'customer_exists') {
      setConflict((result.data as { customerId?: string }).customerId ?? null)
      return setError(w.exists)
    }
    setError(c.error)
  }

  const set = <K extends keyof NewCustomer>(key: K, value: NewCustomer[K]) => setFresh((f) => ({ ...f, [key]: value }))

  return (
    <div ref={rootRef} className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/55" onClick={onClose} aria-label={c.intake.cancel} tabIndex={-1} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-title"
        onSubmit={(e) => void submit(e)}
        data-lenis-prevent
        className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] border border-line bg-bg sm:rounded-[24px]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7">
          <div>
            <h2 id="walkin-title" className="display-2 text-2xl">
              {w.title}
            </h2>
            <p className="mt-0.5 text-[14px] text-muted">{w.lead}</p>
          </div>
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full border border-line hover:border-ink" onClick={onClose} aria-label={c.intake.cancel}>
            <Close />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-7 overflow-y-auto px-5 py-6 sm:px-7">
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{w.customer}</legend>
            {picked ? (
              <div className="flex items-center justify-between gap-3 rounded-[16px] border border-gold/60 bg-gold/8 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-bold">{picked.name}</p>
                  <p className="truncate text-[13px] text-muted">{[picked.phone, picked.email, picked.company?.name].filter(Boolean).join(' · ')}</p>
                </div>
                <button type="button" className="btn btn-ghost h-9 min-h-0 shrink-0 text-[13px]" onClick={() => setPicked(null)}>
                  {w.change}
                </button>
              </div>
            ) : (
              <>
                <label className="relative">
                  <span className="sr-only">{w.search}</span>
                  <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <input ref={firstRef} className="field pl-10" type="search" value={q} placeholder={w.search} onChange={(e) => setQ(e.target.value)} />
                </label>
                {results && results.length > 0 && (
                  <ul className="grid gap-1 rounded-[16px] border border-line bg-surface p-1.5">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => setPicked(r)} className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left hover:bg-surface-2">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{r.name}</span>
                            <span className="block truncate text-[13px] text-muted">{[r.phone, r.email, r.company?.name].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="shrink-0 text-[12px] text-muted">{r.jobs === 1 ? c.customers.job : fmt(c.customers.jobs, { n: r.jobs })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {results && results.length === 0 && <p className="text-[13px] text-muted">{w.noMatch}</p>}

                <div className="mt-1 grid gap-3 rounded-[16px] border border-dashed border-line p-4">
                  <p className="text-[14px] font-bold">{w.newCustomer}</p>
                  <Field label={w.name}>{(p) => <input {...p} className="field" autoComplete="off" maxLength={80} value={fresh.name} onChange={(e) => set('name', e.target.value)} />}</Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={w.phone}>{(p) => <input {...p} className="field" type="tel" inputMode="tel" maxLength={20} value={fresh.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={(fresh.phone.trim() !== '' && !PHONE.test(fresh.phone.trim())) || undefined} />}</Field>
                    <Field label={w.email}>{(p) => <input {...p} className="field" type="email" maxLength={160} value={fresh.email} onChange={(e) => set('email', e.target.value)} aria-invalid={(fresh.email.trim() !== '' && !EMAIL.test(fresh.email.trim())) || undefined} />}</Field>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[14px] font-semibold">{w.preferred}</p>
                    <div role="radiogroup" aria-label={w.preferred} className="flex flex-wrap gap-1.5">
                      {CHANNELS.map((ch) => (
                        <button
                          key={ch}
                          type="button"
                          role="radio"
                          aria-checked={fresh.preferred === ch}
                          onClick={() => set('preferred', ch)}
                          className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${fresh.preferred === ch ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-ink hover:text-ink'}`}
                        >
                          {c.channelNames[ch]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-[14px]">
                    <input type="checkbox" className="size-5 accent-[var(--gold)]" checked={fresh.isCompany} onChange={(e) => set('isCompany', e.target.checked)} />
                    {w.company}
                  </label>
                  {fresh.isCompany && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label={w.companyName}>{(p) => <input {...p} className="field" maxLength={120} value={fresh.companyName} onChange={(e) => set('companyName', e.target.value)} />}</Field>
                      <Field label={w.cui}>{(p) => <input {...p} className="field" maxLength={20} value={fresh.cui} onChange={(e) => set('cui', e.target.value)} />}</Field>
                      <Field label={w.regCom}>{(p) => <input {...p} className="field" maxLength={30} value={fresh.regCom} onChange={(e) => set('regCom', e.target.value)} />}</Field>
                    </div>
                  )}
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{w.device}</legend>
            <Field label={c.intake.deviceType}>
              {(p) => (
                <div className="grid gap-2">
                  <input {...p} className="field" maxLength={60} value={device.deviceType} onChange={(e) => setDevice({ ...device, deviceType: e.target.value })} />
                  <div className="flex flex-wrap gap-1.5">
                    {c.intake.presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDevice({ ...device, deviceType: preset })}
                        className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${device.deviceType === preset ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-ink hover:text-ink'}`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={w.brand}>{(p) => <input {...p} className="field" maxLength={60} value={device.brand} onChange={(e) => setDevice({ ...device, brand: e.target.value })} />}</Field>
              <Field label={w.model}>{(p) => <input {...p} className="field" maxLength={60} value={device.model} onChange={(e) => setDevice({ ...device, model: e.target.value })} />}</Field>
              <Field label={c.intake.serial}>{(p) => <input {...p} className="field font-mono" maxLength={80} spellCheck={false} value={device.serial} onChange={(e) => setDevice({ ...device, serial: e.target.value })} />}</Field>
            </div>
            <Field label={c.intake.accessories}>{(p) => <input {...p} className="field" maxLength={300} placeholder={c.intake.accessoriesPlaceholder} value={device.accessories} onChange={(e) => setDevice({ ...device, accessories: e.target.value })} />}</Field>
            <Field label={c.intake.appearance}>{(p) => <input {...p} className="field" maxLength={600} placeholder={c.intake.appearancePlaceholder} value={device.appearance} onChange={(e) => setDevice({ ...device, appearance: e.target.value })} />}</Field>
            <Field label={w.issue}>{(p) => <textarea {...p} className="field min-h-24" maxLength={1500} placeholder={w.issuePlaceholder} value={issue} onChange={(e) => setIssue(e.target.value)} />}</Field>
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <Field label={w.from}>{(p) => <input {...p} className="field" type="number" inputMode="numeric" min={0} step={1} value={estimate.from} onChange={(e) => setEstimate({ ...estimate, from: e.target.value })} />}</Field>
              <Field label={w.to}>{(p) => <input {...p} className="field" type="number" inputMode="numeric" min={0} step={1} value={estimate.to} onChange={(e) => setEstimate({ ...estimate, to: e.target.value })} aria-invalid={!estimateValid || undefined} />}</Field>
            </div>
            <p className="-mt-1 text-[13px] text-muted">{w.estimateHint}</p>
          </fieldset>
        </div>

        <footer className="grid gap-3 border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
          {!picked && !fresh.name.trim() ? null : customerEmail ? (
            <label className="flex items-center gap-3 text-[15px]">
              <input type="checkbox" className="size-5 accent-[var(--gold)]" checked={email} onChange={(e) => setEmail(e.target.checked)} />
              {c.intake.emailSheet}
            </label>
          ) : (
            <p className="text-[13px] text-muted">{c.intake.noEmail}</p>
          )}
          {error && (
            <Notice tone="error">
              {error}
              {conflict && (
                <button type="button" className="ml-2 font-semibold underline underline-offset-4" onClick={() => void pickExisting(conflict)}>
                  {w.useExisting}
                </button>
              )}
            </Notice>
          )}
          <button type="submit" className="btn btn-gold" disabled={saving} aria-busy={saving}>
            {w.create}
          </button>
        </footer>
      </form>
    </div>
  )
}

