/**
 * Pricing rules shared by the site and the API (server imports this file directly).
 * Keep it dependency-free and erasable TypeScript only.
 *
 * Labour is billed per hour, 100–250 lei/h. The rate depends on how fine the work is
 * and on what the device is worth now. Consumables (flux, solder, wick, IPA, paste,
 * cleaning agents) are added on top of labour as a factor. Parts are always separate.
 */

/** What the device is worth today, as the customer tells us. */
export const VALUE_TIERS = ['low', 'mid', 'high', 'premium'] as const
export type ValueTier = (typeof VALUE_TIERS)[number]

/** Upper bound of each tier in lei (the last tier is open-ended). */
export const VALUE_TIER_MAX: Record<ValueTier, number | null> = { low: 500, mid: 1500, high: 4000, premium: null }

/** Hourly labour rate per value tier, lei/h. */
export const VALUE_RATE: Record<ValueTier, number> = { low: 100, mid: 150, high: 200, premium: 250 }

export const RATE_MIN = 100
export const RATE_MAX = 250

/**
 * How fine the work is. Micro work (component swaps on laptop/console boards,
 * BGA, micro-soldering under the microscope) is always billed at the top rate.
 */
export const FINENESS = ['standard', 'fine', 'micro'] as const
export type Fineness = (typeof FINENESS)[number]

/** Consumables load: factor applied to labour. */
export const CONSUMABLES = ['low', 'medium', 'high'] as const
export type Consumables = (typeof CONSUMABLES)[number]
export const CONSUMABLES_FACTOR: Record<Consumables, number> = { low: 1.1, medium: 1.2, high: 1.35 }

/** Labour rates that the API can override from its settings document. */
export type LabourRates = { valueRate: Record<ValueTier, number>; consumablesFactor: Record<Consumables, number> }
export const LABOUR_DEFAULTS: LabourRates = { valueRate: VALUE_RATE, consumablesFactor: CONSUMABLES_FACTOR }

/** Labour rate range in lei/h for a job, given its fineness and (optionally) the device value. */
export function rateFor(fineness: Fineness, tier?: ValueTier | null, rates: LabourRates = LABOUR_DEFAULTS): [number, number] {
  const { low, mid, premium } = rates.valueRate
  if (fineness === 'micro') return [premium, premium]
  if (tier) {
    const r = rates.valueRate[tier]
    // Fine work never drops below the mid-tier rate (150 lei/h by default).
    return fineness === 'fine' ? [Math.max(r, mid), Math.max(r, mid)] : [r, r]
  }
  return fineness === 'fine' ? [mid, premium] : [low, premium]
}

const round10 = (n: number) => Math.round(n / 10) * 10

/** Labour + consumables in lei for an hours range. Parts are not included. */
export function labourPrice(hours: [number, number], fineness: Fineness, consumables: Consumables, tier?: ValueTier | null, rates: LabourRates = LABOUR_DEFAULTS): [number, number] {
  const [rLo, rHi] = rateFor(fineness, tier, rates)
  const f = rates.consumablesFactor[consumables]
  return [round10(hours[0] * rLo * f), round10(hours[1] * rHi * f)]
}
