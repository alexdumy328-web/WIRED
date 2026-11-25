import type { Collection, Db, Filter } from 'mongodb'
import { catalog } from '../../src/data/catalog.ts'
import type { Booking, BookingStatus, Intake, RepairNotes, StatusEntry } from '../../src/types.ts'
import { generateCode } from '../code.ts'
import { ACTIVE_STATUSES, COLLECTION_NAME, isDuplicateKeyError } from '../store.ts'
import type { Counters } from './counters.ts'
import { addDays, localDate, localYear, mondayOf, startOfLocalDay } from './time.ts'

type Doc = Booking & { _id?: unknown; collectedAt?: string }

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

/**
 * What the customer sees of their own booking: no internal notes, user or customer ids, photos,
 * diagnosis notes or the name of whoever took the device in.
 */
export function customerView(doc: Doc) {
  const { userId: _u, customerId: _c, photoIds: _p, statusHistory, intake, repair, ...rest } = strip(doc)
  const history = statusHistory ?? [{ status: 'received' as BookingStatus, at: rest.createdAt, by: 'customer' }]
  return {
    ...rest,
    ...(intake ? { intake: { number: intake.number, year: intake.year, receivedAt: intake.receivedAt, deviceType: intake.deviceType } } : {}),
    ...(repair?.workDone ? { repair: { workDone: repair.workDone } } : {}),
    // A note or an intake adds a line with the same status; the customer sees each status once.
    timeline: history.filter((entry, i) => i === 0 || entry.status !== history[i - 1]!.status).map((entry) => ({ status: entry.status, at: entry.at })),
  }
}

/** Fields typed at the counter when the device is handed in. */
export type IntakeFields = Pick<Intake, 'deviceType'> & Partial<Pick<Intake, 'serial' | 'accessories' | 'appearance'>>

export type WalkInInput = {
  customerId: string
  contact: { name: string; phone: string; email?: string }
  device: { brand?: string; model?: string }
  issue: string
  jobIds: string[]
  estimate: { priceFrom: number; priceTo: number }
  lang: 'ro' | 'en'
  intake: IntakeFields
}

/** Drops empty optional strings so cleared fields disappear instead of being stored as "". */
function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '')) as T
}

export type SearchQuery = {
  status?: BookingStatus | 'handback'
  mode?: 'shop' | 'pickup' | 'mobile'
  /** YYYY-MM-DD, shop-local, inclusive. */
  from?: string
  /** Only jobs that have (true) or have not (false) been taken in at the counter. */
  intake?: boolean
  to?: string
  q?: string
  limit: number
  skip: number
  /** Newest first (the dashboards) unless a driver's list asks for the next ones first. */
  order?: 'asc' | 'desc'
}

export type BookingAdmin = ReturnType<typeof createBookingAdmin>

