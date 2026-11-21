import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'
import express from 'express'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from './app.ts'
import { canAssignRole, bootstrapRole } from './auth/roles.ts'
import { createMailer, MailUnavailableError } from './auth/outbox.ts'
import { createSessionService, type SessionSource } from './auth/session.ts'
import { createPlatform, type Platform } from './platform.ts'
import { safeEqual } from './security/compare.ts'
import { securityHeaders } from './security/policy.ts'
import { MongoStore } from './store.ts'

const ORIGIN = 'http://localhost:5173'
const OWNER = 'owner@example.com'
const DEV = 'dev@example.com'
const ENV = {
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0123456789',
  BETTER_AUTH_URL: ORIGIN,
  OWNER_EMAILS: OWNER,
  DEV_EMAILS: DEV,
}

let mongo: MongoMemoryServer
let store: MongoStore
let platform: Platform
let server: Server
let base = ''

type Reply = { status: number; body: any; headers: Headers }

async function call(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}): Promise<Reply> {
  const response = await fetch(base + path, {
    method: init.method ?? 'GET',
    headers: {
      origin: ORIGIN,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body, headers: response.headers }
}

function cookieOf(reply: Reply): string {
  return reply.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

async function lastOtp(email: string): Promise<string> {
  const doc = await store.getDb().collection('dev_outbox').find({ to: email, kind: 'otp:sign-in' }).sort({ at: -1 }).limit(1).next()
  const match = /\b(\d{6})\b/.exec(String(doc?.text ?? ''))
  assert.ok(match, 'an OTP is in the dev outbox')
  return match[1]!
}

/** Sign in (or sign up) with an email code and return the session cookie. */
async function signIn(email: string): Promise<string> {
  const sent = await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' } })
  assert.equal(sent.status, 200)
  const reply = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: await lastOtp(email) } })
  assert.equal(reply.status, 200)
  const cookie = cookieOf(reply)
  assert.ok(cookie.length > 0, 'a session cookie is set')
  return cookie
}

const bookingBody = (email: string, slot: string) => ({
  mode: 'shop',
  jobIds: ['laptop-dc-jack'],
  custom: 'Laptop does not charge',
  device: { brand: 'Lenovo' },
  issue: 'Does not charge anymore',
  slot,
  contact: { name: 'Test Person', phone: '+40 721 123 456', email },
  estimate: { priceFrom: 100, priceTo: 200, etaHours: [1, 2] },
  lang: 'ro',
})

before(async () => {
  mongo = await MongoMemoryServer.create()
  store = new MongoStore(mongo.getUri(), 'norgelis_test')
  await store.init()
  platform = await createPlatform({ db: store.getDb(), env: ENV, production: false, quiet: true, rateLimitEnabled: false })
  const app = createApp(store, {
    platform,
    adminToken: null,
    // No network: OSRM and Photon always fail, so the pickup quote falls back to haversine.
    upstreamFetch: async () => new Response('nope', { status: 500 }),
  })
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(async () => {
  server?.closeAllConnections()
  server?.close()
  await store?.close()
  await mongo?.stop()
})

describe('auth mounting and headers', () => {
  test('Better Auth answers at /api/auth', async () => {
    const ok = await call('/api/auth/ok')
    assert.equal(ok.status, 200)
    assert.deepEqual(ok.body, { ok: true })
    const jwks = await call('/api/auth/jwks')
    assert.equal(jwks.status, 200)
    assert.ok(Array.isArray(jwks.body.keys))
  })

  test('security headers are on API responses and errors', async () => {
    for (const path of ['/api/health', '/api/nope', '/api/me']) {
      const reply = await call(path)
      assert.equal(reply.headers.get('x-content-type-options'), 'nosniff', path)
      assert.equal(reply.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path)
      assert.match(reply.headers.get('permissions-policy') ?? '', /geolocation=\(self\), camera=\(\), microphone=\(\)/, path)
      const csp = reply.headers.get('content-security-policy') ?? ''
      assert.match(csp, /frame-ancestors 'none'/, path)
      assert.match(csp, /tile\.openstreetmap\.org/, path)
      assert.doesNotMatch(csp, /unsafe-eval/, path)
      assert.equal(reply.headers.get('access-control-allow-origin'), null, path)
    }
  })

  test('HSTS only in production', () => {
    assert.equal(securityHeaders({ production: false })['Strict-Transport-Security'], undefined)
    assert.match(securityHeaders({ production: true })['Strict-Transport-Security'] ?? '', /max-age=\d+/)
  })

  test('the session cookie is httpOnly and SameSite=Lax', async () => {
    const email = 'cookie@example.com'
    await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' } })
    const reply = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: await lastOtp(email) } })
    const raw = reply.headers.getSetCookie().find((c) => c.includes('session_token')) ?? ''
    assert.match(raw, /HttpOnly/i)
    assert.match(raw, /SameSite=Lax/i)
  })
})

