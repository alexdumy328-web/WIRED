import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from './app.ts'
import { phoneKey } from './admin/customers.ts'
import { addMonthsClamped } from './admin/time.ts'
import { warrantyState } from './admin/warranties.ts'
import { canAssignRole, effectiveRole } from './auth/roles.ts'
import { createPlatform, type Platform } from './platform.ts'
import { MongoStore } from './store.ts'

const ORIGIN = 'http://localhost:5173'
const OWNER = 'owner@example.com'
const ENV = {
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0123456789',
  BETTER_AUTH_URL: ORIGIN,
  OWNER_EMAILS: OWNER,
  DEV_EMAILS: 'dev@example.com',
}

let mongo: MongoMemoryServer
let store: MongoStore
let platform: Platform
let server: Server
let base = ''
let owner = ''
let tech = ''

type Reply = { status: number; body: any; headers: Headers; bytes: Uint8Array }

async function call(path: string, init: { method?: string; body?: unknown; cookie?: string; raw?: Uint8Array; type?: string } = {}): Promise<Reply> {
  const response = await fetch(base + path, {
    method: init.method ?? 'GET',
    headers: {
      origin: ORIGIN,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.raw ? { 'content-type': init.type ?? 'image/jpeg' } : {}),
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.raw ? Buffer.from(init.raw) : init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  let body: unknown = null
  if (response.headers.get('content-type')?.includes('json')) body = JSON.parse(Buffer.from(bytes).toString('utf8'))
  return { status: response.status, body, headers: response.headers, bytes }
}

async function signIn(email: string): Promise<string> {
  await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' } })
  const doc = await store.getDb().collection('dev_outbox').find({ to: email, kind: 'otp:sign-in' }).sort({ at: -1 }).limit(1).next()
  const otp = /\b(\d{6})\b/.exec(String(doc?.text ?? ''))![1]
  const reply = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp } })
  assert.equal(reply.status, 200)
  return reply.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

const slot = (day: number) => `2031-03-${String(day).padStart(2, '0')}T09:00:00.000Z`
const book = (day: number, contact: { name: string; phone: string; email?: string }, cookie?: string) =>
  call('/api/bookings', {
    method: 'POST',
    cookie,
    body: {
      mode: 'shop',
      jobIds: ['laptop-dc-jack'],
      device: { brand: 'Lenovo', model: 'T480' },
      issue: 'Nu se mai încarcă',
      slot: slot(day),
      contact,
      estimate: { priceFrom: 0, priceTo: 0, etaHours: [1, 2] },
      lang: 'ro',
    },
  })

before(async () => {
  mongo = await MongoMemoryServer.create()
  store = new MongoStore(mongo.getUri(), 'norgelis_workshop')
  await store.init()
  platform = await createPlatform({ db: store.getDb(), env: ENV, production: false, quiet: true, rateLimitEnabled: false })
  const app = createApp(store, { platform, adminToken: null, upstreamFetch: async () => new Response('nope', { status: 500 }) })
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  owner = await signIn(OWNER)
  tech = await signIn('tech@example.com')
  await store.getDb().collection('user').updateOne({ email: 'tech@example.com' }, { $set: { role: 'technician' } })
})

after(async () => {
  server?.closeAllConnections()
  server?.close()
  await store?.close()
  await mongo?.stop()
})