export function createBookingAdmin(db: Db, counters?: Counters) {
  const col: Collection<Doc> = db.collection<Doc>(COLLECTION_NAME)
  let indexed: Promise<unknown> | null = null
  const ensureIndexes = () => {
    indexed ??= Promise.all([
      col.createIndex({ userId: 1 }, { name: 'userId', sparse: true }),
      col.createIndex({ 'contact.email': 1 }, { name: 'contact_email', collation: CI }),
      col.createIndex({ createdAt: -1 }, { name: 'createdAt' }),
      col.createIndex({ 'intake.year': -1, 'intake.number': -1 }, { name: 'intake_number', partialFilterExpression: { intake: { $exists: true } } }),
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
      if (query.status === 'handback') filter.status = { $in: ['ready', 'unrepairable'] }
      else if (query.status) filter.status = query.status
      if (query.mode === 'pickup') {
        filter.mode = 'shop'
        filter.pickup = { $exists: true }
      } else if (query.mode === 'shop') {
        filter.mode = 'shop'
        filter.pickup = { $exists: false }
      } else if (query.mode === 'mobile') filter.mode = 'mobile'
      if (query.from || query.to) {
        filter.slot = {
          ...(query.from ? { $gte: startOfLocalDay(query.from) } : {}),
          ...(query.to ? { $lt: startOfLocalDay(addDays(query.to, 1)) } : {}),
        }
      }
      if (query.intake !== undefined) filter.intake = { $exists: query.intake }
      const text = query.q?.trim()
      // "12/2026" or "#12" finds a service sheet by number.
      const sheet = text ? /^#?(\d{1,6})(?:\/(\d{4}))?$/.exec(text) : null
      if (text) {
        const rx = { $regex: escapeRegex(text), $options: 'i' }
        filter.$or = [
          ...(sheet ? [{ 'intake.number': Number(sheet[1]), ...(sheet[2] ? { 'intake.year': Number(sheet[2]) } : {}) }] : []),
          { 'intake.serial': rx },
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
        col.find(filter).sort({ slot: query.order === 'asc' ? 1 : -1 }).skip(query.skip).limit(query.limit).toArray(),
        col.countDocuments(filter),
      ])
      return { total, items: items.map(ownerView) }
    },

    async detail(code: string) {
      const doc = await col.findOne({ code: code.trim().toUpperCase() })
      return doc ? ownerView(doc) : null
    },

    /**
     * Sets the status, the final price, or both. A status change or a note adds a history line; a
     * price on its own does not. Returns null for an unknown code, and `changed: false` when the
     * request matches what is already stored.
     */
    async update(code: string, change: { status: BookingStatus; note?: string; finalLei?: number | null; repair?: RepairNotes }, actor: { id?: string; name: string }) {
      const wanted = code.trim().toUpperCase()
      const before = await col.findOne({ code: wanted })
      if (!before) return null
      const { status, note } = change
      const statusChanged = before.status !== status
      const priceChanged = change.finalLei !== undefined && change.finalLei !== (before.finalLei ?? null)
      const repair = change.repair ? compact({ ...before.repair, ...change.repair }) : undefined
      const repairChanged = repair !== undefined && JSON.stringify(repair) !== JSON.stringify(compact({ ...before.repair }))
      if (!statusChanged && !note && !priceChanged && !repairChanged) return { booking: ownerView(before), from: before.status, changed: false, statusChanged: false, priceChanged: false, repairChanged: false }
      const now = new Date().toISOString()
      const set: Partial<Doc> = { status, updatedAt: now }
      const unset: Record<string, ''> = {}
      if (repairChanged) {
        if (Object.keys(repair!).length) set.repair = repair
        else unset.repair = ''
      }
      // The hand-back moment, for the warranty start and the "delivered" column.
      if (statusChanged && status === 'done') set.deliveredAt = now
      else if (statusChanged && before.status === 'done') unset.deliveredAt = ''
      if (priceChanged) {
        if (change.finalLei === null) unset.finalLei = ''
        else set.finalLei = change.finalLei
      }
      const update: Record<string, unknown> = { $set: set }
      if (Object.keys(unset).length) update.$unset = unset
      if (statusChanged || note) {
        const entry: StatusEntry = {
          status,
          at: now,
          by: actor.name,
          ...(actor.id ? { byId: actor.id } : {}),
          ...(note ? { note } : {}),
        }
        if (before.statusHistory) update.$push = { statusHistory: entry }
        else set.statusHistory = [{ status: 'received', at: before.createdAt, by: 'customer' }, entry]
      }
      const after = await col.findOneAndUpdate({ code: wanted }, update, { returnDocument: 'after' })
      return after
        ? { booking: ownerView(after), from: before.status, fromLei: before.finalLei ?? null, changed: true, statusChanged, priceChanged, repairChanged }
        : null
    },

    /**
     * Takes the device in at the counter: gives the booking the next service sheet number of the
     * year and stores what was handed over. A booking is taken in once; later edits keep the number.
     */
    async intake(code: string, fields: IntakeFields, actor: { id?: string; name: string }) {
      if (!counters) throw new Error('counters_missing')
      const wanted = code.trim().toUpperCase()
      const before = await col.findOne({ code: wanted })
      if (!before) return { error: 'not_found' as const }
      if (before.intake) return { error: 'already' as const, booking: ownerView(before) }
      if (before.status === 'cancelled' || before.status === 'done') return { error: 'closed' as const }
      const now = new Date()
      const year = localYear(now)
      const number = await counters.next('sheet', year)
      const intake: Intake = compact({ ...fields, number, year, receivedAt: now.toISOString(), by: actor.name })
      const entry: StatusEntry = { status: before.status, at: now.toISOString(), by: actor.name, ...(actor.id ? { byId: actor.id } : {}), note: `Fișa ${number}/${year}` }
      const history = before.statusHistory ? {} : { statusHistory: [{ status: 'received' as BookingStatus, at: before.createdAt, by: 'customer' }] }
      // The intake filter makes a double click lose cleanly instead of numbering twice. A lost race
      // leaves a gap in the year's numbers, which the sheet list shows plainly.
      const after = await col.findOneAndUpdate(
        { code: wanted, intake: { $exists: false } },
        { $set: { intake, updatedAt: now.toISOString(), ...history }, ...(before.statusHistory ? { $push: { statusHistory: entry } } : {}) },
        { returnDocument: 'after' },
      )
      if (!after) {
        const current = await col.findOne({ code: wanted })
        return current ? { error: 'already' as const, booking: ownerView(current) } : { error: 'not_found' as const }
      }
      if (!before.statusHistory) await col.updateOne({ code: wanted }, { $push: { statusHistory: entry } })
      return { booking: ownerView((await col.findOne({ code: wanted }))!) }
    },

    /** Corrects what was typed at intake. The number, date and who took it in stay. */
    async editIntake(code: string, fields: Partial<IntakeFields>) {
      const wanted = code.trim().toUpperCase()
      const before = await col.findOne({ code: wanted })
      if (!before?.intake) return null
      const intake = compact({ ...before.intake, ...fields }) as Intake
      const after = await col.findOneAndUpdate({ code: wanted }, { $set: { intake, updatedAt: new Date().toISOString() } }, { returnDocument: 'after' })
      return after ? ownerView(after) : null
    },

    /**
     * A device brought in without a booking. Creates the job already taken in: a service sheet
     * number, the customer link and the counter fields, in one go.
     */
    async createWalkIn(input: WalkInInput, actor: { id?: string; name: string }) {
      if (!counters) throw new Error('counters_missing')
      const now = new Date()
      const iso = now.toISOString()
      const year = localYear(now)
      const number = await counters.next('sheet', year)
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const booking: Booking = {
          mode: 'shop',
          jobIds: input.jobIds,
          device: compact(input.device),
          issue: input.issue,
          // The walk-in's own moment, to the millisecond, so it never takes a bookable slot.
          slot: iso,
          contact: compact(input.contact),
          estimate: { priceFrom: input.estimate.priceFrom, priceTo: input.estimate.priceTo, etaHours: [0, 0] },
          lang: input.lang,
          code: generateCode(),
          status: 'received',
          createdAt: iso,
          updatedAt: iso,
          source: 'walk-in',
          customerId: input.customerId,
          intake: compact({ ...input.intake, number, year, receivedAt: iso, by: actor.name }) as Intake,
          statusHistory: [{ status: 'received', at: iso, by: actor.name, ...(actor.id ? { byId: actor.id } : {}), note: `Fișa ${number}/${year}` }],
        }
        try {
          await col.insertOne(booking as never)
          return ownerView(booking)
        } catch (error) {
          if (!isDuplicateKeyError(error) || !/code/.test(String((error as Error).message))) throw error
        }
      }
      throw new Error('Could not allocate a unique booking code')
    },

    async attachPhoto(code: string, photoId: string) {
      await col.updateOne({ code }, { $push: { photoIds: photoId }, $set: { updatedAt: new Date().toISOString() } })
    },

    async detachPhoto(code: string, photoId: string) {
      await col.updateOne({ code }, { $pull: { photoIds: photoId } })
    },

    async linkCustomer(code: string, customerId: string) {
      await col.updateOne({ code }, { $set: { customerId } })
    },

    /** Every job of one customer, newest first. */
    async forCustomer(customerId: string) {
      const docs = await col.find({ customerId }).sort({ slot: -1 }).limit(200).toArray()
      return docs.map(ownerView)
    },

    /** The raw booking, for documents. */
    async raw(code: string): Promise<Booking | null> {
      const doc = await col.findOne({ code: code.trim().toUpperCase() })
      return doc ? strip(doc) : null
    },

    /** A customer's own booking: theirs by account, or by a verified email that matches. */
    async ownedBy(code: string, user: { id: string; email: string; emailVerified: boolean }): Promise<Booking | null> {
      const clauses: Filter<Doc>[] = [{ userId: user.id }]
      if (user.emailVerified && user.email) clauses.push({ 'contact.email': user.email })
      const doc = await col.findOne({ code: code.trim().toUpperCase(), $or: clauses }, { collation: CI })
      return doc ? strip(doc) : null
    },

    async statusCounts(): Promise<Record<string, number>> {
      const rows = await col.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray()
      return Object.fromEntries(rows.map((r) => [r._id, r.n]))
    },

    /** Open bookings per shop-local day between two dates (inclusive), for the calendar dots. */
    async busyDays(from: string, to: string) {
      const docs = await col
        .find({ status: { $ne: 'cancelled' }, slot: { $gte: startOfLocalDay(from), $lt: startOfLocalDay(addDays(to, 1)) } }, { projection: { slot: 1, pickup: 1 } })
        .toArray()
      const days: Record<string, { total: number; pickups: number }> = {}
      for (const doc of docs) {
        const day = (days[localDate(doc.slot)] ??= { total: 0, pickups: 0 })
        day.total++
        if (doc.pickup) day.pickups++
      }
      return days
    },

    /** Booked slots for the 7 days starting on the Monday of the given date. */
    async calendar(date: string) {
      const monday = mondayOf(date)
      const docs = await col
        .find({ status: { $ne: 'cancelled' }, slot: { $gte: startOfLocalDay(monday), $lt: startOfLocalDay(addDays(monday, 7)) } })
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
        .find({ pickup: { $exists: true }, status: { $ne: 'cancelled' }, slot: { $gte: startOfLocalDay(date), $lt: startOfLocalDay(addDays(date, 1)) } })
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

    /**
     * The driver's run for a shop-local day: pickups booked for that day, plus every finished repair waiting to go
     * back to a customer who chose delivery (whatever day it was booked), plus deliveries already made that day.
     * `leg` says what the driver does there; `completed` comes from the server, so it survives reinstalls and phones.
     */
    async run(date: string) {
      const start = startOfLocalDay(date)
      const end = startOfLocalDay(addDays(date, 1))
      const docs = await col
        .find({
          pickup: { $exists: true },
          status: { $ne: 'cancelled' },
          $or: [
            { slot: { $gte: start, $lt: end } },
            { status: { $in: ['ready', 'unrepairable'] }, 'pickup.trips': { $in: ['both', 'dropoff'] } },
            { status: 'done', deliveredAt: { $gte: start, $lt: end } },
          ],
        })
        .sort({ slot: 1 })
        .limit(100)
        .toArray()
      return docs.map((doc) => {
        const returning = doc.pickup!.trips !== 'pickup' && (doc.status === 'ready' || doc.status === 'unrepairable' || (doc.status === 'done' && Boolean(doc.deliveredAt)))
        const leg: 'collect' | 'deliver' = returning || doc.pickup!.trips === 'dropoff' ? 'deliver' : 'collect'
        const completed = leg === 'deliver' ? doc.status === 'done' : Boolean(doc.collectedAt)
        return {
          code: doc.code,
          status: doc.status,
          slot: doc.slot,
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
          leg,
          completed,
        }
      })
    },

    /** The driver collected the device. Kept on the booking so every phone agrees. */
    async markCollected(code: string) {
      await col.updateOne({ code, pickup: { $exists: true } }, { $set: { collectedAt: new Date().toISOString() } })
    },

    async stats(now = new Date()) {
      const today = localDate(now)
      const thisMonday = mondayOf(today)
      const firstMonday = addDays(thisMonday, -77) // 12 weeks including this one
      const weeks = Array.from({ length: 12 }, (_, i) => ({ weekStart: addDays(firstMonday, i * 7), count: 0 }))
      // Trend points, one per week (12) and per month (12): new bookings and their value by the day they
      // came in, finished jobs and their income (final price, else the estimate midpoint, plus transport) by the day they were done.
      const weekly: TrendPoint[] = weeks.map((w) => ({ start: w.weekStart, created: 0, done: 0, bookedLei: 0, doneLei: 0, transportLei: 0 }))
      const monthly: TrendPoint[] = Array.from({ length: 12 }, (_, i) => ({ start: addMonths(`${today.slice(0, 7)}-01`, i - 11), created: 0, done: 0, bookedLei: 0, doneLei: 0, transportLei: 0 }))
      const docs = await col
        .find({}, { projection: { createdAt: 1, status: 1, jobIds: 1, estimate: 1, statusHistory: 1, updatedAt: 1, pickup: 1, finalLei: 1 } })
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
        // A finished job counts what was actually charged when the owner wrote it down.
        const charged = doc.finalLei ?? mid
        const transport = doc.pickup?.quote?.totalLei ?? 0
        const cancelled = doc.status === 'cancelled'
        // Same basis as the income chart: repair plus transport.
        if (doc.status === 'done') doneLei += charged + transport
        // An unrepairable device brings in a diagnosis fee at most; it is not expected income.
        else if (!cancelled && doc.status !== 'unrepairable') pipelineLei += mid + transport

        for (const series of [weekly, monthly]) {
          const c = bucketOf(series, created)
          if (c) {
            c.created += 1
            if (!cancelled) c.bookedLei += mid + transport
          }
        }
        if (doc.status === 'done') {
          const doneAt = [...(doc.statusHistory ?? [])].reverse().find((e) => e.status === 'done')?.at ?? doc.updatedAt ?? doc.createdAt
          const day = localDate(doneAt)
          for (const series of [weekly, monthly]) {
            const d = bucketOf(series, day)
            if (d) {
              d.done += 1
              d.doneLei += charged
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
