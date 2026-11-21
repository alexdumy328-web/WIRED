import { catalog } from '../../src/data/catalog.ts'
import type { Booking } from '../../src/types.ts'
import type { WarrantyCategory } from '../admin/settings.ts'

const byJob = new Map(catalog.map((job) => [job.id, job.category]))

/** The kind of job, for the default warranty length: the first price-list job, else "custom". */
export function categoryOf(booking: Pick<Booking, 'jobIds'>): WarrantyCategory {
  return byJob.get(booking.jobIds[0] ?? '') ?? 'custom'
}
