import { ObjectId, type Collection, type Db, type Filter, type Sort } from 'mongodb'
import type { Warranty, WarrantyState } from '../../src/types.ts'
import type { Counters } from './counters.ts'
import { addDays, addMonthsClamped, localDate, localYear } from './time.ts'

type WarrantyDoc = Omit<Warranty, 'id'> & { _id: ObjectId }

/** Days before the end when a warranty shows as "expiring soon". */
export const EXPIRING_DAYS = 30

export function warrantyState(w: Pick<Warranty, 'endsOn' | 'voided'>, today: string): WarrantyState {
  if (w.voided) return 'void'
  if (w.endsOn < today) return 'expired'
  if (w.endsOn <= addDays(today, EXPIRING_DAYS)) return 'expiring'
  return 'active'
}

export type WarrantyView = Warranty & { state: WarrantyState }

function view(doc: WarrantyDoc, today = localDate(new Date())): WarrantyView {
  const { _id, ...rest } = doc
  return { ...rest, id: _id.toHexString(), state: warrantyState(rest, today) }
}

export class WarrantyExistsError extends Error {
  readonly existingId: string
  constructor(existingId: string) {
    super('warranty_exists')
    this.name = 'WarrantyExistsError'
    this.existingId = existingId
  }
}

/**
 * Warranty certificates. Numbered G1/2026, G2/2026... per calendar year. A certificate runs
 * from the day it is issued for whole calendar months and ends on the same day of the month,
 * clamped to the month's last day. A booking holds at most one certificate that is not void.
 */
export function createWarranties(db: Db, counters: Counters) {
  const col: Collection<WarrantyDoc> = db.collection<WarrantyDoc>('warranties')
  let indexed: Promise<unknown> | null = null
  const ensureIndexes = () => {
    indexed ??= Promise.all([
      col.createIndex({ bookingCode: 1 }, { name: 'booking_one_valid', unique: true, partialFilterExpression: { voided: { $exists: false } } }),
      col.createIndex({ customerId: 1 }, { name: 'customerId', partialFilterExpression: { customerId: { $type: 'string' } } }),
      col.createIndex({ year: -1, number: -1 }, { name: 'number' }),
      col.createIndex({ endsOn: 1 }, { name: 'endsOn' }),
    ]).catch(() => undefined)
    return indexed
  }
  const idOf = (id: string) => (ObjectId.isValid(id) && id.length === 24 ? new ObjectId(id) : null)

  return {
    async issue(input: {
      bookingCode: string
      sheet?: string
      customerId?: string
      customerName: string
      device: string
      work: string
      months: number
      issuedBy: string
      now?: Date
    }): Promise<WarrantyView> {
      await ensureIndexes()
      const existing = await col.findOne({ bookingCode: input.bookingCode, voided: { $exists: false } })
      if (existing) throw new WarrantyExistsError(existing._id.toHexString())
      const now = input.now ?? new Date()
      const year = localYear(now)
      const number = await counters.next('warranty', year)
      const startsOn = localDate(now)
      const { now: _n, ...rest } = input
      const doc: WarrantyDoc = {
        _id: new ObjectId(),
        ...rest,
        label: `G${number}/${year}`,
        number,
        year,
        startsOn,
        // Civil Code art. 2552: a term in months ends on the matching day of the last month, or on
        // that month's last day when it has no such day. 31 Aug + 6 months ends on 28 Feb.
        endsOn: addMonthsClamped(startsOn, input.months),
        issuedAt: now.toISOString(),
      }
      try {
        await col.insertOne(doc)
      } catch (error) {
        const again = await col.findOne({ bookingCode: input.bookingCode, voided: { $exists: false } })
        if (again) throw new WarrantyExistsError(again._id.toHexString())
        throw error
      }
      return view(doc)
    },

    async get(id: string): Promise<WarrantyView | null> {
      const _id = idOf(id)
      const doc = _id ? await col.findOne({ _id }) : null
      return doc ? view(doc) : null
    },

    async forBooking(code: string): Promise<WarrantyView[]> {
      const docs = await col.find({ bookingCode: code }).sort({ issuedAt: -1 }).toArray()
      return docs.map((d) => view(d))
    },

    async forBookings(codes: string[]): Promise<WarrantyView[]> {
      if (!codes.length) return []
      const docs = await col.find({ bookingCode: { $in: codes }, voided: { $exists: false } }).toArray()
      return docs.map((d) => view(d))
    },

    async forCustomer(customerId: string): Promise<WarrantyView[]> {
      const docs = await col.find({ customerId }).sort({ issuedAt: -1 }).limit(200).toArray()
      return docs.map((d) => view(d))
    },

    /** `valid` is everything still running, expiring ones included. */
    async search(query: { q?: string; state?: 'valid' | 'expiring' | 'expired' | 'void'; limit: number; skip: number }) {
      await ensureIndexes()
      const today = localDate(new Date())
      const soon = addDays(today, EXPIRING_DAYS)
      const filter: Filter<WarrantyDoc> = {}
      if (query.state === 'void') filter.voided = { $exists: true }
      else if (query.state) {
        filter.voided = { $exists: false }
        if (query.state === 'valid') filter.endsOn = { $gte: today }
        if (query.state === 'expiring') filter.endsOn = { $gte: today, $lte: soon }
        if (query.state === 'expired') filter.endsOn = { $lt: today }
      }
      const q = query.q?.trim()
      if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
        filter.$or = [{ label: rx }, { customerName: rx }, { device: rx }, { bookingCode: rx }, { sheet: rx }]
      }
      const sort: Sort = query.state === 'expiring' ? { endsOn: 1 } : { issuedAt: -1 }
      const [docs, total] = await Promise.all([col.find(filter).sort(sort).skip(query.skip).limit(query.limit).toArray(), col.countDocuments(filter)])
      return { total, items: docs.map((d) => view(d, today)) }
    },

    async void(id: string, by: string, reason: string): Promise<WarrantyView | null> {
      const _id = idOf(id)
      if (!_id) return null
      const after = await col.findOneAndUpdate({ _id, voided: { $exists: false } }, { $set: { voided: { at: new Date().toISOString(), by, reason } } }, { returnDocument: 'after' })
      return after ? view(after) : null
    },

    /** Counts for the dashboard: running now, and running out within EXPIRING_DAYS. */
    async counts() {
      const today = localDate(new Date())
      const [valid, expiring] = await Promise.all([
        col.countDocuments({ voided: { $exists: false }, endsOn: { $gte: today } }),
        col.countDocuments({ voided: { $exists: false }, endsOn: { $gte: today, $lte: addDays(today, EXPIRING_DAYS) } }),
      ])
      return { valid, expiring }
    },
  }
}

export type Warranties = ReturnType<typeof createWarranties>
