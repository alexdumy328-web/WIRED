import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { fmt, useI18n } from '../../i18n'
import type { ContactChannel, Customer } from '../../types'
import { api } from '../api'
import { Field, Notice, StatusBadge, useDateFormat } from '../ui'
import { PlusIcon, SearchIcon } from './icons'
import { Initials } from './TodayTab'
import { useWorkshopCopy } from './workshop/copy'
import { dayLabel, pdfUrl, sheetLabel, type CustomerDetail, type CustomerSummary } from './workshop/model'
import { ContactButtons, SectionTitle, WarrantyStateBadge } from './workshop/parts'

const PAGE = 40
const CHANNELS: ContactChannel[] = ['phone', 'whatsapp', 'sms', 'email']

/** The customer list: who they are, how they like to be reached, every job and warranty. */
export function CustomersTab({
  selected,
  onSelect,
  onOpen,
  onNewSheet,
  manager,
  version,
}: {
  selected: string | null
  onSelect: (id: string | null) => void
  onOpen: (code: string) => void
  onNewSheet: (customer: Customer) => void
  manager: boolean
  version: number
}) {
  const c = useWorkshopCopy()
  const { lang } = useI18n()
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [items, setItems] = useState<CustomerSummary[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(false)
  const [bump, setBump] = useState(0)
  const seq = useRef(0)

  const url = useCallback(
    (skip: number) => `/api/admin/customers?limit=${PAGE}&skip=${skip}${archived ? '&archived=yes' : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`,
    [q, archived],
  )

  useEffect(() => {
    const mine = ++seq.current
    const timer = setTimeout(
      () => {
        void api<{ total: number; items: CustomerSummary[] }>(url(0)).then((r) => {
          if (mine !== seq.current) return
          if (!r.ok) return setError(true)
          setError(false)
          setItems(r.data.items)
          setTotal(r.data.total)
        })
      },
      q ? 250 : 0,
    )
    return () => clearTimeout(timer)
  }, [url, q, version, bump])

  const more = async () => {
    const r = await api<{ items: CustomerSummary[] }>(url(items?.length ?? 0))
    if (r.ok) setItems((cur) => [...(cur ?? []), ...r.data.items])
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section className={`min-w-0 ${selected ? 'hidden lg:block' : ''}`} aria-label={c.tabs.customers}>
        <div className="grid gap-2">
          <label className="relative">
            <span className="sr-only">{c.customers.search}</span>
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input className="field pl-10" type="search" value={q} maxLength={100} placeholder={c.customers.search} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="flex items-center gap-2.5 px-1 text-[14px] text-muted">
            <input type="checkbox" className="size-4 accent-[var(--gold)]" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            {c.customers.archived}
          </label>
        </div>
        {error && <Notice tone="error">{c.error}</Notice>}
        {!items && !error && (
          <div className="mt-3 grid gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[14px] bg-surface" />
            ))}
          </div>
        )}
        {items?.length === 0 && <p className="mt-3 rounded-[16px] border border-dashed border-line py-12 text-center text-muted">{c.customers.empty}</p>}
        {items && items.length > 0 && (
          <ul className="mt-3 grid gap-1.5">
            {items.map((cu) => {
              const on = cu.id === selected
              return (
                <li key={cu.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(cu.id)}
                    aria-current={on || undefined}
                    className={`flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-colors ${on ? 'border-ink bg-surface' : 'border-transparent hover:border-line hover:bg-surface'}`}
                  >
                    <Initials name={cu.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{cu.name}</span>
                        {cu.open > 0 && <span className="shrink-0 rounded-full bg-gold/14 px-2 text-[12px] font-bold text-gold">{fmt(c.customers.open, { n: cu.open })}</span>}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {[cu.company?.name, cu.phone ?? cu.email, cu.jobs === 1 ? c.customers.job : fmt(c.customers.jobs, { n: cu.jobs })].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {items && items.length < total && (
          <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => void more()}>
            {c.customers.more}
          </button>
        )}
      </section>

      <section className={`min-w-0 ${selected ? '' : 'hidden lg:block'}`}>
        {selected ? (
          <CustomerPanel
            key={selected}
            id={selected}
            lang={lang}
            manager={manager}
            version={version}
            onBack={() => onSelect(null)}
            onOpen={onOpen}
            onNewSheet={onNewSheet}
            onChanged={() => setBump((n) => n + 1)}
          />
        ) : (
          <p className="rounded-[20px] border border-dashed border-line py-20 text-center text-muted">{c.customers.pick}</p>
        )}
      </section>
    </div>
  )
}

function CustomerPanel({
  id,
  lang,
  manager,
  version,
  onBack,
  onOpen,
  onNewSheet,
  onChanged,
}: {
  id: string
  lang: 'ro' | 'en'
  manager: boolean
  version: number
  onBack: () => void
  onOpen: (code: string) => void
  onNewSheet: (customer: Customer) => void
  onChanged: () => void
}) {
  const c = useWorkshopCopy()
  const fmtDate = useDateFormat()
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const r = await api<CustomerDetail>(`/api/admin/customers/${id}`)
    if (r.ok) setData(r.data)
    else setError(true)
  }, [id])

  useEffect(() => {
    void load()
  }, [load, version])

  if (error) return <Notice tone="error">{c.error}</Notice>
  if (!data) return <div className="h-64 animate-pulse rounded-[20px] bg-surface" />
  const cu = data.customer
  const greeting = { subject: 'Norgelis Tech', body: `${fmt(c.message.greet, { name: cu.name.split(/\s+/)[0] ?? '' })}\n\n${c.message.sign}` }

  const archive = async () => {
    const r = await api(`/api/admin/customers/${id}/archive`, { method: 'POST', body: { archived: !cu.archived } })
    if (r.ok) {
      await load()
      onChanged()
    }
  }

  return (
    <div className="grid gap-6">
      <button type="button" onClick={onBack} className="justify-self-start text-[14px] font-semibold text-gold underline-offset-4 hover:underline lg:hidden">
        ← {c.customers.back}
      </button>

      <div className="rounded-[20px] border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="display-2 text-[1.75rem] leading-tight">{cu.name}</h2>
            {cu.company?.name && (
              <p className="mt-1 text-[14px] font-semibold">
                {cu.company.name}
                <span className="font-normal text-muted">{[cu.company.cui && ` · CUI ${cu.company.cui}`, cu.company.regCom && ` · ${cu.company.regCom}`].filter(Boolean).join('')}</span>
              </p>
            )}
            <p className="mt-1 text-[14px] text-muted">{[cu.phone, cu.email].filter(Boolean).join(' · ')}</p>
            {cu.address && <p className="text-[14px] text-muted">{cu.address}</p>}
            {cu.archived && <p className="mt-2 text-[13px] font-semibold text-rose">{c.customers.archivedNote}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-gold h-10 min-h-0 gap-2 text-[14px]" onClick={() => onNewSheet(cu)}>
              <PlusIcon className="size-4" />
              {c.customers.newSheet}
            </button>
            <button type="button" className="btn btn-ghost h-10 min-h-0 text-[14px]" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              {c.customers.edit}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <ContactButtons contact={{ phone: cu.phone, email: cu.email }} preferred={cu.preferred} message={greeting} />
        </div>
        {cu.notes && !editing && <p className="mt-4 whitespace-pre-wrap rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-[14px]">{cu.notes}</p>}
        {editing && (
          <CustomerForm
            customer={cu}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false)
              await load()
              onChanged()
            }}
          />
        )}
      </div>

      <section aria-labelledby="cu-jobs" className="grid gap-3">
        <SectionTitle id="cu-jobs">{c.customers.jobsTitle}</SectionTitle>
        {data.jobs.length === 0 ? (
          <p className="text-[14px] text-muted">{c.customers.noJobs}</p>
        ) : (
          <ul className="grid gap-1.5">
            {data.jobs.map((job) => (
              <li key={job.code}>
                <button type="button" onClick={() => onOpen(job.code)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-muted">
                  <span className="font-mono text-[14px] font-bold">{job.code}</span>
                  {job.intake && <span className="font-mono text-[13px] text-muted">{sheetLabel(job)}</span>}
                  <span className="min-w-0 flex-1 truncate text-[14px]">{[job.intake?.deviceType, job.device.brand, job.device.model].filter(Boolean).join(' ') || job.custom || job.issue}</span>
                  <span className="text-[13px] text-muted">{fmtDate.date(job.intake?.receivedAt ?? job.slot)}</span>
                  <StatusBadge status={job.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.warranties.length > 0 && (
        <section aria-labelledby="cu-warranties" className="grid gap-3">
          <SectionTitle id="cu-warranties">{c.customers.warrantiesTitle}</SectionTitle>
          <ul className="grid gap-1.5">
            {data.warranties.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border border-line bg-surface px-4 py-3">
                <span className="font-mono text-[14px] font-bold">{w.label}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">{w.device}</span>
                <span className="text-[13px] text-muted">{fmt(c.docs.validUntil, { date: dayLabel(w.endsOn, lang) })}</span>
                <WarrantyStateBadge state={w.state} />
                <a className="text-[13px] font-semibold text-gold underline-offset-4 hover:underline" href={pdfUrl.warranty(w.id)} target="_blank" rel="noreferrer">
                  PDF
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {manager && (
        <button type="button" onClick={() => void archive()} className="justify-self-start text-[14px] font-semibold text-muted underline-offset-4 hover:text-ink hover:underline">
          {cu.archived ? c.customers.restore : c.customers.archive}
        </button>
      )}
    </div>
  )
}

function CustomerForm({ customer, onCancel, onSaved }: { customer: Customer; onCancel: () => void; onSaved: () => Promise<void> }) {
  const c = useWorkshopCopy()
  const w = c.walkIn
  const [f, setF] = useState({
    name: customer.name,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    preferred: customer.preferred,
    companyName: customer.company?.name ?? '',
    cui: customer.company?.cui ?? '',
    regCom: customer.company?.regCom ?? '',
    address: customer.address ?? '',
    notes: customer.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await api<Customer>(`/api/admin/customers/${customer.id}`, {
      method: 'PATCH',
      body: {
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim(),
        preferred: f.preferred,
        company: { name: f.companyName.trim(), cui: f.cui.trim(), regCom: f.regCom.trim() },
        address: f.address.trim(),
        notes: f.notes.trim(),
      },
    })
    setBusy(false)
    if (r.ok) return onSaved()
    const issue = (r.data as { issues?: { message: string }[] } | null)?.issues?.[0]?.message
    setError(r.status === 409 ? c.customers.conflict : issue ?? c.error)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-5 grid gap-3 border-t border-line pt-5">
      <Field label={w.name}>{(p) => <input {...p} className="field" required minLength={2} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={w.phone}>{(p) => <input {...p} className="field" type="tel" maxLength={20} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
        <Field label={w.email}>{(p) => <input {...p} className="field" type="email" maxLength={160} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
      </div>
      <div>
        <p className="mb-1.5 text-[14px] font-semibold">{w.preferred}</p>
        <div role="radiogroup" aria-label={w.preferred} className="flex flex-wrap gap-1.5">
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              role="radio"
              aria-checked={f.preferred === ch}
              onClick={() => setF({ ...f, preferred: ch })}
              className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${f.preferred === ch ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-ink hover:text-ink'}`}
            >
              {c.channelNames[ch]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={w.companyName}>{(p) => <input {...p} className="field" maxLength={120} value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />}</Field>
        <Field label={w.cui}>{(p) => <input {...p} className="field" maxLength={20} value={f.cui} onChange={(e) => setF({ ...f, cui: e.target.value })} />}</Field>
        <Field label={w.regCom}>{(p) => <input {...p} className="field" maxLength={30} value={f.regCom} onChange={(e) => setF({ ...f, regCom: e.target.value })} />}</Field>
      </div>
      <Field label={c.customers.address}>{(p) => <input {...p} className="field" maxLength={200} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />}</Field>
      <Field label={c.customers.notes}>{(p) => <textarea {...p} className="field min-h-20" maxLength={2000} placeholder={c.customers.notesPlaceholder} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {c.customers.cancel}
        </button>
        <button type="submit" className="btn btn-gold" disabled={busy} aria-busy={busy}>
          {c.customers.save}
        </button>
      </div>
    </form>
  )
}