describe('email code sign-in', () => {
  test('the code locks after 5 wrong attempts', async () => {
    const email = 'lock@example.com'
    await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' } })
    const otp = await lastOtp(email)
    const wrong = otp === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i += 1) {
      const bad = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: wrong } })
      assert.equal(bad.status, 400, `attempt ${i + 1}`)
    }
    const locked = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp } })
    assert.equal(locked.status, 403)
    assert.equal(cookieOf(locked), '')
  })

  test('the dev outbox keeps the message and the console never gets the code', async () => {
    const items = await platform.mailer.list(10)
    assert.ok(items.some((item) => item.kind === 'otp:sign-in'))
  })
})

describe('role middleware', () => {
  function appWith(role: string | null) {
    const source: SessionSource = {
      async getSession() {
        return role ? { user: { id: 'u1', email: 'x@example.com', name: 'X', emailVerified: true, role } } : null
      },
    }
    const sessions = createSessionService(source, {}, null)
    const app = express()
    app.get('/owner', sessions.requireRole('owner', 'dev'), (_req, res) => {
      res.json({ ok: true })
    })
    return app
  }
  async function status(app: express.Express): Promise<number> {
    const s = app.listen(0)
    try {
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/owner`)
      return res.status
    } finally {
      s.close()
    }
  }

  test('401 without a session, 403 for the wrong role, 200 for an allowed role', async () => {
    assert.equal(await status(appWith(null)), 401)
    assert.equal(await status(appWith('customer')), 403)
    assert.equal(await status(appWith('owner')), 200)
    assert.equal(await status(appWith('dev')), 200)
  })

  test('over HTTP: customer 403, owner 200 on admin, owner 403 on dev, dev 200', async () => {
    const customer = await signIn('role-customer@example.com')
    const owner = await signIn(OWNER)
    const dev = await signIn(DEV)
    assert.equal((await call('/api/admin/stats')).status, 401)
    assert.equal((await call('/api/admin/stats', { cookie: customer })).status, 403)
    assert.equal((await call('/api/admin/stats', { cookie: owner })).status, 200)
    assert.equal((await call('/api/dev/health', { cookie: owner })).status, 403)
    assert.equal((await call('/api/dev/health', { cookie: dev })).status, 200)
    assert.equal((await call('/api/dev/env', { cookie: dev })).status, 200)
  })

  test('only verified addresses get a bootstrap role; owners cannot grant dev', () => {
    assert.equal(bootstrapRole({ OWNER_EMAILS: 'A@x.com' }, 'a@x.com', true), 'owner')
    assert.equal(bootstrapRole({ OWNER_EMAILS: 'a@x.com' }, 'a@x.com', false), null)
    assert.equal(bootstrapRole({ DEV_EMAILS: 'a@x.com', OWNER_EMAILS: 'a@x.com' }, 'a@x.com', true), 'dev')
    assert.equal(canAssignRole('owner', 'customer', 'dev'), false)
    assert.equal(canAssignRole('owner', 'dev', 'customer'), false)
    assert.equal(canAssignRole('owner', 'customer', 'owner'), true)
    assert.equal(canAssignRole('customer', 'customer', 'owner'), false)
    assert.equal(canAssignRole('dev', 'customer', 'dev'), true)
  })

  test('dev changes a role, audit records it, dev cannot change themselves', async () => {
    const dev = await signIn(DEV)
    await signIn('promote@example.com')
    const users = await call('/api/dev/users?q=promote', { cookie: dev })
    assert.equal(users.status, 200)
    const target = users.body.users[0]
    assert.equal(target.role, 'customer')
    const changed = await call(`/api/dev/users/${target.id}/role`, { method: 'PATCH', cookie: dev, body: { role: 'owner' } })
    assert.equal(changed.status, 200)
    const audit = await call('/api/dev/audit', { cookie: dev })
    assert.ok(audit.body.entries.some((e: any) => e.action === 'role_change' && e.target === target.id))
    const self = (await call('/api/me', { cookie: dev })).body.user
    assert.equal((await call(`/api/dev/users/${self.id}/role`, { method: 'PATCH', cookie: dev, body: { role: 'customer' } })).status, 400)
  })
})

describe('bookings for owners and customers', () => {
  const slot = (day: number) => `2031-03-${String(day).padStart(2, '0')}T09:00:00.000Z`

  test('owner status change writes history and an audit entry', async () => {
    const customer = await signIn('history-customer@example.com')
    const created = await call('/api/bookings', { method: 'POST', cookie: customer, body: bookingBody('history-customer@example.com', slot(3)) })
    assert.equal(created.status, 201)
    const code = created.body.code as string

    const owner = await signIn(OWNER)
    const changed = await call(`/api/admin/bookings/${code}/status`, {
      method: 'PATCH',
      cookie: owner,
      body: { status: 'diagnosis', note: 'Charging port looks burnt' },
    })
    assert.equal(changed.status, 200)
    assert.equal(changed.body.status, 'diagnosis')
    assert.equal(changed.body.statusHistory.length, 2)
    assert.equal(changed.body.statusHistory[1].note, 'Charging port looks burnt')
    assert.ok(changed.body.statusHistory[1].by)

    // Saving the same status again without a note changes nothing: no history line, no audit entry.
    const again = await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: owner, body: { status: 'diagnosis' } })
    assert.equal(again.status, 200)
    assert.equal(again.body.statusHistory.length, 2)

    const entries = await platform.audit.list(20)
    const entry = entries.find((e) => e.action === 'booking_status' && e.target === code)
    assert.ok(entry)
    assert.equal(entries.filter((e) => e.action === 'booking_status' && e.target === code).length, 1)
    assert.deepEqual(entry.detail, { from: 'received', to: 'diagnosis', note: true })
    assert.ok(entry.ipHash && !entry.ipHash.includes('127.0.0.1'))

    assert.equal((await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: customer, body: { status: 'done' } })).status, 403)
    assert.equal((await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: owner, body: { status: 'bogus' } })).status, 400)

    const detail = await call(`/api/admin/bookings/${code}`, { cookie: owner })
    assert.equal(detail.body.contact.email, 'history-customer@example.com')
  })

  test('booking and status emails go out, and a final price feeds the numbers', async () => {
    const outbox = () => store.getDb().collection('dev_outbox')
    const email = 'mail-customer@example.com'
    // A guest booking with a name and device that must never reach the customer's mail.
    const body = { ...bookingBody(email, slot(7)), contact: { name: 'Visit http://spam.example', phone: '+40 721 123 456', email }, device: { brand: 'http://spam.example' } }
    const created = await call('/api/bookings', { method: 'POST', body })
    assert.equal(created.status, 201)
    const code = created.body.code as string

    const confirmation = await outbox().findOne({ to: email, kind: 'booking:received' })
    assert.ok(confirmation, 'the customer got a confirmation')
    assert.match(String(confirmation.subject), new RegExp(code))
    assert.match(String(confirmation.text), new RegExp(`/\\?cod=${code}#status`))
    assert.doesNotMatch(String(confirmation.text), /spam\.example/)
    const heads = await outbox().findOne({ to: OWNER, kind: 'booking:owner', subject: new RegExp(code) })
    assert.ok(heads, 'the owner got a heads-up')
    assert.match(String(heads.text), new RegExp(`/admin\\?cod=${code}`))

    const owner = await signIn(OWNER)
    const patch = (b: unknown) => call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: owner, body: b })

    // A note on its own: saved, no mail.
    const noted = await patch({ status: 'received', note: 'Checked in' })
    assert.equal(noted.body.notified, 'skipped')
    // A new status with the box unticked: no mail.
    assert.equal((await patch({ status: 'diagnosis', notify: false })).body.notified, 'skipped')
    assert.equal(await outbox().countDocuments({ to: email, kind: 'booking:diagnosis' }), 0)

    // A price on its own: stored, no history line, no mail, audited.
    const priced = await patch({ status: 'diagnosis', finalLei: 350 })
    assert.equal(priced.body.finalLei, 350)
    assert.equal(priced.body.notified, 'skipped')
    assert.equal(priced.body.statusHistory.length, 3)
    assert.equal((await patch({ status: 'diagnosis', finalLei: 350 })).body.statusHistory.length, 3)
    assert.equal((await patch({ status: 'diagnosis', finalLei: 1.5 })).status, 400)

    // Ready: the customer is told, with the price.
    const ready = await patch({ status: 'ready' })
    assert.equal(ready.body.notified, 'sent')
    const readyMail = await outbox().findOne({ to: email, kind: 'booking:ready' })
    assert.ok(readyMail)
    assert.match(String(readyMail.text), /350 lei/)

    // Done counts the final price, not the estimate midpoint.
    const before = (await call('/api/admin/stats', { cookie: owner })).body.revenue.doneLei as number
    await patch({ status: 'done' })
    const after = (await call('/api/admin/stats', { cookie: owner })).body.revenue.doneLei as number
    assert.equal(after - before, 350)

    // Clearing the price falls back to the estimate.
    const cleared = await patch({ status: 'done', finalLei: null })
    assert.equal(cleared.body.finalLei, undefined)

    const audits = (await platform.audit.list(50)).filter((e) => e.action === 'booking_status' && e.target === code)
    assert.ok(audits.some((e) => JSON.stringify(e.detail.finalLei) === '[null,350]'))
  })

  test('two submits for one slot: one wins; a cancelled booking frees its slot and earns nothing', async () => {
    const body = bookingBody('race@example.com', slot(12))
    const [a, b] = await Promise.all([
      call('/api/bookings', { method: 'POST', body }),
      call('/api/bookings', { method: 'POST', body: { ...body, contact: { ...body.contact, email: 'race2@example.com' } } }),
    ])
    assert.deepEqual([a.status, b.status].sort(), [201, 409])
    const code = (a.status === 201 ? a : b).body.code as string

    const owner = await signIn(OWNER)
    const before = (await call('/api/admin/stats', { cookie: owner })).body.revenue.pipelineLei as number
    const cancelled = await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: owner, body: { status: 'cancelled' } })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.notified, 'sent')
    const mail = await store.getDb().collection('dev_outbox').findOne({ kind: 'booking:cancelled', subject: new RegExp(code) })
    assert.match(String(mail?.text), /anulată/)
    const after = (await call('/api/admin/stats', { cookie: owner })).body.revenue.pipelineLei as number
    assert.ok(after < before, 'a cancelled booking leaves the pipeline')

    // The slot is free again, and the cancelled booking cannot be reopened over the new one.
    const again = await call('/api/bookings', { method: 'POST', body: bookingBody('race3@example.com', slot(12)) })
    assert.equal(again.status, 201)
    const reopen = await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: owner, body: { status: 'received' } })
    assert.equal(reopen.status, 409)
  })

  test('a customer sees only their own bookings, without internal notes', async () => {
    const a = await signIn('alice@example.com')
    const b = await signIn('bob@example.com')
    const ownA = await call('/api/bookings', { method: 'POST', cookie: a, body: bookingBody('alice@example.com', slot(4)) })
    const ownB = await call('/api/bookings', { method: 'POST', cookie: b, body: bookingBody('bob@example.com', slot(5)) })
    // A guest booking that uses Bob's verified address also belongs to Bob.
    const guest = await call('/api/bookings', { method: 'POST', body: bookingBody('BOB@example.com', slot(6)) })
    assert.equal(guest.status, 201)

    const owner = await signIn(OWNER)
    await call(`/api/admin/bookings/${ownA.body.code}/status`, { method: 'PATCH', cookie: owner, body: { status: 'repairing', note: 'internal only' } })

    assert.equal((await call('/api/me/bookings')).status, 401)
    const mineA = await call('/api/me/bookings', { cookie: a })
    assert.deepEqual(mineA.body.bookings.map((x: any) => x.code), [ownA.body.code])
    assert.equal(mineA.body.bookings[0].userId, undefined)
    assert.doesNotMatch(JSON.stringify(mineA.body), /internal only/)
    assert.equal(mineA.body.bookings[0].timeline.length, 2)

    const mineB = await call('/api/me/bookings', { cookie: b })
    assert.deepEqual(new Set(mineB.body.bookings.map((x: any) => x.code)), new Set([ownB.body.code, guest.body.code]))
  })

  test('owner lists, filters and searches bookings, and sees the week calendar and pickups', async () => {
    const owner = await signIn(OWNER)
    const withPickup = {
      ...bookingBody('pickup@example.com', slot(10)),
      pickup: { address: 'Str. Palas 7A, Iași', lat: 47.1585, lon: 27.6014, trips: 'both', urgent: true, quote: { totalLei: 120, oneWayKm: 5 } },
    }
    const created = await call('/api/bookings', { method: 'POST', body: withPickup })
    assert.equal(created.status, 201)

    const found = await call('/api/admin/bookings?q=pickup%40example&status=received&mode=shop&from=2031-03-01&to=2031-03-31', { cookie: owner })
    assert.equal(found.status, 200)
    assert.equal(found.body.total, 1)
    assert.match(found.body.items[0].mapLink, /google\.com\/maps/)

    assert.equal((await call('/api/admin/bookings?from=2031-13-45', { cookie: owner })).status, 400)

    const week = await call('/api/admin/calendar?week=2031-03-12', { cookie: owner })
    assert.equal(week.body.weekStart, '2031-03-10')
    assert.equal(week.body.days.length, 7)
    assert.equal(week.body.days[0].slots.length, 1)

    const busy = await call('/api/admin/busy?from=2031-03-01&to=2031-03-31', { cookie: owner })
    assert.equal(busy.status, 200)
    assert.equal(busy.body.days['2031-03-10'].pickups, 1)
    assert.ok(busy.body.days['2031-03-10'].total >= 1)
    assert.equal((await call('/api/admin/busy?from=2031-03-01&to=2031-06-30', { cookie: owner })).status, 400)

    const pickups = await call('/api/admin/pickups?date=2031-03-10', { cookie: owner })
    assert.equal(pickups.body.jobs.length, 1)
    assert.equal(pickups.body.jobs[0].urgent, true)
    assert.equal(pickups.body.jobs[0].address, 'Str. Palas 7A, Iași')

    const stats = await call('/api/admin/stats', { cookie: owner })
    assert.equal(stats.body.weeks.length, 12)
    assert.ok(stats.body.total >= 4)
    assert.ok(stats.body.revenue.pipelineLei > 0)
    // Trend series: 12 weeks and 12 months, the newest last; today's bookings land in the last point
    // and the booked value includes the (server-side) transport quote.
    const { weekly, monthly } = stats.body.trend
    assert.equal(weekly.length, 12)
    assert.equal(monthly.length, 12)
    assert.match(monthly[11].start, /^\d{4}-\d{2}-01$/)
    assert.ok(weekly[11].created >= 1)
    assert.ok(weekly[11].bookedLei > 0)
    const inWindow = weekly.reduce((n: number, p: { created: number }) => n + p.created, 0)
    assert.ok(inWindow <= stats.body.total && inWindow >= 1)
  })
})

