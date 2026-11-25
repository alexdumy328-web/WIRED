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
    ]).catch(() => {
      // Try again next time instead of caching the failure (the unique and expiry indexes matter).
      ready = null
    }))

  const cache = new Map<string, { at: number; value: DriverPosition | null }>()
  const cutoff = () => new Date(now() - FRESH_MS)
  const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>

  return {
    async update(viewer: { id: string; name: string }, input: DriverUpdate): Promise<void> {
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
      await col.replaceOne({ userId: viewer.id }, doc, { upsert: true })
      if (code) cache.delete(code)
    },

    async stop(userId: string): Promise<void> {
      const gone = await col.findOneAndDelete({ userId })
      const code = (gone as unknown as DriverPosition | null)?.bookingCode
      if (code) cache.delete(code)
    },

    /** The driver heading to this booking, if one shared a position in the last minute and a half. */
    async forBooking(code: string): Promise<DriverPosition | null> {
      const key = code.toUpperCase()
      const hit = cache.get(key)
      if (hit && now() - hit.at < CACHE_MS) return hit.value
      await ensureIndexes()
      const found = await col.findOne({ bookingCode: key, updatedAt: { $gte: cutoff() } }, { projection: { _id: 0, userId: 0 } as never, sort: { updatedAt: -1 } })
      // Bounded: drop the oldest entry, never the whole cache (so made-up codes cannot flush real ones).
      if (cache.size >= 500) cache.delete(cache.keys().next().value as string)
      cache.set(key, { at: now(), value: found })
      return found
    },

    async live(): Promise<DriverPosition[]> {
      await ensureIndexes()
      return col.find({ updatedAt: { $gte: cutoff() } }, { projection: { _id: 0 } as never }).sort({ updatedAt: -1 }).limit(20).toArray()
    },
  }
}
