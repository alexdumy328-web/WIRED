import type { BookingStatus } from '../../types'

export const BOOKING_STATUSES: BookingStatus[] = ['received', 'diagnosis', 'waiting-parts', 'repairing', 'ready', 'unrepairable', 'done', 'cancelled']

/** Colour per kind of job, used everywhere in the dashboard: gold workshop, green pickup, blue on site. */
export type Kind = 'shop' | 'pickup' | 'mobile'
export const kindOf = (b: { mode: 'shop' | 'mobile'; pickup?: unknown }): Kind => (b.mode === 'mobile' ? 'mobile' : b.pickup ? 'pickup' : 'shop')
export const KIND_TONE: Record<Kind, { dot: string; border: string; chip: string; card: string }> = {
  shop: { dot: 'bg-gold', border: 'border-gold', chip: 'bg-gold/12 text-gold', card: 'border-l-gold bg-gold/12 hover:bg-gold/20' },
  pickup: { dot: 'bg-ok', border: 'border-ok', chip: 'bg-ok/12 text-ok', card: 'border-l-ok bg-ok/12 hover:bg-ok/20' },
  mobile: { dot: 'bg-blue', border: 'border-blue', chip: 'bg-blue/12 text-blue', card: 'border-l-blue bg-blue/12 hover:bg-blue/20' },
}
