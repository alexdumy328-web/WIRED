import express from 'express'
import type { Request, RequestHandler, Response, Router } from 'express'
import { z } from 'zod'
import { catalog } from '../../src/data/catalog.ts'
import { clientIp } from '../auth/session.ts'
import { deviceName, workAsked } from '../documents/sheets.ts'
import { categoryOf } from '../documents/categories.ts'
import type { MailAttachment } from '../auth/outbox.ts'
import { CustomerConflictError, customerCreateSchema, customerPatchSchema } from './customers.ts'
import type { PlatformDeps } from './deps.ts'
import { isJpeg, MAX_PHOTO_BYTES, MAX_PHOTOS } from './photos.ts'
import { codeParam, forViewer, issues, sendPdf } from './routes.ts'
import { WarrantyExistsError } from './warranties.ts'

type Handler = (req: Request, res: Response) => Promise<void>
const handle = (fn: Handler) => fn

const text = (max: number) => z.string().trim().max(max)
const intakeFields = {
  deviceType: z.string().trim().min(2).max(60),
  serial: text(80).optional(),
  accessories: text(300).optional(),
  appearance: text(600).optional(),
}
const intakeSchema = z.object({ ...intakeFields, email: z.boolean().default(true) }).strict()
const intakePatchSchema = z.object(intakeFields).partial().strict()

const walkInSchema = z
  .object({
    customerId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
    customer: customerCreateSchema.optional(),
    device: z.object({ brand: text(60).optional(), model: text(60).optional() }).default({}),
    ...intakeFields,
    issue: z.string().trim().min(3).max(1500),
    jobIds: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
    estimate: z
      .object({ priceFrom: z.number().int().min(0).max(1_000_000), priceTo: z.number().int().min(0).max(1_000_000) })
      .refine((e) => e.priceFrom <= e.priceTo, 'priceFrom must not exceed priceTo')
      .default({ priceFrom: 0, priceTo: 0 }),
    lang: z.enum(['ro', 'en']).default('ro'),
    email: z.boolean().default(true),
  })
  .strict()
  .refine((v) => Boolean(v.customerId) !== Boolean(v.customer), { message: 'Send either customerId or customer', path: ['customer'] })

const listSchema = z.object({
  q: text(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).max(100_000).default(0),
})
const idParam = z.string().regex(/^[a-f0-9]{24}$/)

const warrantyBodySchema = z
  .object({
    months: z.number().int().min(1).max(60).optional(),
    work: text(1000).optional(),
    email: z.boolean().default(true),
  })
  .strict()

/**
 * The workshop: service sheets, walk-ins, the customer list, warranties and intake photos.
 * Mounted on the admin router, so every route already has a staff viewer.
 */
