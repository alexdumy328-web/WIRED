import { createHmac } from 'node:crypto'
import type { Db } from 'mongodb'

export type AuditActor = { id: string; email?: string; role?: string } | null

export type AuditEntry = {
  at: string
  action: string
  actor: AuditActor
  target?: string
  detail?: Record<string, unknown>
  /** HMAC of the client IP; the address itself is never stored. */
  ipHash?: string
}

export type AuditLog = {
  record(entry: { action: string; actor: AuditActor; target?: string; detail?: Record<string, unknown>; ip?: string | null }): Promise<void>
  list(limit?: number): Promise<AuditEntry[]>
}

const COLLECTION = 'audit_log'
const YEAR_SECONDS = 365 * 24 * 3600

export function hashIp(secret: string, ip: string | null | undefined): string | undefined {
  if (!ip) return undefined
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 20)
}

/** Who did what and when. Sign-ins, role changes, status changes, settings changes. */
export function createAuditLog(db: Db, secret: string): AuditLog {
  const collection = db.collection(COLLECTION)
  let indexReady: Promise<unknown> | null = null
  return {
    async record({ action, actor, target, detail, ip }) {
      try {
        indexReady ??= collection.createIndex({ at: 1 }, { expireAfterSeconds: YEAR_SECONDS, name: 'ttl_1y' }).catch(() => undefined)
        await indexReady
        await collection.insertOne({
          at: new Date(),
          action,
          actor,
          ...(target ? { target } : {}),
          ...(detail ? { detail } : {}),
          ...(ip ? { ipHash: hashIp(secret, ip) } : {}),
        })
      } catch (error) {
        // An audit write must never break the request that caused it.
        console.error('[audit] write failed:', error instanceof Error ? error.name : 'error')
      }
    },

    async list(limit = 100) {
      const docs = await collection.find({}).sort({ at: -1 }).limit(Math.min(limit, 500)).toArray()
      return docs.map((doc) => ({
        at: new Date(doc.at as Date).toISOString(),
        action: String(doc.action),
        actor: (doc.actor as AuditActor) ?? null,
        ...(doc.target ? { target: String(doc.target) } : {}),
        ...(doc.detail ? { detail: doc.detail as Record<string, unknown> } : {}),
        ...(doc.ipHash ? { ipHash: String(doc.ipHash) } : {}),
      }))
    },
  }
}
