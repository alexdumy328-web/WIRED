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
    ]).catch(() => undefined))

  const cache = new Map<string, { at: number; value: DriverPosition | null }>()
  const cutoff = () => new Date(now() - FRESH_MS)
  const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>

  return {
    async update(viewer: { id: string; name: string }, input: DriverUpdate): Promise<void> {
      await ensureIndexes()
      const code = input.bookingCode ? input.bookingCode.toUpperCase() : undefined
      const set = clean({
        name: viewer.name.trim().split(/\s+/)[0] || 'Șofer',
        lat: input.latitude,
        lon: input.longitude,
        heading: input.heading,
        speedKmh: input.speedKmh,
        etaMinutes: input.etaMinutes,
        updatedAt: new Date(now()),
      })
      // A trip with no destination (the driver is heading back) clears the old one.
      await col.updateOne(
        { userId: viewer.id },
        code ? { $set: { ...set, bookingCode: code } } : { $set: set, $unset: { bookingCode: '' } },
        { upsert: true },
      )
      cache.clear()
    },

    async stop(userId: string): Promise<void> {
      await col.deleteOne({ userId })
      cache.clear()
    },

    /** The driver heading to this booking, if one shared a position in the last minute and a half. */
    async forBooking(code: string): Promise<DriverPosition | null> {
      const key = code.toUpperCase()
      const hit = cache.get(key)
      if (hit && now() - hit.at < CACHE_MS) return hit.value
      await ensureIndexes()
      const found = await col.findOne({ bookingCode: key, updatedAt: { $gte: cutoff() } }, { projection: { _id: 0, userId: 0 } as never })
      if (cache.size > 500) cache.clear()
      cache.set(key, { at: now(), value: found })
      return found
    },

    async live(): Promise<DriverPosition[]> {
      await ensureIndexes()
      return col.find({ updatedAt: { $gte: cutoff() } }, { projection: { _id: 0 } as never }).sort({ updatedAt: -1 }).limit(20).toArray()
    },
  }
}