export function mountWorkshop(admin: Router, deps: PlatformDeps, managers: RequestHandler) {
  const { bookings, customers, warranties, photos, documents, notifier, audit } = deps
  const write = deps.limiters.create('admin-workshop', 60_000, 60)
  const actorOf = (res: Response) => {
    const v = res.locals.viewer!
    return { id: v.id, name: v.name || v.email }
  }
  const record = (req: Request, res: Response, action: string, target: string, detail: Record<string, unknown> = {}) => {
    const v = res.locals.viewer!
    return audit.record({ action, actor: { id: v.id, email: v.email, role: v.role }, target, detail, ip: clientIp(req) })
  }
  const bad = (res: Response, error: z.ZodError) => {
    res.status(400).json({ error: 'invalid', issues: issues(error) })
  }

  // ---- service sheets ---------------------------------------------------------------------
  admin.post('/bookings/:code/intake', write, handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const body = intakeSchema.safeParse(req.body)
    if (!code.success) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (!body.success) return bad(res, body.error)
    const { email, ...fields } = body.data
    // Older bookings may not be on the customer list yet; the sheet should know who it belongs to.
    await customers.linkBooking(code.data.toUpperCase())
    const result = await bookings.intake(code.data, fields, actorOf(res))
    if ('error' in result) {
      const status = result.error === 'not_found' ? 404 : 409
      res.status(status).json({ error: result.error })
      return
    }
    const booking = result.booking
    await record(req, res, 'booking_intake', booking.code, { sheet: `${booking.intake!.number}/${booking.intake!.year}` })
    let notified: 'sent' | 'failed' | 'skipped' = 'skipped'
    if (email) {
      const sheet = await documents.intake(booking).catch(() => null)
      notified = sheet ? await notifier.intakeReceived(booking, sheet) : 'failed'
    }
    res.status(201).json({ ...forViewer(res.locals.viewer!, booking), notified })
  }))

  admin.patch('/bookings/:code/intake', write, handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const body = intakePatchSchema.safeParse(req.body)
    if (!code.success) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (!body.success) return bad(res, body.error)
    const booking = await bookings.editIntake(code.data, body.data)
    if (!booking) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    await record(req, res, 'booking_intake_edit', booking.code, { fields: Object.keys(body.data) })
    res.json(forViewer(res.locals.viewer!, booking))
  }))

  admin.get('/bookings/:code/intake.pdf', handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const booking = code.success ? await bookings.raw(code.data) : null
    if (!booking?.intake) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    sendPdf(res, await documents.intake(booking))
  }))

  admin.post('/walk-ins', write, handle(async (req, res) => {
    const body = walkInSchema.safeParse(req.body)
    if (!body.success) return bad(res, body.error)
    const input = body.data
    const unknownJob = input.jobIds.find((id) => !catalog.some((j) => j.id === id && j.mode === 'shop'))
    if (unknownJob) {
      res.status(400).json({ error: 'invalid', issues: [{ path: ['jobIds'], message: `Unknown workshop job ${unknownJob}` }] })
      return
    }
    let customer
    if (input.customerId) {
      customer = await customers.get(input.customerId)
      if (!customer) {
        res.status(404).json({ error: 'customer_not_found' })
        return
      }
    } else {
      try {
        customer = await customers.create(input.customer!)
      } catch (error) {
        if (error instanceof CustomerConflictError) {
          res.status(409).json({ error: 'customer_exists', customerId: error.existingId })
          return
        }
        throw error
      }
    }
    const booking = await bookings.createWalkIn(
      {
        customerId: customer.id,
        contact: { name: customer.name, phone: customer.phone ?? '', ...(customer.email ? { email: customer.email } : {}) },
        device: input.device,
        issue: input.issue,
        jobIds: input.jobIds,
        estimate: input.estimate,
        lang: input.lang,
        intake: { deviceType: input.deviceType, serial: input.serial, accessories: input.accessories, appearance: input.appearance },
      },
      actorOf(res),
    )
    await customers.touch(customer.id)
    await record(req, res, 'walk_in', booking.code, { sheet: `${booking.intake!.number}/${booking.intake!.year}`, newCustomer: !input.customerId })
    let notified: 'sent' | 'failed' | 'skipped' = 'skipped'
    if (input.email && booking.contact.email) {
      const sheet = await documents.intake(booking).catch(() => null)
      notified = sheet ? await notifier.intakeReceived(booking, sheet) : 'failed'
    }
    res.status(201).json({ ...forViewer(res.locals.viewer!, booking), notified })
  }))

  // ---- customers --------------------------------------------------------------------------
  admin.get('/customers', handle(async (req, res) => {
    const parsed = listSchema.extend({ archived: z.enum(['yes', 'no']).optional() }).safeParse(req.query)
    if (!parsed.success) return bad(res, parsed.error)
    res.json(await customers.list({ ...parsed.data, archived: parsed.data.archived === 'yes' }))
  }))

  admin.post('/customers', write, handle(async (req, res) => {
    const body = customerCreateSchema.safeParse(req.body)
    if (!body.success) return bad(res, body.error)
    try {
      const customer = await customers.create(body.data)
      await record(req, res, 'customer_create', customer.id)
      res.status(201).json(customer)
    } catch (error) {
      if (error instanceof CustomerConflictError) {
        res.status(409).json({ error: 'customer_exists', customerId: error.existingId })
        return
      }
      throw error
    }
  }))

  admin.get('/customers/:id', handle(async (req, res) => {
    const id = idParam.safeParse(req.params.id)
    const customer = id.success ? await customers.get(id.data) : null
    if (!customer) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const viewer = res.locals.viewer!
    const [jobs, certs] = await Promise.all([bookings.forCustomer(customer.id), warranties.forCustomer(customer.id)])
    res.json({ customer, jobs: jobs.map((b) => forViewer(viewer, b)), warranties: certs })
  }))

  admin.patch('/customers/:id', write, handle(async (req, res) => {
    const id = idParam.safeParse(req.params.id)
    const body = customerPatchSchema.safeParse(req.body)
    if (!id.success) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (!body.success) return bad(res, body.error)
    const result = await customers.update(id.data, body.data)
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : result.error === 'conflict' ? 409 : 400
      res.status(status).json({ error: result.error, ...(result.message ? { issues: [{ path: [], message: result.message }] } : {}) })
      return
    }
    await record(req, res, 'customer_edit', id.data, { fields: Object.keys(body.data) })
    res.json(result.customer)
  }))

  admin.post('/customers/:id/archive', write, managers, handle(async (req, res) => {
    const id = idParam.safeParse(req.params.id)
    const body = z.object({ archived: z.boolean() }).strict().safeParse(req.body)
    if (!body.success) return bad(res, body.error)
    const customer = id.success ? await customers.archive(id.data, body.data.archived) : null
    if (!customer) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    await record(req, res, body.data.archived ? 'customer_archive' : 'customer_restore', customer.id)
    res.json(customer)
  }))

  // ---- warranties -------------------------------------------------------------------------
  admin.get('/warranties', handle(async (req, res) => {
    const parsed = listSchema.extend({ state: z.enum(['valid', 'expiring', 'expired', 'void']).optional() }).safeParse(req.query)
    if (!parsed.success) return bad(res, parsed.error)
    res.json(await warranties.search(parsed.data))
  }))

  admin.post('/bookings/:code/warranty', write, handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const body = warrantyBodySchema.safeParse(req.body)
    if (!code.success) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (!body.success) return bad(res, body.error)
    const booking = await bookings.raw(code.data)
    if (!booking) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    // A certificate covers work that was done: only once the device is ready or handed back.
    if (booking.status !== 'ready' && booking.status !== 'done') {
      res.status(409).json({ error: 'not_finished' })
      return
    }
    const months = body.data.months ?? (await deps.settings.get()).documents.warrantyMonths[categoryOf(booking)]
    if (!months) {
      res.status(400).json({ error: 'invalid', issues: [{ path: ['months'], message: 'This kind of job has no default warranty; send months' }] })
      return
    }
    const work = body.data.work || booking.repair?.workDone || workAsked(booking) || booking.issue
    let warranty
    try {
      warranty = await warranties.issue({
        bookingCode: booking.code,
        ...(booking.intake ? { sheet: `${booking.intake.number}/${booking.intake.year}` } : {}),
        ...(booking.customerId ? { customerId: booking.customerId } : {}),
        customerName: booking.contact.name,
        device: deviceName(booking),
        work,
        months,
        issuedBy: actorOf(res).name,
      })
    } catch (error) {
      if (error instanceof WarrantyExistsError) {
        res.status(409).json({ error: 'warranty_exists', warrantyId: error.existingId })
        return
      }
      throw error
    }
    await record(req, res, 'warranty_issue', booking.code, { warranty: warranty.label, months })
    // While the job is still "ready" the certificate rides along with the hand-back email instead.
    let notified: 'sent' | 'failed' | 'skipped' = 'skipped'
    if (body.data.email && booking.status === 'done') {
      const file: MailAttachment | null = await documents.warranty(warranty, booking).catch(() => null)
      notified = file ? await notifier.warrantyIssued(booking, warranty.label, warranty.endsOn, file) : 'failed'
    }
    res.status(201).json({ ...warranty, notified })
  }))

  admin.get('/warranties/:id.pdf', handle(async (req, res) => {
    const warranty = await warranties.get(String(req.params.id))
    if (!warranty) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    sendPdf(res, await documents.warranty(warranty, await bookings.raw(warranty.bookingCode)))
  }))

  admin.post('/warranties/:id/void', write, managers, handle(async (req, res) => {
    const body = z.object({ reason: z.string().trim().min(3).max(300) }).strict().safeParse(req.body)
    if (!body.success) return bad(res, body.error)
    const warranty = await warranties.void(String(req.params.id), actorOf(res).name, body.data.reason)
    if (!warranty) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    await record(req, res, 'warranty_void', warranty.bookingCode, { warranty: warranty.label })
    res.json(warranty)
  }))

  // ---- intake photos ----------------------------------------------------------------------
  const rawJpeg = express.raw({ type: 'image/jpeg', limit: MAX_PHOTO_BYTES })
  admin.post('/bookings/:code/photos', write, rawJpeg, handle(async (req, res) => {
    const code = codeParam.safeParse(req.params.code)
    const booking = code.success ? await bookings.raw(code.data) : null
    if (!booking) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const body = req.body as unknown
    if (!Buffer.isBuffer(body) || !isJpeg(body)) {
      res.status(415).json({ error: 'jpeg_only' })
      return
    }
    if ((booking.photoIds?.length ?? 0) >= MAX_PHOTOS) {
      res.status(409).json({ error: 'too_many_photos', max: MAX_PHOTOS })
      return
    }
    const id = await photos.add(booking.code, body, actorOf(res).name)
    await bookings.attachPhoto(booking.code, id)
    res.status(201).json({ id })
  }))

  admin.get('/photos/:id', handle(async (req, res) => {
    const photo = await photos.get(String(req.params.id))
    if (!photo) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    // The id never changes for the same bytes, so the browser may keep it for a day.
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400, immutable' })
    res.send(photo.data)
  }))

  admin.delete('/photos/:id', write, handle(async (req, res) => {
    const removed = await photos.remove(String(req.params.id))
    if (!removed) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    await bookings.detachPhoto(removed.bookingCode, String(req.params.id))
    await record(req, res, 'photo_delete', removed.bookingCode)
    res.status(204).end()
  }))
}
