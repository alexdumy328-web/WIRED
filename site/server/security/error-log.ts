/**
 * Last 200 server errors: an in-process ring buffer, plus a capped Mongo collection
 * (`error_log`) when one is attached so errors survive restarts and serverless cold starts.
 * Everything is scrubbed of personal data before it is stored.
 */
import type { Collection, Db } from 'mongodb'
import { describeError } from './scrub.ts'

export type ErrorEntry = {
  at: string
  method?: string
  path?: string
  status?: number
  name: string
  message: string
  stack?: string
}

const MAX = 200
const ring: ErrorEntry[] = []
let sink: Collection<ErrorEntry> | null = null

export async function attachErrorLog(db: Db): Promise<void> {
  const exists = await db.listCollections({ name: 'error_log' }, { nameOnly: true }).hasNext()
  if (!exists) {
    try {
      await db.createCollection('error_log', { capped: true, size: 2 * 1024 * 1024, max: MAX })
    } catch {
      // Another instance created it first.
    }
  }
  sink = db.collection<ErrorEntry>('error_log')
}

export function detachErrorLog(): void {
  sink = null
}

/** Strips query strings and anything that looks like an id or code from a path. */
function cleanPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  return path
    .split('?')[0]
    .replace(/NT-[A-Z0-9]{4}/gi, 'NT-****')
    .replace(/[a-f0-9]{24}/gi, ':id')
    .slice(0, 200)
}

export function recordError(error: unknown, context: { method?: string; path?: string; status?: number } = {}): void {
  const entry: ErrorEntry = {
    at: new Date().toISOString(),
    ...(context.method ? { method: context.method } : {}),
    ...(context.path ? { path: cleanPath(context.path) } : {}),
    ...(context.status ? { status: context.status } : {}),
    ...describeError(error),
  }
  ring.push(entry)
  if (ring.length > MAX) ring.splice(0, ring.length - MAX)
  if (sink) void sink.insertOne({ ...entry }).catch(() => {})
}

export async function recentErrors(limit = MAX): Promise<ErrorEntry[]> {
  if (sink) {
    try {
      const docs = await sink.find({}, { projection: { _id: 0 } }).sort({ $natural: -1 }).limit(limit).toArray()
      return docs
    } catch {
      // Fall back to memory.
    }
  }
  return ring.slice(-limit).reverse()
}
