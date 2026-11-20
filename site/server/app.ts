import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import type { ZodError } from 'zod'
import { generateCode } from './code.ts'
import { localDate } from './admin/time.ts'
import { catalog } from '../src/data/catalog.ts'
import { estimate as scriptEstimate } from '../src/lib/estimate.ts'
import { slotsFor } from '../src/lib/slots.ts'
import {
  createEstimateService,
  knownJobIds,
  resolveAiConfig,
  type AiConfigOverrides,
} from './estimate.ts'
import { createGeoService, inRomania } from './geo.ts'
import { createPickupService, resolvePickupRates } from './pickup-service.ts'
import { aiEstimateRequestSchema, bookingRequestSchema, statusUpdateSchema } from './schema.ts'
import type { Platform } from './platform.ts'
import { safeEqual } from './security/compare.ts'
import { recordError } from './security/error-log.ts'
import { securityHeadersMiddleware } from './security/headers.ts'
import { inlineScriptHashes } from './security/policy.ts'
import { SlotTakenError, type Store } from './store.ts'
import type { PickupRates, Trips } from '../src/lib/pickup.ts'
import type { AiEstimateRequest, Booking, ServiceMode } from '../src/types.ts'

export type CreateAppOptions = {
  /** Explicit token, or null to force the admin endpoint off. Defaults to env ADMIN_TOKEN. */
  adminToken?: string | null
  /** Absolute path to a built frontend; only served when the folder has an index.html. */
  distDir?: string
  rateLimit?: { windowMs?: number; max?: number }
  /** Separate limiter for POST /api/estimate. */
  estimateRateLimit?: { windowMs?: number; max?: number }
  /** AI provider overrides. apiKey null forces the estimate endpoint off; defaults to env. */
  ai?: AiConfigOverrides
  /** Injectable fetch for the AI provider; tests pass a mock so they never hit the network. */
  aiFetch?: typeof fetch
  /** Shared injected fetch for Photon/OSRM; tests pass a mock so they never hit the network. */
  upstreamFetch?: typeof fetch
  /** More specific injectable fetches for the geo and pickup services. */
  geoFetch?: typeof fetch
  pickupFetch?: typeof fetch
  /** Universal fallback used by the upstream services when no specific fetch is given. */
  fetchImpl?: typeof fetch
  fetch?: typeof fetch
  /** Separate limiter for /api/geo/* and /api/pickup/*. */
  upstreamRateLimit?: { windowMs?: number; max?: number }
  /** Public status lookup by code. Default 30 per 10 minutes per IP. */
  lookupRateLimit?: { windowMs?: number; max?: number }
  /** Pickup rate overrides (tests); env vars win over PICKUP_DEFAULTS, these win over env. */
  pickupRates?: Partial<PickupRates>
  /** Accounts, roles and dashboards. Without it the account routes answer 503. */
  platform?: Platform
  /** Force production-mode headers (HSTS). Defaults to NODE_ENV === 'production'. */
  production?: boolean
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 10
const ESTIMATE_RATE_LIMIT_MAX = 20
const UPSTREAM_RATE_LIMIT_MAX = 60
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function parseCoord(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseLang(value: unknown): 'ro' | 'en' | null {
  if (value === undefined) return 'ro'
  return value === 'ro' || value === 'en' ? value : null
}

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
  const estimateWindowMs = options.estimateRateLimit?.windowMs ?? RATE_LIMIT_WINDOW_MS
  const estimateMax = options.estimateRateLimit?.max ?? ESTIMATE_RATE_LIMIT_MAX
  const upstreamWindowMs = options.upstreamRateLimit?.windowMs ?? RATE_LIMIT_WINDOW_MS
  const upstreamMax = options.upstreamRateLimit?.max ?? UPSTREAM_RATE_LIMIT_MAX

  const production = options.production ?? process.env.NODE_ENV === 'production'
  const platform = options.platform
  const distIndex = options.distDir ? path.join(options.distDir, 'index.html') : null
  const scriptHashes = distIndex && existsSync(distIndex) ? inlineScriptHashes(readFileSync(distIndex, 'utf8')) : []
  app.use(securityHeadersMiddleware({ production, scriptHashes }))

  // Better Auth must see the raw request body, so it mounts before express.json().
  if (platform) {
    platform.mountEarly(app)
  } else {
    app.all('/api/auth/*splat', (_req, res) => {
      res.status(503).json({ error: 'auth_unavailable' })
    })
  }

  app.use(express.json({ limit: '20kb' }))

  /** One counter map per limiter; maps live for the app's lifetime. */
  function makeRateLimit(windowMs: number, max: number) {
    const hits = new Map<string, { count: number; resetAt: number }>()
    return function rateLimit(req: Request, res: Response, next: NextFunction) {
      const now = Date.now()
      const key = req.ip ?? req.socket.remoteAddress ?? 'unknown'
      let entry = hits.get(key)

      if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs }
        hits.set(key, entry)
        if (hits.size > 5000) {
          for (const [ip, hit] of hits) {
            if (now >= hit.resetAt) hits.delete(ip)
          }
        }
      }

      entry.count += 1
      if (entry.count > max) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.resetAt - now) / 1000)))
        res.status(429).json({ error: 'rate_limited' })
        return
      }
      next()
    }
  }

  /** Ten booking attempts per IP per ten minutes. */
  const bookingRateLimit = makeRateLimit(rateWindowMs, rateMax)
  /** Twenty estimate attempts per IP per ten minutes, on its own map. */
  const estimateRateLimit = makeRateLimit(estimateWindowMs, estimateMax)
  /** Sixty geo/pickup attempts per IP per ten minutes, on its own map. */
  const upstreamRateLimit = makeRateLimit(upstreamWindowMs, upstreamMax)
  // Codes are short, so the public lookup is throttled to stop anyone walking the code space.
  const lookupRateLimit = makeRateLimit(options.lookupRateLimit?.windowMs ?? 10 * 60_000, options.lookupRateLimit?.max ?? 30)

  const aiConfig = resolveAiConfig(options.ai, options.aiFetch)
  const estimateService = createEstimateService(aiConfig, platform ? () => platform.settings.labourRates() : undefined)

  const fallbackFetch =
    options.upstreamFetch ??
    options.geoFetch ??
    options.pickupFetch ??
    options.fetchImpl ??
    options.fetch ??
    globalThis.fetch
  const geoService = createGeoService(options.geoFetch ?? fallbackFetch)
  const baseRates = resolvePickupRates(options.pickupRates)
  const pickupService = createPickupService(
    options.pickupFetch ?? fallbackFetch,
    // Rates saved in the owner dashboard win over env and defaults.
    platform ? async () => ({ ...baseRates, ...(await platform.settings.pickupRates()) }) : baseRates,
    geoService,
  )

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, store: store.kind })
  })

  app.get('/api/geo/search', upstreamRateLimit, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (q.length < 3 || q.length > 120) {
      res.status(400).json({ error: 'invalid', message: 'q must be 3-120 characters' })
      return
    }

    const lang = parseLang(req.query.lang)
    if (!lang) {
      res.status(400).json({ error: 'invalid', message: 'lang must be "ro" or "en"' })
      return
    }

    const results = await geoService.search(q, lang)
    if (results === null) {
      res.status(502).json({ error: 'geo_unavailable' })
      return
    }
    res.json({ results })
  })

  app.get('/api/geo/reverse', upstreamRateLimit, async (req, res) => {
    const lat = parseCoord(req.query.lat)
    const lon = parseCoord(req.query.lon)
    if (lat === null || lon === null || !inRomania(lat, lon)) {
      res.status(400).json({ error: 'invalid', message: 'lat and lon must be inside Romania' })
      return
    }

    const lang = parseLang(req.query.lang)
    if (!lang) {
      res.status(400).json({ error: 'invalid', message: 'lang must be "ro" or "en"' })
      return
    }

    const place = await geoService.reverse(lat, lon, lang)
    if (!place) {
      res.status(502).json({ error: 'geo_unavailable' })
      return
    }
    res.json(place)
  })

  app.get('/api/pickup/quote', upstreamRateLimit, async (req, res) => {
    const lat = parseCoord(req.query.lat)
    const lon = parseCoord(req.query.lon)
    if (lat === null || lon === null || !inRomania(lat, lon)) {
      res.status(400).json({ error: 'invalid', message: 'lat and lon must be inside Romania' })
      return
    }

    const trips = req.query.trips === undefined ? 'both' : req.query.trips
    if (trips !== 'both' && trips !== 'pickup' && trips !== 'dropoff') {
      res.status(400).json({ error: 'invalid', message: 'trips must be "both", "pickup" or "dropoff"' })
      return
    }

    const urgent = req.query.urgent === '1'
    const quote = await pickupService.quote(lat, lon, trips as Trips, urgent)
    res.json(quote)
  })

  app.post('/api/estimate', estimateRateLimit, async (req, res) => {
    const parsed = aiEstimateRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: formatIssues(parsed.error) })
      return
    }

    // Without a key the site keeps its own script estimate; never call the provider.
    if (!aiConfig.apiKey) {
      res.status(503).json({ error: 'ai_unavailable' })
      return
    }

    const data = parsed.data
    const request: AiEstimateRequest = {
      lang: data.lang,
      mode: data.mode,
      jobIds: [...new Set(data.jobIds.filter((id) => knownJobIds.has(id)))],
      device: data.device,
      ...(data.deviceValue ? { deviceValue: data.deviceValue } : {}),
      issue: data.issue,
    }

    let estimate
    try {
      estimate = await estimateService.estimate(request)
    } catch {
      // Provider failures are reported as unavailable; never log the request text.
      res.status(503).json({ error: 'ai_unavailable' })
      return
    }

    if (!estimate) {
      res.status(503).json({ error: 'ai_unavailable' })
      return
    }
    res.json(estimate)
  })

  app.post('/api/bookings', bookingRateLimit, async (req, res) => {
    const parsed = bookingRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid', issues: formatIssues(parsed.error) })
      return
    }

    const data = parsed.data
    const slot = new Date(data.slot).toISOString()

    // Never trust the browser's numbers: jobs must exist for this mode, the slot must be one we
    // offer, and the price and transport are worked out again here from the price list and rates.
    const jobs = data.jobIds.map((id) => catalog.find((j) => j.id === id))
    if (jobs.some((j) => !j || j.mode !== data.mode)) {
      res.status(400).json({ error: 'invalid', issues: [{ path: 'jobIds', message: 'Unknown job for this mode' }] })
      return
    }
    // Urgent pickups may take today's windows from one hour ahead instead of two (as the form offers).
    const slotNow = data.pickup?.urgent ? new Date(Date.now() - 3600_000) : new Date()
    if (!slotsFor(localDate(slot), data.mode, slotNow).some((s) => s.start === slot)) {
      res.status(400).json({ error: 'invalid', issues: [{ path: 'slot', message: 'Not a bookable slot' }] })
      return
    }
    const priced = scriptEstimate(jobs as NonNullable<(typeof jobs)[number]>[], Boolean(data.custom), data.deviceValue)
    data.estimate = { priceFrom: priced.priceFrom, priceTo: priced.priceTo, etaHours: priced.etaHours }
    if (data.pickup) {
      const quote = await pickupService.quote(data.pickup.lat, data.pickup.lon, data.pickup.trips, data.pickup.urgent === true)
      if (quote.tooFar) {
        res.status(400).json({ error: 'invalid', issues: [{ path: 'pickup', code: 'too_far', message: 'Too far for pickup' }] })
        return
      }
      data.pickup.quote = { totalLei: quote.totalLei, oneWayKm: quote.oneWayKm, ...(quote.urgentLei ? { urgentLei: quote.urgentLei } : {}) }
    }

    if (await store.hasSlot(data.mode, slot)) {
      res.status(409).json({ error: 'slot_taken' })
      return
    }

    const now = new Date().toISOString()
    const userId = platform ? await platform.userId(req) : null
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const booking: Booking = {
        ...data,
        ...(userId ? { userId } : {}),
        statusHistory: [{ status: 'received', at: now, by: 'customer' }],
        slot,
        code: generateCode(),
        status: 'received',
        createdAt: now,
        updatedAt: now,
      }
      let inserted: boolean
      try {
        inserted = await store.insertBooking(booking)
      } catch (error) {
        if (error instanceof SlotTakenError) {
          res.status(409).json({ error: 'slot_taken' })
          return
        }
        throw error
      }
      if (inserted) {
        // Mail before answering: a serverless function may stop as soon as the response is sent.
        // The notifier never throws, so a mail problem never loses a booking.
        if (platform) await platform.notifier.bookingCreated(booking)
        res.status(201).json({ code: booking.code, status: booking.status, slot: booking.slot })
        return
      }
    }

    throw new Error('Could not allocate a unique booking code')
  })

  app.get('/api/bookings/:code', lookupRateLimit, async (req, res) => {
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
    if (!safeEqual(req.get('x-admin-token'), adminToken)) {
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

  if (platform) {
    platform.mountApi(app)
  } else {
    app.use(['/api/me', '/api/admin', '/api/dev'], (_req, res) => {
      res.status(503).json({ error: 'auth_unavailable' })
    })
  }

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

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error)
      return
    }
    const status = errorStatus(error)
    if (status >= 500) {
      console.error('[api] unhandled error:', error instanceof Error ? error.name : 'error')
      recordError(error, { method: req.method, path: req.path, status })
    }
    const code = status === 413 ? 'payload_too_large' : status === 400 ? 'invalid' : 'server_error'
    res.status(status).json({ error: code })
  })

  return app
}
