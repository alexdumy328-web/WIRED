import express from 'express'
import type { Request, Response, Router } from 'express'
import { z } from 'zod'
import { bookingStatusSchema } from '../schema.ts'
import { clientIp } from '../auth/session.ts'
import { isDuplicateKeyError } from '../store.ts'
import { isManager } from '../auth/roles.ts'
import type { Viewer } from '../auth/session.ts'
import { categoryOf } from '../documents/categories.ts'
import type { PlatformDeps } from './deps.ts'
import { localDate, isRealDate, DATE_ONLY } from './time.ts'
import { mountWorkshop } from './workshop-routes.ts'

export function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.map(String), message: i.message, code: i.code }))
}

const dateParam = z.string().regex(DATE_ONLY).refine(isRealDate, 'Not a real date')

const searchQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  /** shop: visits at the workshop; pickup: shop jobs we collect or deliver; mobile: on site. */
  mode: z.enum(['shop', 'pickup', 'mobile']).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  q: z.string().trim().max(100).optional(),
  intake: z.enum(['yes', 'no']).transform((v) => v === 'yes').optional(),
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
  /** Workshop notes. A field sent as "" is cleared; a field left out is kept. */
  repair: z
    .object({ diagnosis: z.string().trim().max(2000), workDone: z.string().trim().max(2000), partsUsed: z.string().trim().max(1000) })
    .partial()
    .strict()
    .optional(),
})

export const codeParam = z.string().trim().regex(/^NT-[A-Z0-9]{4}$/i)

