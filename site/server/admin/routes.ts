import express from 'express'
import type { Request, Response, Router } from 'express'
import { z } from 'zod'
import { bookingStatusSchema } from '../schema.ts'
import { clientIp } from '../auth/session.ts'
import type { PlatformDeps } from './deps.ts'
import { localDate, isRealDate, DATE_ONLY } from './time.ts'

function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.map(String), message: i.message, code: i.code }))
}

const dateParam = z.string().regex(DATE_ONLY).refine(isRealDate, 'Not a real date')

const searchQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  mode: z.enum(['shop', 'mobile']).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
})

const statusBodySchema = z.object({
  status: bookingStatusSchema,
  note: z.string().trim().max(500).optional(),
})

const codeParam = z.string().trim().regex(/^NT-[A-Z0-9]{4}$/i)

/** Express 5 allows async handlers; this keeps the signature short. */
type Handler = (req: Request, res: Response) => Promise<void>

/**
 * Owner and dev routes for bookings, calendar, pickups, stats and settings; plus the signed-in
 * user's own routes. Mounted under /api by the platform.
 */
export function createAdminRouter(deps: PlatformDeps): Router {
  const router = express.Router()
  const { sessions, bookings, settings, audit } = deps
  const adminLimit = deps.limiters.create('admin', 60_000, 240)
  const meLimit = deps.limiters.create('me', 60_000, 120)
  const statusLimit = deps.limiters.create('admin-status', 60_000, 60)
  const ownerOrDev = sessions.requireRole('owner', 'dev')
  const use = (fn: Handler) => fn

  // ---- the signed-in user ---------------------------------------------------------------
  router.get('/me', meLimit, use(async (req, res) => {
    const viewer = await sessions.viewer(req)
    res.set('Cache-Control', 'no-store')
    res.json({ user: viewer, providers: { google: Boolean(deps.env.GOOGLE_CLIENT_ID && deps.env.GOOGLE_CLIENT_SECRET) } })
  }))

  router.get('/me/bookings', meLimit, sessions.requireAuth, use(async (_req, res) => {
    const viewer = res.locals.viewer!
    res.set('Cache-Control', 'no-store')
    res.json({ bookings: await bookings.forUser(viewer) })
  }))

  router.get('/settings/public', use(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60')
    res.json(await settings.publicView())
  }))

  // ---- owner ----------------------------------------------------------------------------
  const admin = express.Router()
  admin.use(adminLimit, ownerOrDev)
  admin.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  admin.get('/bookings', use(async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    res.json(await bookings.search(parsed.data))
  }))

  admin.get('/bookings/:code', use(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const found = code.success ? await bookings.detail(code.data) : null
    if (!found) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json(found)
  }))

  admin.patch('/bookings/:code/status', statusLimit, use(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const body = statusBodySchema.safeParse(req.body)
    if (!code.success || !body.success) {
      res.status(body.success ? 404 : 400).json(body.success ? { error: 'not_found' } : { error: 'invalid', issues: issues(body.error) })
      return
    }
    const viewer = res.locals.viewer!
    const result = await bookings.changeStatus(code.data, body.data.status, { id: viewer.id, name: viewer.name || viewer.email }, body.data.note)
    if (!result) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (!('unchanged' in result)) await audit.record({
      action: 'booking_status',
      actor: { id: viewer.id, email: viewer.email, role: viewer.role },
      target: result.booking.code,
      detail: { from: result.from, to: body.data.status, note: Boolean(body.data.note) },
      ip: clientIp(req),
    })
    res.json(result.booking)
  }))

  admin.get('/calendar', use(async (req, res) => {
    const parsed = z.object({ week: dateParam.optional() }).safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    res.json(await bookings.calendar(parsed.data.week ?? localDate(new Date())))
  }))

  admin.get('/pickups', use(async (req, res) => {
    const parsed = z.object({ date: dateParam.optional() }).safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    const date = parsed.data.date ?? localDate(new Date())
    res.json({ date, jobs: await bookings.pickups(date) })
  }))

  admin.get('/stats', use(async (_req, res) => {
    res.json(await bookings.stats())
  }))

  admin.get('/settings', use(async (_req, res) => {
    res.json(await settings.get())
  }))

  admin.put('/settings', use(async (req, res) => {
    const result = await settings.update(req.body)
    if (!result.ok) {
      res.status(400).json({ error: 'invalid', issues: result.issues })
      return
    }
    const viewer = res.locals.viewer!
    // Record which numbers moved, never anything else.
    const changed: Record<string, [number, number]> = {}
    const flat = (s: typeof result.settings) => ({
      ...Object.fromEntries(Object.entries(s.pickup).map(([k, v]) => [`pickup.${k}`, v])),
      ...Object.fromEntries(Object.entries(s.labour.valueRate).map(([k, v]) => [`valueRate.${k}`, v])),
      ...Object.fromEntries(Object.entries(s.labour.consumablesFactor).map(([k, v]) => [`consumables.${k}`, v])),
    }) as Record<string, number>
    const a = flat(result.before)
    const b = flat(result.settings)
    for (const key of Object.keys(b)) if (a[key] !== b[key]) changed[key] = [a[key]!, b[key]!]
    await audit.record({ action: 'settings_change', actor: { id: viewer.id, email: viewer.email, role: viewer.role }, detail: { changed }, ip: clientIp(req) })
    res.json(result.settings)
  }))

  router.use('/admin', admin)
  return router
}
