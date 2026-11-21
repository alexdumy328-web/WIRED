import type { Booking, BookingStatus, StatusEntry } from '../../types'

export type OwnerBooking = Booking & {
  statusHistory: StatusEntry[]
  mapLink?: string
  /** Only on the answer to a save: whether the customer was emailed about the new status. */
  notified?: 'sent' | 'failed' | 'skipped'
}

export type PickupJob = {
  code: string
  status: BookingStatus
  slot: string
  window: { from: string; to: string }
  trips: 'both' | 'pickup' | 'dropoff'
  urgent: boolean
  address: string
  lat: number
  lon: number
  mapLink: string
  name: string
  phone: string
  device: string
  quoteLei: number
}

export type CalendarSlot = { slot: string; code: string; mode: 'shop' | 'mobile'; status: BookingStatus; name: string; device: string; pickup: boolean }
export type CalendarWeek = { weekStart: string; days: { date: string; slots: CalendarSlot[] }[] }

export type TrendPoint = { start: string; created: number; done: number; bookedLei: number; doneLei: number; transportLei: number }

export type Stats = {
  weeks: { weekStart: string; count: number }[]
  /** Missing when an older API answers (deploy in progress): the charts then show as empty. */
  trend?: { weekly: TrendPoint[]; monthly: TrendPoint[] }
  byCategory: Record<string, number>
  byStatus: Record<string, number>
  total: number
  active: number
  revenue: { doneLei: number; pipelineLei: number }
}

export type SettingsData = {
  pickup: Record<'dieselLeiPerL' | 'consumptionLPer100' | 'driverLeiPerHour' | 'stopMinutes' | 'minTripLei' | 'urgentFactor' | 'maxKm', number>
  labour: {
    valueRate: Record<'low' | 'mid' | 'high' | 'premium', number>
    consumablesFactor: Record<'low' | 'medium' | 'high', number>
  }
  company: CompanyDetails
  documents: { intakeTerms: string; warrantyTerms: string; warrantyMonths: Record<WarrantyCategory, number> }
  updatedAt: string | null
}

export const COMPANY_FIELDS = ['name', 'cui', 'regCom', 'address', 'phone', 'email', 'iban', 'bank'] as const
export type CompanyDetails = Record<(typeof COMPANY_FIELDS)[number], string>
export const WARRANTY_CATEGORIES = ['laptop', 'pc', 'board', 'coffee', 'appliance', 'it', 'vintage', 'auto', 'custom'] as const
export type WarrantyCategory = (typeof WARRANTY_CATEGORIES)[number]

/** YYYY-MM-DD in the shop's time zone. */
export function shopDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