describe('settings', () => {
  test('bounds are enforced, changes are audited and the pickup quote uses them', async () => {
    const owner = await signIn(OWNER)
    const put = (body: unknown) => call('/api/admin/settings', { method: 'PUT', cookie: owner, body })

    assert.equal((await put({ pickup: { dieselLeiPerL: 0 } })).status, 400)
    assert.equal((await put({ pickup: { dieselLeiPerL: 9999 } })).status, 400)
    assert.equal((await put({ pickup: { urgentFactor: 0.5 } })).status, 400)
    assert.equal((await put({ labour: { valueRate: { low: 300 } } })).status, 400) // low above mid
    assert.equal((await put({ pickup: { nope: 1 } })).status, 400)
    assert.equal((await put({ pickup: { maxKm: 'far' } })).status, 400)

    const ok = await put({ pickup: { dieselLeiPerL: 9.5, minTripLei: 40 }, labour: { valueRate: { low: 110 } } })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.pickup.dieselLeiPerL, 9.5)
    assert.equal(ok.body.labour.valueRate.low, 110)

    const pub = await call('/api/settings/public')
    assert.equal(pub.status, 200)
    assert.equal(pub.body.pickup.minTripLei, 40)
    assert.equal(pub.body.labour.valueRate.mid, 150)

    const quote = await call('/api/pickup/quote?lat=47.16&lon=27.6&trips=pickup')
    assert.equal(quote.status, 200)
    assert.equal(quote.body.rates.dieselLeiPerL, 9.5)
    assert.ok(quote.body.perTripLei >= 40)

    const entry = (await platform.audit.list(20)).find((e) => e.action === 'settings_change')
    assert.ok(entry)
    assert.deepEqual((entry.detail as any).changed['pickup.dieselLeiPerL'], [7.6, 9.5])

    const customer = await signIn('settings-customer@example.com')
    assert.equal((await call('/api/admin/settings', { method: 'PUT', cookie: customer, body: {} })).status, 403)
  })
})