/** Technicians work on devices but do not see what was charged. */
export function forViewer<T extends { finalLei?: number }>(viewer: Viewer, booking: T): T {
  if (isManager(viewer.role)) return booking
  const { finalLei: _hidden, ...rest } = booking
  return rest as T
}

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
  const staff = sessions.requireRole('technician', 'owner', 'dev')
  /** After `staff`: money, settings, stats, archiving and voiding are for owners and devs. */
  const managers: express.RequestHandler = (_req, res, next) => {
    if (!isManager(res.locals.viewer!.role)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    next()
  }
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
    const mine = await bookings.forUser(viewer)
    // Each job's running warranty, so the account page can show it and offer the PDF.
    const warranties = await deps.warranties.forBookings(mine.map((b) => b.code))
    const byCode = new Map(warranties.map((w) => [w.bookingCode, { id: w.id, label: w.label, startsOn: w.startsOn, endsOn: w.endsOn, months: w.months, state: w.state }]))
    res.json({ bookings: mine.map((b) => ({ ...b, ...(byCode.has(b.code) ? { warranty: byCode.get(b.code) } : {}) })) })
  }))

  router.get('/me/bookings/:code/intake.pdf', meLimit, sessions.requireAuth, handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const booking = code.success ? await bookings.ownedBy(code.data, res.locals.viewer!) : null
    if (!booking?.intake) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    sendPdf(res, await deps.documents.intake(booking))
  }))

  router.get('/me/warranties/:id.pdf', meLimit, sessions.requireAuth, handle(async (req, res) => {
    const warranty = await deps.warranties.get(String(req.params.id))
    const booking = warranty ? await bookings.ownedBy(warranty.bookingCode, res.locals.viewer!) : null
    if (!warranty || !booking) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    sendPdf(res, await deps.documents.warranty(warranty, booking))
  }))

  router.get('/settings/public', handle(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60')
    res.json(await settings.publicView())
  }))

  // ---- owner ----------------------------------------------------------------------------
  const admin = express.Router()
  admin.use(adminLimit, staff)
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
    const viewer = res.locals.viewer!
    const found = await bookings.search(parsed.data)
    res.json({ ...found, items: found.items.map((b) => forViewer(viewer, b)) })
  }))

  admin.get('/bookings/:code', handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const found = code.success ? await bookings.detail(code.data) : null
    if (!found) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const [warranties, customer, current] = await Promise.all([
      deps.warranties.forBooking(found.code),
      found.customerId ? deps.customers.get(found.customerId) : null,
      settings.get(),
    ])
    res.json({
      ...forViewer(res.locals.viewer!, found),
      warranties,
      customer,
      defaults: { warrantyMonths: current.documents.warrantyMonths[categoryOf(found)] },
    })
  }))

  admin.patch('/bookings/:code/status', statusLimit, handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const body = statusBodySchema.safeParse(req.body)
    if (!code.success || !body.success) {
      res.status(body.success ? 404 : 400).json(body.success ? { error: 'not_found' } : { error: 'invalid', issues: issues(body.error) })
      return
    }
    const viewer = res.locals.viewer!
    const { status, note, finalLei, notify, repair } = body.data
    if (finalLei !== undefined && !isManager(viewer.role)) {
      res.status(403).json({ error: 'forbidden', reason: 'price_is_for_owners' })
      return
    }
    let result: Awaited<ReturnType<typeof bookings.update>>
    try {
      result = await bookings.update(code.data, { status, note, finalLei, repair }, { id: viewer.id, name: viewer.name || viewer.email })
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
        ...(result.repairChanged ? { repair: Object.keys(repair ?? {}) } : {}),
      },
      ip: clientIp(req),
    })
    // The customer hears about a new status, never about a note or a price edit on its own. On
    // hand-back, a warranty issued while the job was ready goes along as a PDF.
    let notified: 'sent' | 'failed' | 'skipped' = 'skipped'
    if (result.statusChanged && notify) {
      const valid = status === 'done' ? (await deps.warranties.forBooking(result.booking.code)).find((w) => !w.voided) : undefined
      const attachment = valid ? await deps.documents.warranty(valid, result.booking).catch(() => null) : null
      notified = await deps.notifier.statusChanged(result.booking, attachment ? [attachment] : undefined)
    }
    res.json({ ...forViewer(viewer, result.booking), notified })
  }))

  admin.get('/calendar', handle(async (req, res) => {
    const parsed = z.object({ week: dateParam.optional() }).safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    res.json(await bookings.calendar(parsed.data.week ?? localDate(new Date())))
  }))

  admin.get('/busy', handle(async (req, res) => {
    const parsed = z
      .object({ from: dateParam, to: dateParam })
      .refine((q) => q.from <= q.to && Date.parse(q.to) - Date.parse(q.from) <= 62 * 86_400_000, 'At most 62 days')
      .safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: issues(parsed.error) })
      return
    }
    res.json({ days: await bookings.busyDays(parsed.data.from, parsed.data.to) })
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

  admin.get('/stats', managers, handle(async (_req, res) => {
    const [stats, warranties] = await Promise.all([bookings.stats(), deps.warranties.counts()])
    res.json({ ...stats, warranties })
  }))

  admin.get('/settings', managers, handle(async (_req, res) => {
    res.json(await settings.get())
  }))

  admin.put('/settings', managers, handle(async (req, res) => {
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
    // Company details and terms: which fields moved, never their text.
    const texts: string[] = []
    for (const [k, v] of Object.entries(result.settings.company)) if (result.before.company[k as keyof typeof result.before.company] !== v) texts.push(`company.${k}`)
    for (const k of ['intakeTerms', 'warrantyTerms'] as const) if (result.before.documents[k] !== result.settings.documents[k]) texts.push(`documents.${k}`)
    for (const [k, v] of Object.entries(result.settings.documents.warrantyMonths)) {
      const was = result.before.documents.warrantyMonths[k as keyof typeof result.before.documents.warrantyMonths]
      if (was !== v) changed[`warrantyMonths.${k}`] = [was, v]
    }
    await audit.record({ action: 'settings_change', actor: { id: viewer.id, email: viewer.email, role: viewer.role }, detail: { changed, ...(texts.length ? { texts } : {}) }, ip: clientIp(req) })
    res.json(result.settings)
  }))

  mountWorkshop(admin, deps, managers)

  router.use('/admin', admin)
  return router
}

export function sendPdf(res: Response, file: { filename: string; content: Uint8Array }) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${file.filename}"`,
    'Cache-Control': 'private, no-store',
  })
  res.send(Buffer.from(file.content))
}
