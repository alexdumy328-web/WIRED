import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MongoClient } from 'mongodb'
import type { Collection, Db } from 'mongodb'
import type { Booking, BookingStatus, ServiceMode } from '../src/types.ts'

/** Bookings that still occupy the queue. */
export const ACTIVE_STATUSES: readonly BookingStatus[] = [
  'received',
  'diagnosis',
  'waiting-parts',
  'repairing',
]

/** Bookings that no longer hold their slot. */
export const CLOSED_STATUSES: readonly BookingStatus[] = ['done', 'cancelled']

/** Thrown by insertBooking when another open booking already holds the slot (Mongo unique index). */
export class SlotTakenError extends Error {
  constructor() {
    super('slot_taken')
    this.name = 'SlotTakenError'
  }
}

export const COLLECTION_NAME = 'bookings'
export const DEFAULT_DB_NAME = 'norgelis'

export interface Store {
  readonly kind: 'mongo' | 'file'
  init(): Promise<void>
  close(): Promise<void>
  /** Returns false when the generated code is already taken. */
  insertBooking(booking: Booking): Promise<boolean>
  findByCode(code: string): Promise<Booking | null>
  hasSlot(mode: ServiceMode, slot: string): Promise<boolean>
  /** Slots already taken by non-done bookings, within [fromMs, toMs]. */
  takenSlots(mode: ServiceMode, fromMs: number, toMs: number): Promise<string[]>
  listActive(): Promise<Booking[]>
  updateStatus(code: string, status: BookingStatus): Promise<Booking | null>
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

const BOOKING_OPEN: BookingStatus[] = ['received', 'diagnosis', 'waiting-parts', 'repairing', 'ready', 'unrepairable']

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
}

/**
 * JSON-file backed store. Keeps everything in memory and rewrites the file after
 * every mutation, which is plenty for a single-process workshop API.
 */
export class FileStore implements Store {
  readonly kind = 'file' as const
  private readonly file: string
  private bookings: Booking[] = []
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(directory: string) {
    this.file = path.join(directory, 'bookings.json')
  }

  get filePath(): string {
    return this.file
  }

  async init(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    try {
      const raw = await readFile(this.file, 'utf8')
      if (raw.trim() === '') {
        this.bookings = []
        return
      }
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        throw new Error(`Booking file ${this.file} does not contain a JSON array`)
      }
      this.bookings = parsed as Booking[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.bookings = []
        return
      }
      throw error
    }
  }

  async close(): Promise<void> {
    await this.writeQueue
  }

  async insertBooking(booking: Booking): Promise<boolean> {
    if (this.bookings.some((existing) => existing.code === booking.code)) {
      return false
    }
    this.bookings.push(booking)
    await this.persist()
    return true
  }

  async findByCode(code: string): Promise<Booking | null> {
    const wanted = normalizeCode(code)
    return this.bookings.find((booking) => booking.code === wanted) ?? null
  }

  async hasSlot(mode: ServiceMode, slot: string): Promise<boolean> {
    return this.bookings.some(
      (booking) => booking.mode === mode && booking.slot === slot && !CLOSED_STATUSES.includes(booking.status),
    )
  }

  async takenSlots(mode: ServiceMode, fromMs: number, toMs: number): Promise<string[]> {
    const slots = this.bookings
      .filter((booking) => {
        if (booking.mode !== mode || CLOSED_STATUSES.includes(booking.status)) return false
        const time = Date.parse(booking.slot)
        return Number.isFinite(time) && time >= fromMs && time <= toMs
      })
      .map((booking) => booking.slot)
    return [...new Set(slots)].sort()
  }

  async listActive(): Promise<Booking[]> {
    return this.bookings.filter((booking) => ACTIVE_STATUSES.includes(booking.status))
  }

  async updateStatus(code: string, status: BookingStatus): Promise<Booking | null> {
    const wanted = normalizeCode(code)
    const booking = this.bookings.find((existing) => existing.code === wanted)
    if (!booking) return null
    booking.status = status
    booking.updatedAt = new Date().toISOString()
    await this.persist()
    return booking
  }

  private persist(): Promise<void> {
    const payload = `${JSON.stringify(this.bookings, null, 2)}\n`
    this.writeQueue = this.writeQueue.then(async () => {
      const temp = `${this.file}.tmp`
      await writeFile(temp, payload, 'utf8')
      await rename(temp, this.file)
    })
    return this.writeQueue
  }
}