describe('dev tools', () => {
  test('env report has names and booleans only', async () => {
    const dev = await signIn(DEV)
    const env = await call('/api/dev/env', { cookie: dev })
    const text = JSON.stringify(env.body)
    assert.doesNotMatch(text, new RegExp(ENV.BETTER_AUTH_SECRET))
    const secret = env.body.variables.find((v: any) => v.name === 'BETTER_AUTH_SECRET')
    assert.equal(secret.set, true)
    assert.deepEqual(Object.keys(secret).sort(), ['name', 'requiredInProduction', 'set'])
  })

  test('outbox, errors and rate limits are readable', async () => {
    const dev = await signIn(DEV)
    assert.equal((await call('/api/dev/outbox', { cookie: dev })).status, 200)
    assert.equal((await call('/api/dev/errors', { cookie: dev })).status, 200)
    const limits = await call('/api/dev/rate-limits', { cookie: dev })
    assert.ok(limits.body.limiters.some((l: any) => l.name === 'admin'))
  })
})

describe('mail delivery', () => {
  test('production without a provider fails with MailUnavailableError', async () => {
    const mailer = createMailer({ db: null, env: {}, production: true, quiet: true })
    assert.equal(mailer.provider, 'none')
    await assert.rejects(mailer.send({ to: 'a@b.co', subject: 's', text: 't', kind: 'otp:sign-in' }), MailUnavailableError)
  })

  test('with a provider key the message goes to Resend with a bearer header', async () => {
    const calls: { url: string; auth: string | null; body: any }[] = []
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) })
      return new Response('{}', { status: 200 })
    }
    const mailer = createMailer({ db: null, env: { RESEND_API_KEY: 're_test', MAIL_FROM: 'Shop <a@b.co>' }, production: true, fetchImpl, quiet: true })
    await mailer.send({ to: 'c@d.co', subject: 's', text: 't', kind: 'otp:sign-in' })
    assert.equal(calls[0]?.url, 'https://api.resend.com/emails')
    assert.equal(calls[0]?.auth, 'Bearer re_test')
    assert.deepEqual(calls[0]?.body.to, ['c@d.co'])
  })

  test('constant-time compare', () => {
    assert.equal(safeEqual('abc', 'abc'), true)
    assert.equal(safeEqual('abc', 'abd'), false)
    assert.equal(safeEqual('abc', undefined), false)
  })
})
