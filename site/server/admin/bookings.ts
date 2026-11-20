import type { Collection, Db, Filter } from 'mongodb'
import { catalog } from '../../src/data/catalog.ts'
import type { Booking, BookingStatus, StatusEntry } from '../../src/types.ts'
import { ACTIVE_STATUSES, COLLECTION_NAME } from '../store.ts'
import { addDays, localDate, mondayOf, startOfLocalDay } from './time.ts'

type Doc = Booking & { _id?: unknown }

const categoryOf = new Map(catalog.map((job) => [job.id, job.category]))
const CI = { locale: 'en', strength: 2 } as const

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function strip(doc: Doc): Booking {
  const { _id: _ignored, ...rest } = doc
  return rest as Booking
}

const mapLink = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`

/** What the owner sees: everything, plus a map link for pickups. */
export type TrendPoint = { start: string; created: number; done: number; bookedLei: number; doneLei: number; transportLei: number }

/** First day (YYYY-MM-DD) of the month `n` months from the month of `date`. */
function addMonths(date: string, n: number): string {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** The point whose period holds the shop-local day (points are sorted, each runs until the next starts). */
function bucketOf(series: TrendPoint[], day: string): TrendPoint | undefined {
  if (day < series[0]!.start) return undefined
  for (let i = series.length - 1; i >= 0; i -= 1) if (day >= series[i]!.start) return series[i]
  return undefined
}

export function ownerView(doc: Doc) {
  const booking = strip(doc)
  return {
    ...booking,
    statusHistory: booking.statusHistory ?? [{ status: 'received' as BookingStatus, at: booking.createdAt, by: 'customer' }],
    ...(booking.pickup ? { mapLink: mapLink(booking.pickup.lat, booking.pickup.lon) } : {}),
  }
}

/** What the customer sees of their own booking: no internal notes, no user ids. */
export function customerView(doc: Doc) {
  const { userId: _u, statusHistory, ...rest } = strip(doc)
  const history = statusHistory ?? [{ status: 'received' as BookingStatus, at: rest.createdAt, by: 'customer' }]
  return {
    ...rest,
    timeline: history.map((entry) => ({ status: entry.status, at: entry.at })),
  }
}

export type SearchQuery = {
  status?: BookingStatus
  mode?: 'shop' | 'mobile'
  /** YYYY-MM-DD, shop-local, inclusive. */
  from?: string
  to?: string
  q?: string
  limit: number
  skip: number
}

export type BookingAdmin = ReturnType<typeof createBookingAdmin>

export function createBookingAdmin(db: Db) {
  const col: Collection<Doc> = db.collection<Doc>(COLLECTION_NAME)
  let indexed: Promise<unknown> | null = null
  const ensureIndexes = () => {
    indexed ??= Promise.all([
      col.createIndex({ userId: 1 }, { name: 'userId', sparse: true }),
      col.createIndex({ 'contact.email': 1 }, { name: 'contact_email', collation: CI }),
      col.createIndex({ createdAt: -1 }, { name: 'createdAt' }),
    ]).catch(() => undefined)
    return indexed
  }

  return {
    async forUser(user: { id: string; email: string; emailVerified: boolean }) {
      await ensureIndexes()
      const clauses: Filter<Doc>[] = [{ userId: user.id }]
      // Only a verified address may pull in bookings made earlier as a guest.
      if (user.emailVerified && user.email) clauses.push({ 'contact.email': user.email })
      const docs = await col.find({ $or: clauses }, { collation: CI }).sort({ createdAt: -1 }).limit(100).toArray()
      return docs.map(customerView)
    },

    async search(query: SearchQuery) {
      await ensureIndexes()
      const filter: Filter<Doc> = {}
      if (query.status) filter.status = query.status
      if (query.mode) filter.mode = query.mode
      if (query.from || query.to) {
        filter.slot = {
          ...(query.from ? { $gte: startOfLocalDay(query.from) } : {}),
          ...(query.to ? { $lt: startOfLocalDay(addDays(query.to, 1)) } : {}),
        }
      }
      const text = query.q?.trim()
      if (text) {
        const rx = { $regex: escapeRegex(text), $options: 'i' }
        filter.$or = [
          { code: rx },
          { 'contact.name': rx },
          { 'contact.email': rx },
          { 'contact.phone': rx },
          { 'device.brand': rx },
          { 'device.model': rx },
          { issue: rx },
          { custom: rx },
        ]
      }
      const [items, total] = await Promise.all([
        col.find(filter).sort({ slot: -1 }).skip(query.skip).limit(query.limit).toArray(),
        col.countDocuments(filter),
      ])
      return { total, items: items.map(ownerView) }
    },

    async detail(code: string) {
      const doc = await col.findOne({ code: code.trim().toUpperCase() })
      return doc ? ownerView(doc) : null
    },

    /** Sets the status and appends to the history. Returns null for an unknown code. */
    async changeStatus(code: string, status: BookingStatus, actor: { id?: string; name: string }, note?: string) {
      const wanted = code.trim().toUpperCase()
      const before = await col.findOne({ code: wanted })
      if (!before) return null
      // Same status and no note: nothing happened, so the history gets no new line.
      if (before.status === status && !note) return { booking: ownerView(before), from: before.status, unchanged: true }
      const now = new Date().toISOString()
      const entry: StatusEntry = {
        status,
        at: now,
        by: actor.name,
        ...(actor.id ? { byId: actor.id } : {}),
        ...(note ? { note } : {}),
      }
      const seed: StatusEntry[] = before.statusHistory ? [] : [{ status: 'received', at: before.createdAt, by: 'customer' }]
      const after = await col.findOneAndUpdate(
        { code: wanted },
        before.statusHistory
          ? { $set: { status, updatedAt: now }, $push: { statusHistory: entry } }
          : { $set: { status, updatedAt: now, statusHistory: [...seed, entry] } },
        { returnDocument: 'after' },
      )
      return after ? { booking: ownerView(after), from: before.status } : null
    },

    /** Booked slots for the 7 days starting on the Monday of the given date. */
    async calendar(date: string) {
      const monday = mondayOf(date)
      const docs = await col
        .find({ slot: { $gte: startOfLocalDay(monday), $lt: startOfLocalDay(addDays(monday, 7)) } })
        .sort({ slot: 1 })
        .toArray()
      const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(monday, i), slots: [] as unknown[] }))
      for (const doc of docs) {
        const day = days.find((d) => d.date === localDate(doc.slot))
        day?.slots.push({
          slot: doc.slot,
          code: doc.code,
          mode: doc.mode,
          status: doc.status,
          name: doc.contact.name,
          device: [doc.device.brand, doc.device.model].filter(Boolean).join(' ') || doc.custom || '',
          pickup: Boolean(doc.pickup),
        })
      }
      return { weekStart: monday, days }
    },

    /** Pickup and drop-off jobs whose slot falls on the shop-local day. */
    async pickups(date: string) {
      const docs = await col
        .find({ pickup: { $exists: true }, slot: { $gte: startOfLocalDay(date), $lt: startOfLocalDay(addDays(date, 1)) } })
        .sort({ slot: 1 })
        .toArray()
      return docs.map((doc) => ({
        code: doc.code,
        status: doc.status,
        slot: doc.slot,
        // The customer's chosen time is the start of a one-hour arrival window.
        window: { from: doc.slot, to: new Date(Date.parse(doc.slot) + 3600_000).toISOString() },
        trips: doc.pickup!.trips,
        urgent: doc.pickup!.urgent === true,
        address: doc.pickup!.address,
        lat: doc.pickup!.lat,
        lon: doc.pickup!.lon,
        mapLink: mapLink(doc.pickup!.lat, doc.pickup!.lon),
        name: doc.contact.name,
        phone: doc.contact.phone,
        device: [doc.device.brand, doc.device.model].filter(Boolean).join(' '),
        quoteLei: doc.pickup!.quote.totalLei,
      }))
    },

    async stats(now = new Date()) {
      const today = localDate(now)
      const thisMonday = mondayOf(today)
      const firstMonday = addDays(thisMonday, -77) // 12 weeks including this one
      const weeks = Array.from({ length: 12 }, (_, i) => ({ weekStart: addDays(firstMonday, i * 7), count: 0 }))
      // Trend points, one per week (12) and per month (12): new bookings and their value by the day they
      // came in, finished jobs and their income (repair estimate midpoint + transport) by the day they were done.
      const weekly: TrendPoint[] = weeks.map((w) => ({ start: w.weekStart, created: 0, done: 0, bookedLei: 0, doneLei: 0, transportLei: 0 }))
      const monthly: TrendPoint[] = Array.from({ length: 12 }, (_, i) => ({ start: addMonths(`${today.slice(0, 7)}-01`, i - 11), created: 0, done: 0, bookedLei: 0, doneLei: 0, transportLei: 0 }))
      const docs = await col
        .find({}, { projection: { createdAt: 1, status: 1, jobIds: 1, estimate: 1, statusHistory: 1, updatedAt: 1, pickup: 1 } })
        .toArray()

      const byStatus: Record<string, number> = {}
      const byCategory: Record<string, number> = {}
      let doneLei = 0
      let pipelineLei = 0

      for (const doc of docs) {
        byStatus[doc.status] = (byStatus[doc.status] ?? 0) + 1
        const category = categoryOf.get(doc.jobIds?.[0] ?? '') ?? 'custom'
        byCategory[category] = (byCategory[category] ?? 0) + 1

        const created = localDate(doc.createdAt)
        const week = weeks.find((w, i) => {
          const next = weeks[i + 1]?.weekStart ?? addDays(w.weekStart, 7)
          return created >= w.weekStart && created < next
        })
        if (week) week.count += 1

        const mid = ((doc.estimate?.priceFrom ?? 0) + (doc.estimate?.priceTo ?? 0)) / 2
        const transport = doc.pickup?.quote?.totalLei ?? 0
        if (doc.status === 'done') doneLei += mid
        else pipelineLei += mid

        for (const series of [weekly, monthly]) {
          const c = bucketOf(series, created)
          if (c) {
            c.created += 1
            c.bookedLei += mid + transport
          }
        }
        if (doc.status === 'done') {
          const doneAt = [...(doc.statusHistory ?? [])].reverse().find((e) => e.status === 'done')?.at ?? doc.updatedAt ?? doc.createdAt
          const day = localDate(doneAt)
          for (const series of [weekly, monthly]) {
            const d = bucketOf(series, day)
            if (d) {
              d.done += 1
              d.doneLei += mid
              d.transportLei += transport
            }
          }
        }
      }
      const round = (series: TrendPoint[]) => series.map((p) => ({ ...p, bookedLei: Math.round(p.bookedLei), doneLei: Math.round(p.doneLei), transportLei: Math.round(p.transportLei) }))
      return {
        weeks,
        trend: { weekly: round(weekly), monthly: round(monthly) },
        byCategory,
        byStatus,
        total: docs.length,
        active: docs.filter((d) => ACTIVE_STATUSES.includes(d.status)).length,
        revenue: { doneLei: Math.round(doneLei), pipelineLei: Math.round(pipelineLei) },
      }
    },
  }
}