/** MongoDB backed store; one collection with a unique index on the booking code. */
export class MongoStore implements Store {
  readonly kind = 'mongo' as const
  private readonly client: MongoClient
  private readonly dbName: string
  private collection: Collection<Booking> | null = null

  constructor(uri: string, dbName: string = DEFAULT_DB_NAME) {
    // Serverless: every warm instance keeps its own pool, so keep it small and let idle sockets go.
    // Atlas' free tier allows 500 connections; 10 instances x 10 stays well under it.
    this.client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 8_000,
      appName: 'norgelis-api',
    })
    this.dbName = dbName
  }

  async init(): Promise<void> {
    await this.client.connect()
    this.collection = this.client.db(this.dbName).collection<Booking>(COLLECTION_NAME)
    await this.collection.createIndex({ code: 1 }, { unique: true, name: 'code_unique' })
    await this.collection.createIndex({ slot: 1 }, { name: 'slot' })
    await this.collection.createIndex({ mode: 1, slot: 1 }, { name: 'mode_slot' })
    await this.collection.createIndex({ status: 1 }, { name: 'status' })
    // One open booking per mode and slot, enforced by the database so two submits at the same
    // moment cannot both win. If old data already has a clash the index is skipped, not fatal.
    // An index left by an older list of open statuses is replaced, or the new list never applies.
    const existing = (await this.collection.listIndexes().toArray().catch(() => [])).find((index) => index.name === 'mode_slot_open_unique')
    const wanted = [...BOOKING_OPEN].sort().join(',')
    const current = ((existing?.partialFilterExpression as { status?: { $in?: string[] } } | undefined)?.status?.$in ?? []).slice().sort().join(',')
    if (existing && current !== wanted) await this.collection.dropIndex('mode_slot_open_unique').catch(() => undefined)
    await this.collection
      .createIndex(
        { mode: 1, slot: 1 },
        {
          name: 'mode_slot_open_unique',
          unique: true,
          partialFilterExpression: { status: { $in: BOOKING_OPEN } },
        },
      )
      .catch((error: unknown) => console.warn('[store] slot uniqueness index not created:', (error as Error).message))
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  /** The connected database, shared with the account and dashboard code. */
  getDb(): Db {
    return this.client.db(this.dbName)
  }

  async insertBooking(booking: Booking): Promise<boolean> {
    try {
      await this.requireCollection().insertOne(booking)
      return true
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        if (/mode_slot_open_unique/.test(String((error as Error).message))) throw new SlotTakenError()
        return false
      }
      throw error
    }
  }

  async findByCode(code: string): Promise<Booking | null> {
    return this.requireCollection().findOne({ code: normalizeCode(code) })
  }

  async hasSlot(mode: ServiceMode, slot: string): Promise<boolean> {
    const match = await this.requireCollection().findOne({
      mode,
      slot,
      status: { $nin: [...CLOSED_STATUSES] },
    })
    return match !== null
  }

  async takenSlots(mode: ServiceMode, fromMs: number, toMs: number): Promise<string[]> {
    const from = new Date(fromMs).toISOString()
    const to = new Date(toMs).toISOString()
    const docs = await this.requireCollection()
      .find(
        { mode, status: { $nin: [...CLOSED_STATUSES] }, slot: { $gte: from, $lte: to } },
        { projection: { _id: 0, slot: 1 } },
      )
      .toArray()
    const slots = docs.map((doc) => doc.slot)
    return [...new Set(slots)].sort()
  }

  async listActive(): Promise<Booking[]> {
    return this.requireCollection()
      .find({ status: { $in: [...ACTIVE_STATUSES] } })
      .toArray()
  }

  async updateStatus(code: string, status: BookingStatus): Promise<Booking | null> {
    return this.requireCollection().findOneAndUpdate(
      { code: normalizeCode(code) },
      { $set: { status, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' },
    )
  }

  private requireCollection(): Collection<Booking> {
    if (!this.collection) {
      throw new Error('MongoStore.init() must be awaited before using the store')
    }
    return this.collection
  }
}

/** Picks MongoDB when MONGODB_URI is set, otherwise the JSON-file store. */
export function createStoreFromEnv(env: NodeJS.ProcessEnv = process.env): Store {
  const uri = env.MONGODB_URI?.trim()
  if (uri) {
    return new MongoStore(uri, env.MONGODB_DB?.trim() || DEFAULT_DB_NAME)
  }
  return new FileStore(path.join(import.meta.dirname, '.data'))
}
