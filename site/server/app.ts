import { existsSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import type { ZodError } from 'zod'
import { generateCode } from './code.ts'
import { bookingRequestSchema, statusUpdateSchema } from './schema.ts'
import type { Store } from './store.ts'
import type { Booking, ServiceMode } from '../src/types.ts'

export type CreateAppOptions = {
  /** Explicit token, or null to force the admin endpoint off. Defaults to env ADMIN_TOKEN. */
  adminToken?: string | null
  /** Absolute path to a built frontend; only served when the folder has an index.html. */
  distDir?: string
  rateLimit?: { windowMs?: number; max?: number }
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 10
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function formatIssues(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)),
    message: issue.message,
    code: issue.code,
  }))
}

function errorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { type?: unknown; status?: unknown; statusCode?: unknown }
    if (candidate.type === 'entity.too.large') return 413
    if (candidate.type === 'entity.parse.failed') return 400
    const status = candidate.status ?? candidate.statusCode
    if (typeof status === 'number' && status >= 400 && status < 600) return status
  }
  return 500
}

export function createApp(store: Store, options: CreateAppOptions = {}): Express {
  const app = express()
  app.disable('x-powered-by')

  const adminToken =
    options.adminToken === undefined ? process.env.ADMIN_TOKEN : options.adminToken
  const rateWindowMs = options.rateLimit?.windowMs ?? RATE_LIMIT_WINDOW_MS
  const rateMax = options.rateLimit?.max ?? RATE_LIMIT_MAX
  const rateHits = new Map<string, { count: number; resetAt: number }>()

  app.use(express.json({ limit: '20kb' }))

  /** Ten booking attempts per IP per ten minutes; the map lives for the app's lifetime. */
  function bookingRateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now()
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    let entry = rateHits.get(key)

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + rateWindowMs }
      rateHits.set(key, entry)
      if (rateHits.size > 5000) {
        for (const [ip, hit] of rateHits) {
          if (now >= hit.resetAt) rateHits.delete(ip)
        }
      }
    }

    entry.count += 1
    if (entry.count > rateMax) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.resetAt - now) / 1000)))
      res.status(429).json({ error: 'rate_limited' })
      return
    }
    next()
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, store: store.kind })
  })

  app.post('/api/bookings', bookingRateLimit, async (req, res) => {
    const parsed = bookingRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: formatIssues(parsed.error) })
      return
    }

    const data = parsed.data
    const slot = new Date(data.slot).toISOString()

    if (await store.hasSlot(data.mode, slot)) {
      res.status(409).json({ error: 'slot_taken' })
      return
    }

    const now = new Date().toISOString()
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const booking: Booking = {
        ...data,
        slot,
        code: generateCode(),
        status: 'received',
        createdAt: now,
        updatedAt: now,
      }
      if (await store.insertBooking(booking)) {
        res.status(201).json({ code: booking.code, status: booking.status, slot: booking.slot })
        return
      }
    }

    throw new Error('Could not allocate a unique booking code')
  })

  app.get('/api/bookings/:code', async (req, res) => {
    const booking = await store.findByCode(req.params.code)
    if (!booking) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    // Public view: never expose contact details, the issue text or the address.
    res.json({
      code: booking.code,
      status: booking.status,
      mode: booking.mode,
      jobIds: booking.jobIds,
      slot: booking.slot,
      updatedAt: booking.updatedAt,
    })
  })

  app.get('/api/slots', async (req, res) => {
    const { mode, from, to } = req.query

    if (mode !== 'shop' && mode !== 'mobile') {
      res.status(400).json({ error: 'invalid', message: 'mode must be "shop" or "mobile"' })
      return
    }
    if (typeof from !== 'string' || !DATE_ONLY.test(from) || typeof to !== 'string' || !DATE_ONLY.test(to)) {
      res.status(400).json({ error: 'invalid', message: 'from and to must be YYYY-MM-DD dates' })
      return
    }

    const fromMs = Date.parse(`${from}T00:00:00.000Z`)
    const toMs = Date.parse(`${to}T00:00:00.000Z`)
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      res.status(400).json({ error: 'invalid', message: 'from and to must be valid dates' })
      return
    }
    if (toMs < fromMs) {
      res.status(400).json({ error: 'invalid', message: 'to must not be before from' })
      return
    }
    if ((toMs - fromMs) / DAY_MS + 1 > 31) {
      res.status(400).json({ error: 'invalid', message: 'Date range is limited to 31 days' })
      return
    }

    const serviceMode: ServiceMode = mode === 'mobile' ? 'mobile' : 'shop'
    const taken = await store.takenSlots(serviceMode, fromMs, toMs + DAY_MS - 1)
    res.json({ taken })
  })

  app.get('/api/stats', async (_req, res) => {
    const active = await store.listActive()
    const byCategoryHint: Record<string, number> = {}
    for (const booking of active) {
      const firstJob = booking.jobIds[0]
      const hint = firstJob ? firstJob.split('-')[0] : 'custom'
      byCategoryHint[hint] = (byCategoryHint[hint] ?? 0) + 1
    }
    res.json({ queue: active.length, byCategoryHint })
  })

  app.patch('/api/bookings/:code/status', async (req, res) => {
    if (!adminToken) {
      res.status(503).json({ error: 'admin_disabled' })
      return
    }
    if (req.get('x-admin-token') !== adminToken) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const parsed = statusUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: formatIssues(parsed.error) })
      return
    }

    const booking = await store.updateStatus(req.params.code, parsed.data.status)
    if (!booking) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ code: booking.code, status: booking.status, updatedAt: booking.updatedAt })
  })

  // Unknown API routes stay JSON; they never fall through to the SPA shell.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' })
  })

  const distDir =
    options.distDir && existsSync(path.join(options.distDir, 'index.html')) ? options.distDir : null

  if (distDir) {
    app.use(express.static(distDir, { maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) {
        next()
        return
      }
      res.sendFile(path.join(distDir, 'index.html'))
    })
  }

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error)
      return
    }
    const status = errorStatus(error)
    if (status >= 500) {
      console.error('[api] unhandled error:', error instanceof Error ? error.message : error)
    }
    const code = status === 413 ? 'payload_too_large' : status === 400 ? 'invalid' : 'server_error'
    res.status(status).json({ error: code })
  })

  return app
}