describe('pure rules', () => {
  test('warranty months are calendar months, clamped to the month end', () => {
    assert.equal(addMonthsClamped('2026-11-21', 6), '2027-05-21')
    assert.equal(addMonthsClamped('2026-08-31', 6), '2027-02-28')
    assert.equal(addMonthsClamped('2027-08-31', 6), '2028-02-29')
    assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28')
    assert.equal(addMonthsClamped('2026-12-15', 1), '2027-01-15')
    assert.equal(addMonthsClamped('2026-03-31', 24), '2028-03-31')
  })

  test('warranty state', () => {
    assert.equal(warrantyState({ endsOn: '2027-01-01' }, '2026-06-01'), 'active')
    assert.equal(warrantyState({ endsOn: '2026-06-20' }, '2026-06-01'), 'expiring')
    assert.equal(warrantyState({ endsOn: '2026-06-01' }, '2026-06-01'), 'expiring')
    assert.equal(warrantyState({ endsOn: '2026-05-31' }, '2026-06-01'), 'expired')
    assert.equal(warrantyState({ endsOn: '2027-01-01', voided: { at: '', by: '', reason: '' } }, '2026-06-01'), 'void')
  })

  test('one phone number, however it is typed', () => {
    const key = '40721123456'
    for (const typed of ['0721 123 456', '+40 721 123 456', '0040-721-123-456', '(0721) 123-456']) assert.equal(phoneKey(typed), key, typed)
    assert.equal(phoneKey('123'), undefined)
  })

  test('technician ranks between customer and owner', () => {
    assert.equal(effectiveRole('technician', 'owner'), 'owner')
    assert.equal(effectiveRole('owner', null), 'owner')
    assert.equal(canAssignRole('owner', 'customer', 'technician'), true)
    assert.equal(canAssignRole('owner', 'technician', 'dev'), false)
    assert.equal(canAssignRole('technician', 'customer', 'technician'), false)
  })
})

