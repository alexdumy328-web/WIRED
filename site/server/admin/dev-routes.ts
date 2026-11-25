import express from 'express'
import type { Request, Response, Router } from 'express'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { canAssignRole, isRole, ROLES } from '../auth/roles.ts'
import { clientIp } from '../auth/session.ts'
import { recentErrors } from '../security/error-log.ts'
import type { PlatformDeps } from './deps.ts'

const startedAt = Date.now()

/** Environment variable names the dev dashboard reports on (booleans only, never values). */
export const ENV_NAMES = [
  'MONGODB_URI',
  'MONGODB_DB',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'APP_ORIGINS',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'OWNER_EMAILS',
  'DEV_EMAILS',
  'DRIVER_EMAILS',
  'DEMO_EMAILS',
  'ADMIN_TOKEN',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
  'TRUST_PROXY',
  'PICKUP_DIESEL_LEI_PER_L',
  'PICKUP_CONSUMPTION_L_PER_100',
  'PICKUP_DRIVER_LEI_PER_HOUR',
  'PICKUP_STOP_MINUTES',
  'PICKUP_MIN_TRIP_LEI',
  'PICKUP_MAX_KM',
  'PICKUP_URGENT_FACTOR',
] as const

const REQUIRED_IN_PRODUCTION = new Set(['MONGODB_URI', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL'])

function packageVersion(name: string): string {
  try {
    const file = path.join(import.meta.dirname, '..', '..', 'node_modules', name, 'package.json')
    return String((JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }).version ?? 'unknown')
  } catch {
    return 'unknown'
  }
}

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
})
const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
const roleBody = z.object({ role: z.enum(ROLES) })

type Handler = (req: Request, res: Response) => Promise<void>

/** Dev dashboard APIs under /api/dev. Dev role only. */
export function createDevRouter(deps: PlatformDeps): Router {
  const router = express.Router()
  const { sessions, db, audit } = deps
  router.use(deps.limiters.create('dev', 60_000, 120), sessions.requireRole('dev'))
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  const handle = (fn: Handler) => fn

  router.get('/health', handle(async (_req, res) => {
    const started = performance.now()
    let mongo: { ok: boolean; ms: number } = { ok: false, ms: 0 }
    try {
      await db.command({ ping: 1 })
      mongo = { ok: true, ms: Math.round(performance.now() - started) }
    } catch {
      mongo = { ok: false, ms: Math.round(performance.now() - started) }
    }
    res.json({
      ok: mongo.ok,
      mongo,
      store: deps.storeKind,
      environment: deps.production ? 'production' : 'development',
      mail: deps.mailer.provider,
      // The unique index that stops two open bookings sharing a slot. Missing means no race protection.
      slotIndex: await db
        .collection('bookings')
        .indexExists('mode_slot_open_unique')
        .catch(() => false),
      google: Boolean(deps.env.GOOGLE_CLIENT_ID && deps.env.GOOGLE_CLIENT_SECRET),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      versions: {
        node: process.versions.node,
        betterAuth: packageVersion('better-auth'),
        mongodb: packageVersion('mongodb'),
        express: packageVersion('express'),
      },
    })
  }))

  router.get('/env', handle(async (_req, res) => {
    res.json({
      variables: ENV_NAMES.map((name) => ({
        name,
        set: Boolean(deps.env[name]?.trim()),
        requiredInProduction: REQUIRED_IN_PRODUCTION.has(name),
      })),
    })
  }))

  router.get('/errors', handle(async (_req, res) => {
    res.json({ errors: await recentErrors(200) })
  }))

  router.get('/audit', handle(async (req, res) => {
    const parsed = limitQuery.safeParse(req.query)
    res.json({ entries: await audit.list(parsed.success ? parsed.data.limit : 100) })
  }))

  router.get('/outbox', handle(async (_req, res) => {
    if (deps.production) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ messages: await deps.mailer.list(50) })
  }))

  router.get('/rate-limits', handle(async (_req, res) => {
    res.json({ limiters: deps.limiters.snapshot() })
  }))

  router.get('/users', handle(async (req, res) => {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid' })
      return
    }
    const { q, limit, skip } = parsed.data
    const filter = q ? { $or: [{ email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }] } : {}
    const users = db.collection('user')
    const [docs, total] = await Promise.all([
      users.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      users.countDocuments(filter),
    ])
    res.json({
      total,
      users: docs.map((doc) => ({
        id: String(doc.id ?? doc._id),
        email: String(doc.email ?? ''),
        name: String(doc.name ?? ''),
        emailVerified: doc.emailVerified === true,
        role: isRole(doc.role) ? doc.role : 'customer',
        createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : null,
      })),
    })
  }))

  router.patch('/users/:id/role', handle(async (req, res) => {
    const body = roleBody.safeParse(req.body)
    const id = z.string().trim().min(1).max(64).safeParse(req.params.id)
    if (!body.success || !id.success) {
      res.status(400).json({ error: 'invalid' })
      return
    }
    const viewer = res.locals.viewer!
    if (id.data === viewer.id) {
      // Stops the last dev from removing their own access by accident.
      res.status(400).json({ error: 'cannot_change_self' })
      return
    }
    const context = await deps.auth.$context
    const target = await context.internalAdapter.findUserById(id.data)
    if (!target) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const storedRole = (target as unknown as { role?: unknown }).role
    const current = isRole(storedRole) ? storedRole : 'customer'
    if (!canAssignRole(viewer.role, current, body.data.role)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    await context.internalAdapter.updateUser(id.data, { role: body.data.role })
    await audit.record({
      action: 'role_change',
      actor: { id: viewer.id, email: viewer.email, role: viewer.role },
      target: id.data,
      detail: { from: current, to: body.data.role },
      ip: clientIp(req),
    })
    res.json({ id: id.data, role: body.data.role })
  }))

  return router
}
