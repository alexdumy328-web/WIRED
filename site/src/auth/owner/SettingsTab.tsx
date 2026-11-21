import { useEffect, useState, type FormEvent } from 'react'
import { fmt, useI18n } from '../../i18n'
import type { Dict } from '../../i18n/dict'
import { api } from '../api'
import { Card, Field, Loading, Notice } from '../ui'
import { COMPANY_FIELDS, WARRANTY_CATEGORIES, type CompanyDetails, type SettingsData, type WarrantyCategory } from './types'
import { useWorkshopCopy } from './workshop/copy'

type Key = keyof Dict['owner']['settings']['fields']
type Spec = { key: Key; group: 'pickup' | 'labour'; path: [string, string?]; min: number; max: number }

/** Mirrors the server bounds (server/admin/settings.ts) so mistakes show before saving. */
const SPECS: Spec[] = [
  { key: 'dieselLeiPerL', group: 'pickup', path: ['pickup', 'dieselLeiPerL'], min: 1, max: 50 },
  { key: 'consumptionLPer100', group: 'pickup', path: ['pickup', 'consumptionLPer100'], min: 1, max: 40 },
  { key: 'driverLeiPerHour', group: 'pickup', path: ['pickup', 'driverLeiPerHour'], min: 0, max: 300 },
  { key: 'stopMinutes', group: 'pickup', path: ['pickup', 'stopMinutes'], min: 0, max: 120 },
  { key: 'minTripLei', group: 'pickup', path: ['pickup', 'minTripLei'], min: 0, max: 500 },
  { key: 'urgentFactor', group: 'pickup', path: ['pickup', 'urgentFactor'], min: 1, max: 5 },
  { key: 'maxKm', group: 'pickup', path: ['pickup', 'maxKm'], min: 1, max: 500 },
  { key: 'valueLow', group: 'labour', path: ['valueRate', 'low'], min: 20, max: 1000 },
  { key: 'valueMid', group: 'labour', path: ['valueRate', 'mid'], min: 20, max: 1000 },
  { key: 'valueHigh', group: 'labour', path: ['valueRate', 'high'], min: 20, max: 1000 },
  { key: 'valuePremium', group: 'labour', path: ['valueRate', 'premium'], min: 20, max: 1000 },
  { key: 'consumLow', group: 'labour', path: ['consumablesFactor', 'low'], min: 1, max: 3 },
  { key: 'consumMedium', group: 'labour', path: ['consumablesFactor', 'medium'], min: 1, max: 3 },
  { key: 'consumHigh', group: 'labour', path: ['consumablesFactor', 'high'], min: 1, max: 3 },
]

function read(data: SettingsData, spec: Spec): number {
  const [section, name] = spec.path
  if (section === 'pickup') return data.pickup[name as keyof SettingsData['pickup']]
  if (section === 'valueRate') return data.labour.valueRate[name as keyof SettingsData['labour']['valueRate']]
  return data.labour.consumablesFactor[name as keyof SettingsData['labour']['consumablesFactor']]
}

/** Settings: the shop's legal details and documents, then the rates. Each part saves on its own. */
export function SettingsTab() {
  const [data, setData] = useState<SettingsData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const { t } = useI18n()
  useEffect(() => {
    void api<SettingsData>('/api/admin/settings').then((r) => (r.ok ? setData(r.data) : setLoadError(true)))
  }, [])
  if (loadError) return <Notice tone="error">{t.owner.settings.error}</Notice>
  if (!data) return <Loading label={t.account.loading} />
  return (
    <div className="grid gap-10">
      <ShopSettings initial={data} />
      <RatesSettings initial={data} />
    </div>
  )
}

