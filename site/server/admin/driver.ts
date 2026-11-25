import type { Db } from 'mongodb'

/** Where a driver is, and where they are heading. One document per driver, overwritten on every update. */
export type DriverPosition = {
  userId: string
  /** First name only: it is what the customer sees. */
  name: string
  lat: number
  lon: number
  heading?: number
  speedKmh?: number
  bookingCode?: string
  etaMinutes?: number
  updatedAt: Date
}

export type DriverUpdate = {
  latitude: number
  longitude: number
  heading?: number | null
  speedKmh?: number | null
  bookingCode?: string | null
  etaMinutes?: number | null
}

/** A position older than this means the driver stopped sharing (app closed, phone off, no signal). */
export const FRESH_MS = 90_000
/** Short cache for the public lookup: many customers polling the same driver cost one database read. */
const CACHE_MS = 3_000
/** Leftovers expire on their own even if the driver never stops sharing cleanly. */
const EXPIRE_SECONDS = 24 * 3600

/** Bookings a driver can be on the way to: collecting (received) or handing back (ready, unrepairable). */
export const DRIVER_STATUSES = ['received', 'diagnosis', 'ready', 'unrepairable']

export type DriverTracking = ReturnType<typeof createDriverTracking>

/**
 * Live driver positions for the customer's "driver is on the way" card and the owner's radar.
 * Only the latest position is kept (no trail), and it is deleted when the trip ends.
 */
export function createDriverTracking(db: Db, now: () => number = Date.now) {
  const col = db.collection<DriverPosition>('driver_positions')
  let ready: Promise<unknown> | null = null
  const ensureIndexes = () =>
    (ready ??= Promise.all([
      col.createIndex({ userId: 1 }, { unique: true, name: 'userId' }),
      col.createIndex({ updatedAt: 1 }, { expireAfterSeconds: EXPIRE_SECONDS, name: 'ttl_24h' }),
      col.createIndex({ bookingCode: 1 }, { name: 'bookingCode', sparse: true }),
      last.createIndex({ userId: 1 }, { unique: true, name: 'userId' }),
      last.createIndex({ at: 1 }, { expireAfterSeconds: EXPIRE_SECONDS, name: 'ttl_24h' }),
    ]).catch(() => {
      // Try again next time instead of caching the failure (the unique and expiry indexes matter).
      ready = null
    }))

  const bookings = db.collection<{ code: string; status: string }>('bookings')
  /** Where each driver was when their last trip ended, for the owner's "at the workshop or not" (24 h, then gone). */
  const last = db.collection<{ userId: string; name: string; lat: number; lon: number; at: Date }>('driver_last')
  const cache = new Map<string, { at: number; value: DriverPosition | null }>()
  const cutoff = () => new Date(now() - FRESH_MS)
  const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>

  return {
    /** Saves the position. Returns it, and the booking the driver was heading to before, when that changed. */
    async update(viewer: { id: string; name: string }, input: DriverUpdate): Promise<{ position: DriverPosition; started: boolean; left?: string }> {
      await ensureIndexes()
      const code = input.bookingCode ? input.bookingCode.toUpperCase() : undefined
      // The whole document is replaced, so a field the phone stopped sending (heading, ETA, destination) goes away.
      const doc = clean({
        userId: viewer.id,
        name: viewer.name.trim().split(/\s+/)[0] || 'Șofer',
        lat: input.latitude,
        lon: input.longitude,
        heading: input.heading,
        speedKmh: input.speedKmh,
        etaMinutes: input.etaMinutes,
        bookingCode: code,
        updatedAt: new Date(now()),
      }) as DriverPosition
      const before = (await col.findOneAndReplace({ userId: viewer.id }, doc, { upsert: true, projection: { bookingCode: 1 } })) as unknown as DriverPosition | null
      if (code) cache.delete(code)
      const left = before?.bookingCode && before.bookingCode !== code ? before.bookingCode : undefined
      if (left) cache.delete(left)
      // A new trip: heading to this booking now, and was not a moment ago.
      const started = Boolean(code) && before?.bookingCode !== code
      return { position: doc, started, ...(left ? { left } : {}) }
    },

    /** Ends the share. Returns the booking the driver was heading to, if any. */
    async stop(userId: string): Promise<string | undefined> {
      const gone = (await col.findOneAndDelete({ userId })) as unknown as DriverPosition | null
      if (gone) await last.replaceOne({ userId }, { userId, name: gone.name, lat: gone.lat, lon: gone.lon, at: new Date(now()) }, { upsert: true }).catch(() => undefined)
      const code = gone?.bookingCode
      if (code) cache.delete(code)
      return code
    },

    /** The driver heading to this booking, if one shared a position in the last minute and a half. */
    async forBooking(code: string): Promise<DriverPosition | null> {
      const key = code.toUpperCase()
      const hit = cache.get(key)
      if (hit && now() - hit.at < CACHE_MS) return hit.value
      await ensureIndexes()
      const near = await col.findOne({ bookingCode: key, updatedAt: { $gte: cutoff() } }, { projection: { _id: 0, userId: 0 } as never, sort: { updatedAt: -1 } })
      // Only while the booking is one a driver can be heading to: a stale code on the phone, a cancelled
      // or closed job never shows the van to whoever holds that code.
      const open = near ? await bookings.findOne({ code: key, status: { $in: DRIVER_STATUSES } }, { projection: { _id: 1 } }) : null
      const found = open ? near : null
      // Bounded: drop the oldest entry, never the whole cache (so made-up codes cannot flush real ones).
      if (cache.size >= 500) cache.delete(cache.keys().next().value as string)
      cache.set(key, { at: now(), value: found })
      return found
    },

    /** Drivers not on a trip now, with where their last trip ended. */
    async lastSeen(exclude: string[]): Promise<{ userId: string; name: string; lat: number; lon: number; at: Date }[]> {
      await ensureIndexes()
      return last.find({ userId: { $nin: exclude } }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(10).toArray()
    },

    async live(): Promise<DriverPosition[]> {
      await ensureIndexes()
      return col.find({ updatedAt: { $gte: cutoff() } }, { projection: { _id: 0 } as never }).sort({ updatedAt: -1 }).limit(20).toArray()
    },
  }
}
