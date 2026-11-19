import { z } from 'zod'
import type { Db } from 'mongodb'
import { PICKUP_DEFAULTS, type PickupRates } from '../../src/lib/pickup.ts'
import { LABOUR_DEFAULTS, type LabourRates } from '../../src/lib/pricing.ts'

export type Settings = {
  pickup: PickupRates
  labour: LabourRates
  updatedAt: string | null
}

const num = (min: number, max: number) => z.number().finite().min(min).max(max)

/** Sane bounds for every number the owner can change. */
export const pickupSchema = z.object({
  dieselLeiPerL: num(1, 50),
  consumptionLPer100: num(1, 40),
  driverLeiPerHour: num(0, 300),
  stopMinutes: num(0, 120),
  minTripLei: num(0, 500),
  urgentFactor: num(1, 5),
  maxKm: num(1, 500),
})

export const labourSchema = z
  .object({
    valueRate: z.object({ low: num(20, 1000), mid: num(20, 1000), high: num(20, 1000), premium: num(20, 1000) }),
    consumablesFactor: z.object({ low: num(1, 3), medium: num(1, 3), high: num(1, 3) }),
  })
  .superRefine((value, ctx) => {
    const r = value.valueRate
    if (!(r.low <= r.mid && r.mid <= r.high && r.high <= r.premium)) {
      ctx.addIssue({ code: 'custom', path: ['valueRate'], message: 'Rates must not decrease from low to premium' })
    }
    const f = value.consumablesFactor
    if (!(f.low <= f.medium && f.medium <= f.high)) {
      ctx.addIssue({ code: 'custom', path: ['consumablesFactor'], message: 'Factors must not decrease from low to high' })
    }
  })

export const fullSettingsSchema = z.object({ pickup: pickupSchema, labour: labourSchema })

/** PUT body: any subset of the numbers; the rest keep their current value. */
export const settingsPatchSchema = z
  .object({
    pickup: pickupSchema.partial().strict().optional(),
    labour: z
      .object({
        valueRate: z.object({ low: num(20, 1000), mid: num(20, 1000), high: num(20, 1000), premium: num(20, 1000) }).partial().strict().optional(),
        consumablesFactor: z.object({ low: num(1, 3), medium: num(1, 3), high: num(1, 3) }).partial().strict().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export type SettingsService = {
  /** Current settings: defaults, env overrides, then the stored document. Cached for 30 s. */
  get(): Promise<Settings>
  pickupRates(): Promise<PickupRates>
  labourRates(): Promise<LabourRates>
  /** Validates the merged result; returns issues instead of throwing. */
  update(patch: unknown): Promise<{ ok: true; settings: Settings; before: Settings } | { ok: false; issues: { path: string[]; message: string }[] }>
  /** Read-only numbers for the front end. */
  publicView(): Promise<{ pickup: PickupRates; labour: LabourRates; updatedAt: string | null }>
}

const COLLECTION = 'settings'
const DOC_ID = 'rates'
const CACHE_MS = 30_000

export function createSettingsService(db: Db, pickupBase: PickupRates = { ...PICKUP_DEFAULTS }): SettingsService {
  const collection = db.collection<{ _id: string; pickup?: Partial<PickupRates>; labour?: LabourRates; updatedAt?: string }>(COLLECTION)
  let cached: { at: number; value: Settings } | null = null

  function defaults(): Settings {
    return {
      pickup: { ...pickupBase },
      labour: { valueRate: { ...LABOUR_DEFAULTS.valueRate }, consumablesFactor: { ...LABOUR_DEFAULTS.consumablesFactor } },
      updatedAt: null,
    }
  }

  async function load(): Promise<Settings> {
    const base = defaults()
    const doc = await collection.findOne({ _id: DOC_ID })
    if (!doc) return base
    const pickup = pickupSchema.partial().safeParse(doc.pickup ?? {})
    const labour = labourSchema.safeParse(doc.labour)
    return {
      pickup: { ...base.pickup, ...(pickup.success ? pickup.data : {}) },
      labour: labour.success ? (labour.data as LabourRates) : base.labour,
      updatedAt: doc.updatedAt ?? null,
    }
  }

  async function get(): Promise<Settings> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value
    const value = await load()
    cached = { at: Date.now(), value }
    return value
  }

  return {
    get,
    async pickupRates() {
      return (await get()).pickup
    },
    async labourRates() {
      return (await get()).labour
    },
    async publicView() {
      const { pickup, labour, updatedAt } = await get()
      return { pickup, labour, updatedAt }
    },
    async update(patch) {
      const parsed = settingsPatchSchema.safeParse(patch)
      if (!parsed.success) {
        return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) }
      }
      const before = await load()
      const merged = {
        pickup: { ...before.pickup, ...parsed.data.pickup },
        labour: {
          valueRate: { ...before.labour.valueRate, ...parsed.data.labour?.valueRate },
          consumablesFactor: { ...before.labour.consumablesFactor, ...parsed.data.labour?.consumablesFactor },
        },
      }
      const full = fullSettingsSchema.safeParse(merged)
      if (!full.success) {
        return { ok: false, issues: full.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) }
      }
      const updatedAt = new Date().toISOString()
      await collection.replaceOne({ _id: DOC_ID }, { pickup: full.data.pickup, labour: full.data.labour, updatedAt }, { upsert: true })
      cached = null
      const settings: Settings = { pickup: full.data.pickup as PickupRates, labour: full.data.labour as LabourRates, updatedAt }
      return { ok: true, settings, before }
    },
  }
}
