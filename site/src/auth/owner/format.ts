import { fmt } from '../../i18n'

/** "150–200 lei", "150 lei", or "after diagnosis" when the job has no list price (custom requests). */
export function estimateText(e: { priceFrom: number; priceTo: number }, d: { estimate: string; final: string; noEstimate: string }): string {
  if (e.priceTo <= 0) return d.noEstimate
  if (e.priceFrom === e.priceTo) return fmt(d.final, { n: e.priceFrom })
  return fmt(d.estimate, { from: e.priceFrom, to: e.priceTo })
}
