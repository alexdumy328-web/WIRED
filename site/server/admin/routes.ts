import express from 'express'
import type { Request, Response, Router } from 'express'
import { z } from 'zod'
import { bookingStatusSchema } from '../schema.ts'
import { clientIp } from '../auth/session.ts'
import { isDuplicateKeyError } from '../store.ts'
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
  /** What was charged for the repair, in whole lei. null clears it; leaving it out keeps it. */
  finalLei: z.number().int().min(0).max(1_000_000).nullable().optional(),
  /** Email the customer about a status change. On unless the owner unticks it. */
  notify: z.boolean().default(true),
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
  const handle = (fn: Handler) => fn

  // ---- the signed-in user ---------------------------------------------------------------
  router.get('/me', meLimit, handle(async (req, res) => {
    const viewer = await sessions.viewer(req)
    res.set('Cache-Control', 'no-store')
    res.json({ user: viewer, providers: { google: Boolean(deps.env.GOOGLE_CLIENT_ID && deps.env.GOOGLE_CLIENT_SECRET) } })
  }))

  router.get('/me/bookings', meLimit, sessions.requireAuth, handle(async (_req, res) => {
    const viewer = res.locals.viewer!
    res.set('Cache-Control', 'no-store')
    res.json({ bookings: await bookings.forUser(viewer) })
  }))

  router.get('/settings/public', handle(async (_req, res) => {
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

  admin.get('/bookings', handle(async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    res.json(await bookings.search(parsed.data))
  }))

  admin.get('/bookings/:code', handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const found = code.success ? await bookings.detail(code.data) : null
    if (!found) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json(found)
  }))

  admin.patch('/bookings/:code/status', statusLimit, handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const body = statusBodySchema.safeParse(req.body)
    if (!code.success || !body.success) {
      res.status(body.success ? 404 : 400).json(body.success ? { error: 'not_found' } : { error: 'invalid', issues: issues(body.error) })
      return
    }
    const viewer = res.locals.viewer!
    const { status, note, finalLei, notify } = body.data
    let result: Awaited<ReturnType<typeof bookings.update>>
    try {
      result = await bookings.update(code.data, { status, note, finalLei }, { id: viewer.id, name: viewer.name || viewer.email })
    } catch (error) {
      // Reopening a cancelled booking whose slot someone else has taken since.
      if (isDuplicateKeyError(error)) {
        res.status(409).json({ error: 'slot_taken' })
        return
      }
      throw error
    }
    if (!result) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (result.changed) await audit.record({
      action: 'booking_status',
      actor: { id: viewer.id, email: viewer.email, role: viewer.role },
      target: result.booking.code,
      detail: {
        from: result.from,
        to: status,
        note: Boolean(note),
        ...(result.priceChanged ? { finalLei: [result.fromLei, finalLei ?? null] } : {}),
      },
      ip: clientIp(req),
    })
    // The customer hears about a new status, never about a note or a price edit on its own.
    const notified = result.statusChanged && notify ? await deps.notifier.statusChanged(result.booking) : 'skipped'
    res.json({ ...result.booking, notified })
  }))

  admin.get('/calendar', handle(async (req, res) => {
    const parsed = z.object({ week: dateParam.optional() }).safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    res.json(await bookings.calendar(parsed.data.week ?? localDate(new Date())))
  }))

  admin.get('/pickups', handle(async (req, res) => {
    const parsed = z.object({ date: dateParam.optional() }).safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    const date = parsed.data.date ?? localDate(new Date())
    res.json({ date, jobs: await bookings.pickups(date) })
  }))

  admin.get('/stats', handle(async (_req, res) => {
    res.json(await bookings.stats())
  }))

  admin.get('/settings', handle(async (_req, res) => {
    res.json(await settings.get())
  }))

  admin.put('/settings', handle(async (req, res) => {
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