function ShopSettings({ initial }: { initial: SettingsData }) {
  const { t } = useI18n()
  const c = useWorkshopCopy()
  const s = c.settings
  const [company, setCompany] = useState<CompanyDetails>(initial.company)
  const [terms, setTerms] = useState({ intakeTerms: initial.documents.intakeTerms, warrantyTerms: initial.documents.warrantyTerms })
  const [months, setMonths] = useState<Record<WarrantyCategory, string>>(
    Object.fromEntries(WARRANTY_CATEGORIES.map((k) => [k, String(initial.documents.warrantyMonths[k])])) as Record<WarrantyCategory, string>,
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const categoryName = (k: WarrantyCategory) => (k === 'custom' ? s.custom : k === 'auto' ? t.mobile.tabs.auto : t.services.categories[k].name)
  const monthsValid = WARRANTY_CATEGORIES.every((k) => /^\d{1,2}$/.test(months[k].trim()) && Number(months[k]) <= 60)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!monthsValid) return setMessage({ tone: 'error', text: fmt(t.owner.settings.range, { min: 0, max: 60 }) })
    setSaving(true)
    setMessage(null)
    const result = await api<SettingsData>('/api/admin/settings', {
      method: 'PUT',
      body: {
        company: Object.fromEntries(COMPANY_FIELDS.map((k) => [k, company[k].trim()])),
        documents: { ...terms, warrantyMonths: Object.fromEntries(WARRANTY_CATEGORIES.map((k) => [k, Number(months[k])])) },
      },
    })
    setSaving(false)
    const issue = (result.data as { issues?: { path: string[]; message: string }[] } | null)?.issues?.[0]
    setMessage(result.ok ? { tone: 'ok', text: s.saved } : { tone: 'error', text: issue ? `${issue.path.join('.')}: ${issue.message}` : s.error })
  }

  return (
    <form className="grid gap-5" onSubmit={(e) => void submit(e)}>
      <Card>
        <h3 className="text-lg font-bold">{s.company}</h3>
        <p className="mt-1 text-[14px] text-muted">{s.companyLead}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {COMPANY_FIELDS.map((k) => (
            <div key={k} className={k === 'name' || k === 'address' ? 'sm:col-span-2' : ''}>
              <Field label={s.companyFields[k]}>
                {(p) => (
                  <input
                    {...p}
                    className={`field ${k === 'iban' || k === 'cui' ? 'font-mono' : ''}`}
                    type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
                    maxLength={k === 'address' ? 200 : 120}
                    required={k === 'name'}
                    value={company[k]}
                    onChange={(e) => setCompany({ ...company, [k]: e.target.value })}
                  />
                )}
              </Field>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold">{s.documents}</h3>
        <p className="mt-1 text-[14px] text-muted">{s.documentsLead}</p>
        <p className="mt-3 rounded-[12px] border border-gold/50 bg-gold/8 px-3.5 py-2.5 text-[14px]">{s.lawyer}</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {(['intakeTerms', 'warrantyTerms'] as const).map((k) => (
            <Field key={k} label={s[k]}>
              {(p) => <textarea {...p} className="field min-h-56 text-[14px] leading-relaxed" maxLength={3000} value={terms[k]} onChange={(e) => setTerms({ ...terms, [k]: e.target.value })} />}
            </Field>
          ))}
        </div>
        <h4 className="mt-6 font-bold">{s.months}</h4>
        <p className="mt-1 text-[14px] text-muted">{s.monthsLead}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {WARRANTY_CATEGORIES.map((k) => (
            <Field key={k} label={categoryName(k)}>
              {(p) => <input {...p} className="field" inputMode="numeric" value={months[k]} onChange={(e) => setMonths({ ...months, [k]: e.target.value })} aria-invalid={!/^\d{1,2}$/.test(months[k].trim()) || Number(months[k]) > 60 || undefined} />}
            </Field>
          ))}
        </div>
      </Card>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div>
        <button type="submit" className="btn btn-gold" disabled={saving} aria-busy={saving}>
          {s.save}
        </button>
      </div>
    </form>
  )
}

function RatesSettings({ initial }: { initial: SettingsData }) {
  const { t } = useI18n()
  const c = useWorkshopCopy()
  const s = t.owner.settings
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(SPECS.map((spec) => [spec.key, String(read(initial, spec))])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    const found: Record<string, string> = {}
    const numbers: Record<string, number> = {}
    for (const spec of SPECS) {
      const raw = (values[spec.key] ?? '').trim().replace(',', '.')
      const n = raw === '' ? NaN : Number(raw)
      numbers[spec.key] = n
      if (!Number.isFinite(n) || n < spec.min || n > spec.max) found[spec.key] = fmt(s.range, { min: spec.min, max: spec.max })
    }
    const ordered = (keys: Key[]) => keys.every((k, i) => i === 0 || numbers[k]! >= numbers[keys[i - 1]!]!)
    const orderOk = ordered(['valueLow', 'valueMid', 'valueHigh', 'valuePremium']) && ordered(['consumLow', 'consumMedium', 'consumHigh'])
    setErrors(found)
    if (Object.keys(found).length > 0 || !orderOk) {
      setMessage({ tone: 'error', text: Object.keys(found).length > 0 ? s.invalid : s.order })
      return
    }
    setSaving(true)
    const result = await api<SettingsData>('/api/admin/settings', {
      method: 'PUT',
      body: {
        pickup: Object.fromEntries(SPECS.filter((x) => x.group === 'pickup').map((x) => [x.path[1], numbers[x.key]])),
        labour: {
          valueRate: Object.fromEntries(SPECS.filter((x) => x.path[0] === 'valueRate').map((x) => [x.path[1], numbers[x.key]])),
          consumablesFactor: Object.fromEntries(SPECS.filter((x) => x.path[0] === 'consumablesFactor').map((x) => [x.path[1], numbers[x.key]])),
        },
      },
    })
    setSaving(false)
    setMessage(result.ok ? { tone: 'ok', text: s.saved } : { tone: 'error', text: result.status === 400 ? s.invalid : s.error })
  }

  const group = (name: 'pickup' | 'labour', title: string) => (
    <Card>
      <h3 className="text-lg font-bold">{title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {SPECS.filter((spec) => spec.group === name).map((spec) => (
          <Field key={spec.key} label={s.fields[spec.key]} error={errors[spec.key]} hint={fmt(s.range, { min: spec.min, max: spec.max })}>
            {(p) => (
              <input
                {...p}
                className="field"
                inputMode="decimal"
                value={values[spec.key]}
                onChange={(e) => setValues({ ...values, [spec.key]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
    </Card>
  )

  return (
    <form className="grid gap-5" onSubmit={(e) => void submit(e)} noValidate>
      <div>
        <h3 className="display-2 text-2xl">{c.settings.rates}</h3>
        <p className="mt-1 max-w-[62ch] text-pretty text-muted">{s.lead}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {group('pickup', s.pickup)}
        {group('labour', s.labour)}
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div>
        <button type="submit" className="btn btn-gold" disabled={saving} aria-busy={saving}>
          {s.save}
        </button>
      </div>
    </form>
  )
}