describe('workshop', () => {
  test('online bookings land on one customer, matched by phone', async () => {
    const a = await book(10, { name: 'Ana Pop', phone: '0721 123 456' })
    const b = await book(11, { name: 'Ana Pop', phone: '+40 721-123-456', email: 'ana@example.com' })
    assert.equal(a.status, 201)
    assert.equal(b.status, 201)
    const list = await call('/api/admin/customers?q=0721', { cookie: owner })
    assert.equal(list.status, 200)
    assert.equal(list.body.total, 1)
    const ana = list.body.items[0]
    assert.equal(ana.jobs, 2)
    assert.equal(ana.email, 'ana@example.com', 'the second booking filled in the missing email')
    const detail = await call(`/api/admin/customers/${ana.id}`, { cookie: tech })
    assert.equal(detail.body.jobs.length, 2)
  })

  test('intake numbers sheets per year, once per booking', async () => {
    const created = await book(13, { name: 'Ion Ionescu', phone: '0744 000 111', email: 'ion@example.com' })
    const code = created.body.code
    const first = await call(`/api/admin/bookings/${code}/intake`, { method: 'POST', cookie: tech, body: { deviceType: 'Laptop', serial: 'SN1', accessories: 'Încărcător' } })
    assert.equal(first.status, 201)
    assert.equal(first.body.intake.year, new Date().getFullYear())
    assert.equal(first.body.intake.number, 1)
    assert.equal(first.body.notified, 'sent')
    const mail = await store.getDb().collection('dev_outbox').findOne({ to: 'ion@example.com', kind: 'booking:intake' })
    assert.deepEqual(mail?.attachments, [`fisa-service-1-${first.body.intake.year}.pdf`])
    const twice = await call(`/api/admin/bookings/${code}/intake`, { method: 'POST', cookie: owner, body: { deviceType: 'Laptop' } })
    assert.equal(twice.status, 409)
    const edit = await call(`/api/admin/bookings/${code}/intake`, { method: 'PATCH', cookie: tech, body: { serial: '' } })
    assert.equal(edit.body.intake.serial, undefined)
    assert.equal(edit.body.intake.number, 1)
    const pdf = await call(`/api/admin/bookings/${code}/intake.pdf`, { cookie: tech })
    assert.equal(pdf.status, 200)
    assert.equal(pdf.headers.get('content-type'), 'application/pdf')
    assert.equal(Buffer.from(pdf.bytes.slice(0, 5)).toString(), '%PDF-')
  })

  test('a walk-in creates the customer and the sheet in one step', async () => {
    const reply = await call('/api/admin/walk-ins', {
      method: 'POST',
      cookie: tech,
      body: {
        customer: { name: 'Maria Ene', phone: '0755 222 333', preferred: 'whatsapp' },
        deviceType: 'Espressor',
        device: { brand: 'DeLonghi' },
        issue: 'Nu face presiune',
        estimate: { priceFrom: 100, priceTo: 200 },
      },
    })
    assert.equal(reply.status, 201)
    assert.equal(reply.body.source, 'walk-in')
    assert.equal(reply.body.intake.number, 2)
    assert.equal(reply.body.notified, 'skipped', 'no email on file')
    assert.ok(reply.body.customerId)
    const again = await call('/api/admin/walk-ins', {
      method: 'POST',
      cookie: tech,
      body: { customer: { name: 'Maria E', phone: '+40755222333', preferred: 'phone' }, deviceType: 'Espressor', issue: 'Altă problemă' },
    })
    assert.equal(again.status, 409)
    assert.equal(again.body.customerId, reply.body.customerId)
    const email = await call('/api/admin/customers', { method: 'POST', cookie: tech, body: { name: 'No Mail', phone: '0711 111 111', preferred: 'email' } })
    assert.equal(email.status, 400, 'email is required when the customer prefers email')
  })

  test('technicians see no money, settings or stats', async () => {
    const list = await call('/api/admin/bookings?q=Ana', { cookie: owner })
    const code = list.body.items[0].code
    const priced = await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: owner, body: { status: 'repairing', finalLei: 300, notify: false } })
    assert.equal(priced.body.finalLei, 300)
    const seen = await call(`/api/admin/bookings/${code}`, { cookie: tech })
    assert.equal(seen.body.finalLei, undefined)
    const tried = await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: tech, body: { status: 'repairing', finalLei: 1 } })
    assert.equal(tried.status, 403)
    assert.equal((await call('/api/admin/stats', { cookie: tech })).status, 403)
    assert.equal((await call('/api/admin/settings', { cookie: tech })).status, 403)
    const counts = await call('/api/admin/counts', { cookie: tech })
    assert.equal(counts.status, 200)
    assert.ok(counts.body.byStatus.repairing >= 1)
    const repair = await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: tech, body: { status: 'repairing', repair: { workDone: 'Mufă DC nouă' } } })
    assert.equal(repair.status, 200)
    assert.equal(repair.body.repair.workDone, 'Mufă DC nouă')
  })

  test('warranty: only for finished work, numbered, voided by owners only', async () => {
    const created = await book(14, { name: 'Dan Radu', phone: '0766 444 555', email: 'dan@example.com' })
    const code = created.body.code
    const early = await call(`/api/admin/bookings/${code}/warranty`, { method: 'POST', cookie: tech, body: {} })
    assert.equal(early.status, 409)
    await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: tech, body: { status: 'ready', notify: false, repair: { workDone: 'Mufă înlocuită' } } })
    const issued = await call(`/api/admin/bookings/${code}/warranty`, { method: 'POST', cookie: tech, body: {} })
    assert.equal(issued.status, 201)
    assert.match(issued.body.label, /^G1\/\d{4}$/)
    assert.equal(issued.body.months, 6, 'laptop default')
    assert.equal(issued.body.work, 'Mufă înlocuită')
    assert.equal((await call(`/api/admin/bookings/${code}/warranty`, { method: 'POST', cookie: tech, body: {} })).status, 409)

    // Handing back sends the certificate along.
    const done = await call(`/api/admin/bookings/${code}/status`, { method: 'PATCH', cookie: tech, body: { status: 'done' } })
    assert.equal(done.body.notified, 'sent')
    assert.ok(done.body.deliveredAt)
    const mail = await store.getDb().collection('dev_outbox').findOne({ to: 'dan@example.com', kind: 'booking:done' })
    assert.equal(mail?.attachments?.[0], `garantie-${issued.body.label.replace('/', '-')}.pdf`)

    assert.equal((await call(`/api/admin/warranties/${issued.body.id}/void`, { method: 'POST', cookie: tech, body: { reason: 'Greșeală' } })).status, 403)
    const pdf = await call(`/api/admin/warranties/${issued.body.id}.pdf`, { cookie: tech })
    assert.equal(pdf.headers.get('content-type'), 'application/pdf')
    const voided = await call(`/api/admin/warranties/${issued.body.id}/void`, { method: 'POST', cookie: owner, body: { reason: 'Emis din greșeală' } })
    assert.equal(voided.body.state, 'void')
    const list = await call('/api/admin/warranties?state=void', { cookie: tech })
    assert.equal(list.body.total, 1)
  })

  test('customers download only their own documents', async () => {
    const carla = await signIn('carla@example.com')
    const own = await book(17, { name: 'Carla', phone: '0733 999 888', email: 'carla@example.com' }, carla)
    await call(`/api/admin/bookings/${own.body.code}/intake`, { method: 'POST', cookie: owner, body: { deviceType: 'Laptop', email: false } })
    const mine = await call(`/api/me/bookings/${own.body.code}/intake.pdf`, { cookie: carla })
    assert.equal(mine.status, 200)
    const list = await call('/api/me/bookings', { cookie: carla })
    assert.equal(list.body.bookings[0].intake.number > 0, true)
    assert.equal(list.body.bookings[0].intake.by, undefined, 'staff names stay internal')
    assert.equal(list.body.bookings[0].customerId, undefined)
    const other = await call('/api/admin/bookings?q=Dan', { cookie: owner })
    const theirs = await call(`/api/me/bookings/${other.body.items[0].code}/intake.pdf`, { cookie: carla })
    assert.equal(theirs.status, 404)
    assert.equal((await call('/api/admin/customers', { cookie: carla })).status, 403)
  })

  test('photos: JPEG only, at most six', async () => {
    const list = await call('/api/admin/bookings?q=Ion', { cookie: owner })
    const code = list.body.items[0].code
    const png = await call(`/api/admin/bookings/${code}/photos`, { method: 'POST', cookie: tech, raw: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), type: 'image/jpeg' })
    assert.equal(png.status, 415)
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
    const ids: string[] = []
    for (let i = 0; i < 6; i += 1) {
      const up = await call(`/api/admin/bookings/${code}/photos`, { method: 'POST', cookie: tech, raw: jpeg })
      assert.equal(up.status, 201)
      ids.push(up.body.id)
    }
    assert.equal((await call(`/api/admin/bookings/${code}/photos`, { method: 'POST', cookie: tech, raw: jpeg })).status, 409)
    const got = await call(`/api/admin/photos/${ids[0]}`, { cookie: tech })
    assert.equal(got.headers.get('content-type'), 'image/jpeg')
    assert.deepEqual([...got.bytes], [...jpeg])
    assert.equal((await call(`/api/admin/photos/${ids[0]}`, { method: 'DELETE', cookie: tech })).status, 204)
    const detail = await call(`/api/admin/bookings/${code}`, { cookie: tech })
    assert.equal(detail.body.photoIds.length, 5)
  })

  test('settings keep company details and warranty months', async () => {
    const put = await call('/api/admin/settings', { method: 'PUT', cookie: owner, body: { company: { cui: 'RO123' }, documents: { warrantyMonths: { laptop: 12 } } } })
    assert.equal(put.status, 200)
    assert.equal(put.body.company.cui, 'RO123')
    assert.equal(put.body.documents.warrantyMonths.laptop, 12)
    assert.equal(put.body.documents.warrantyMonths.pc, 6)
    const badIban = await call('/api/admin/settings', { method: 'PUT', cookie: owner, body: { company: { iban: 'nope' } } })
    assert.equal(badIban.status, 400)
  })
})
