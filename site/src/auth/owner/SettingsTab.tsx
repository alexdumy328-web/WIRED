import { useEffect, useState, type FormEvent } from 'react'
import { fmt, useI18n } from '../../i18n'
import type { Dict } from '../../i18n/dict'
import { api } from '../api'
import { Card, Field, Loading, Notice } from '../ui'
import type { SettingsData } from './types'

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

export function SettingsTab() {
  const { t } = useI18n()
  const s = t.owner.settings
  const [values, setValues] = useState<Record<string, string> | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let live = true
    void api<SettingsData>('/api/admin/settings').then((result) => {
      if (!live) return
      if (result.ok) setValues(Object.fromEntries(SPECS.map((spec) => [spec.key, String(read(result.data, spec))])))
      else setLoadError(true)
    })
    return () => {
      live = false
    }
  }, [])

  if (loadError) return <Notice tone="error">{s.error}</Notice>
  if (!values) return <Loading label={t.account.loading} />

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
      <p className="max-w-[62ch] text-pretty text-muted">{s.lead}</p>
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
