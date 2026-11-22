import { z } from 'zod'
import type { Db } from 'mongodb'
import { PICKUP_DEFAULTS, type PickupRates } from '../../src/lib/pickup.ts'
import { LABOUR_DEFAULTS, type LabourRates } from '../../src/lib/pricing.ts'

/** Shown on the header of every document the shop prints. */
export type CompanyDetails = {
  name: string
  cui: string
  regCom: string
  address: string
  phone: string
  email: string
  iban: string
  bank: string
}

export const WARRANTY_CATEGORIES = ['laptop', 'pc', 'board', 'coffee', 'appliance', 'it', 'vintage', 'auto', 'custom'] as const
export type WarrantyCategory = (typeof WARRANTY_CATEGORIES)[number]

export type DocumentSettings = {
  /** Printed under the service sheet the customer signs at hand-in. */
  intakeTerms: string
  /** Printed on every warranty certificate. */
  warrantyTerms: string
  /** Default warranty length per kind of job, in months. 0 means no warranty by default. */
  warrantyMonths: Record<WarrantyCategory, number>
}

export type Settings = {
  pickup: PickupRates
  labour: LabourRates
  company: CompanyDetails
  documents: DocumentSettings
  updatedAt: string | null
}

export const COMPANY_DEFAULTS: CompanyDetails = { name: 'Norgelis Tech', cui: '', regCom: '', address: 'Iași', phone: '', email: '', iban: '', bank: '' }

// Draft terms written for this shop. They have not been checked by a lawyer yet; the owner
// can change them in Settings, and should have them reviewed before relying on them.
export const DOCUMENT_DEFAULTS: DocumentSettings = {
  intakeTerms: [
    'Prețul din estimare este orientativ. Dacă diagnosticul arată că reparația costă mai mult, vă sunăm și nu continuăm fără acordul dumneavoastră.',
    'Dacă renunțați la reparație după diagnostic, plătiți doar diagnosticul, la tariful afișat pe site.',
    'Datele de pe aparat rămân ale dumneavoastră. Vă rugăm să faceți o copie de siguranță înainte de predare. Nu răspundem pentru pierderea datelor la defecte de stocare.',
    'Vă anunțăm când aparatul este gata. Aparatele neridicate în 30 de zile de la anunț pot fi păstrate contra unei taxe de depozitare.',
    'Aparatul se ridică pe baza acestei fișe sau a codului de programare.',
  ].join('\n'),
  warrantyTerms: [
    'Garanția acoperă lucrarea descrisă mai sus și piesele montate de noi, pe perioada indicată.',
    'Garanția nu acoperă: urme de lovire, lichide, supratensiune, intervenții ale altor persoane, uzura normală și defecte fără legătură cu lucrarea noastră.',
    'Pentru o reclamație în garanție aduceți aparatul împreună cu acest certificat. Verificăm aparatul și, dacă defectul ține de lucrarea noastră, îl reparăm fără cost.',
    'Garanția nu vă afectează drepturile de consumator prevăzute de lege.',
  ].join('\n'),
  warrantyMonths: { laptop: 6, pc: 6, board: 3, coffee: 3, appliance: 3, it: 1, vintage: 3, auto: 3, custom: 3 },
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

const line = (max: number) => z.string().trim().max(max)

export const companySchema = z.object({
  name: line(120).min(1),
  cui: line(20),
  regCom: line(30),
  address: line(200),
  phone: line(30),
  email: z.union([z.email().max(160), z.literal('')]),
  iban: line(34).regex(/^$|^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/i, 'Not an IBAN'),
  bank: line(80),
})

const monthsSchema = z.number().int().min(0).max(60)
export const documentsSchema = z.object({
  intakeTerms: z.string().trim().max(3000),
  warrantyTerms: z.string().trim().max(3000),
  warrantyMonths: z.object(Object.fromEntries(WARRANTY_CATEGORIES.map((c) => [c, monthsSchema])) as Record<WarrantyCategory, typeof monthsSchema>),
})

export const fullSettingsSchema = z.object({ pickup: pickupSchema, labour: labourSchema, company: companySchema, documents: documentsSchema })

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
    company: companySchema.partial().strict().optional(),
    documents: z
      .object({
        intakeTerms: documentsSchema.shape.intakeTerms,
        warrantyTerms: documentsSchema.shape.warrantyTerms,
        warrantyMonths: documentsSchema.shape.warrantyMonths.partial().strict(),
      })
      .partial()
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
  const collection = db.collection<{ _id: string; pickup?: Partial<PickupRates>; labour?: LabourRates; company?: Partial<CompanyDetails>; documents?: Partial<DocumentSettings>; updatedAt?: string }>(COLLECTION)
  let cached: { at: number; value: Settings } | null = null

  function defaults(): Settings {
    return {
      pickup: { ...pickupBase },
      labour: { valueRate: { ...LABOUR_DEFAULTS.valueRate }, consumablesFactor: { ...LABOUR_DEFAULTS.consumablesFactor } },
      company: { ...COMPANY_DEFAULTS },
      documents: { ...DOCUMENT_DEFAULTS, warrantyMonths: { ...DOCUMENT_DEFAULTS.warrantyMonths } },
      updatedAt: null,
    }
  }

  async function load(): Promise<Settings> {
    const base = defaults()
    const doc = await collection.findOne({ _id: DOC_ID })
    if (!doc) return base
    const pickup = pickupSchema.partial().safeParse(doc.pickup ?? {})
    const labour = labourSchema.safeParse(doc.labour)
    const company = companySchema.partial().safeParse(doc.company ?? {})
    const documents = documentsSchema.omit({ warrantyMonths: true }).partial().safeParse(doc.documents ?? {})
    const months = documentsSchema.shape.warrantyMonths.partial().safeParse(doc.documents?.warrantyMonths ?? {})
    return {
      pickup: { ...base.pickup, ...(pickup.success ? pickup.data : {}) },
      labour: labour.success ? (labour.data as LabourRates) : base.labour,
      company: { ...base.company, ...(company.success ? company.data : {}) },
      documents: {
        ...base.documents,
        ...(documents.success ? documents.data : {}),
        warrantyMonths: { ...base.documents.warrantyMonths, ...(months.success ? months.data : {}) },
      },
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
        company: { ...before.company, ...parsed.data.company },
        documents: {
          ...before.documents,
          ...parsed.data.documents,
          warrantyMonths: { ...before.documents.warrantyMonths, ...parsed.data.documents?.warrantyMonths },
        },
      }
      const full = fullSettingsSchema.safeParse(merged)
      if (!full.success) {
        return { ok: false, issues: full.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) }
      }
      const updatedAt = new Date().toISOString()
      await collection.replaceOne(
        { _id: DOC_ID },
        { pickup: full.data.pickup, labour: full.data.labour, company: full.data.company, documents: full.data.documents, updatedAt },
        { upsert: true },
      )
      cached = null
      const settings: Settings = {
        pickup: full.data.pickup as PickupRates,
        labour: full.data.labour as LabourRates,
        company: full.data.company as CompanyDetails,
        documents: full.data.documents as DocumentSettings,
        updatedAt,
      }
      return { ok: true, settings, before }
    },
  }
}
