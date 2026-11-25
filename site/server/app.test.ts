import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { Express } from 'express'
import { createApp } from './app.ts'
import { FileStore } from './store.ts'
import type { BookingRequest } from '../src/types.ts'

const ADMIN_TOKEN = 'test-admin-token'
const SLOT = '2030-06-03T08:00:00.000Z'
const CODE_PATTERN = /^NT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/

let directory: string
let store: FileStore
let server: Server
let base: string

async function listen(app: Express): Promise<{ server: Server; base: string }> {
  const instance = app.listen(0)
  await once(instance, 'listening')
  const address = instance.address() as AddressInfo
  return { server: instance, base: `http://127.0.0.1:${address.port}` }
}

async function close(instance: Server): Promise<void> {
  instance.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()))
  })
}

function booking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    mode: 'shop',
    jobIds: ['laptop-screen'],
    device: { brand: 'Apple', model: 'MacBook Air', year: '2021' },
    issue: 'Battery drains very fast after the last system update.',
    slot: SLOT,
    contact: { name: 'Andrei Popescu', phone: '+40 721 123 456', email: 'andrei@example.com' },
    estimate: { priceFrom: 150, priceTo: 300, etaHours: [2, 4] },
    lang: 'ro',
    ...overrides,
  }
}

async function postBooking(body: unknown, target = base): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${target}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function patchStatus(
  code: string,
  status: string,
  token?: string,
  target = base,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token !== undefined) headers['x-admin-token'] = token
  const response = await fetch(`${target}/api/bookings/${code}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'norgelis-api-'))
  store = new FileStore(directory)
  await store.init()
  const started = await listen(createApp(store, { adminToken: ADMIN_TOKEN, rateLimit: { max: 1000 } }))
  server = started.server
  base = started.base
})

after(async () => {
  await close(server)
  await store.close()
  await rm(directory, { recursive: true, force: true })
})

test('health reports the file store', async () => {
  const response = await fetch(`${base}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, store: 'file' })
})

let shopCode = ''

test('creates a booking and returns a code', async () => {
  const { status, body } = await postBooking(booking())
  assert.equal(status, 201)
  assert.match(String(body.code), CODE_PATTERN)
  assert.equal(body.status, 'received')
  assert.equal(body.slot, SLOT)
  assert.deepEqual(Object.keys(body).sort(), ['code', 'slot', 'status'])
  shopCode = String(body.code)
})

test('public status lookup is case-insensitive and hides private fields', async () => {
  const response = await fetch(`${base}/api/bookings/${shopCode.toLowerCase()}`)
  assert.equal(response.status, 200)
  const body = (await response.json()) as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), [
    'code',
    'jobIds',
    'mode',
    'slot',
    'status',
    'updatedAt',
  ])
  assert.equal(body.code, shopCode)
  assert.equal(body.status, 'received')
  assert.equal(body.mode, 'shop')
  assert.deepEqual(body.jobIds, ['laptop-screen'])
  assert.equal(body.slot, SLOT)
  assert.equal('contact' in body, false)
  assert.equal('issue' in body, false)
  assert.equal('location' in body, false)
})

test('unknown booking code is a JSON 404', async () => {
  const response = await fetch(`${base}/api/bookings/NT-ZZZZ`)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'not_found' })
})

test('rejects a duplicate slot for the same mode but allows the other mode', async () => {
  const duplicate = await postBooking(booking())
  assert.equal(duplicate.status, 409)
  assert.deepEqual(duplicate.body, { error: 'slot_taken' })

  const mobile = await postBooking(
    booking({ mode: 'mobile', jobIds: ['auto-obd-diagnosis'], location: 'Str. Fabricii 12, Cluj' }),
  )
  assert.equal(mobile.status, 201)
  assert.match(String(mobile.body.code), CODE_PATTERN)
})

test('rejects invalid payloads with zod issues', async () => {
  const { status, body } = await postBooking({ ...booking(), issue: 'x' })
  assert.equal(status, 400)
  assert.equal(body.error, 'invalid')
  const issues = body.issues as Array<{ path: string[]; message: string }>
  assert.ok(Array.isArray(issues) && issues.length > 0)
  assert.ok(issues.some((issue) => issue.path.includes('issue')))

  const noLocation = await postBooking(booking({ mode: 'mobile', slot: '2030-06-04T09:00:00.000Z' }))
  assert.equal(noLocation.status, 400)
  const locationIssues = noLocation.body.issues as Array<{ path: string[] }>
  assert.ok(locationIssues.some((issue) => issue.path.includes('location')))

  const nothingPicked = await postBooking(
    booking({ jobIds: [], custom: '   ', slot: '2030-06-05T09:00:00.000Z' }),
  )
  assert.equal(nothingPicked.status, 400)
  const customIssues = nothingPicked.body.issues as Array<{ path: string[] }>
  assert.ok(customIssues.some((issue) => issue.path.includes('custom')))

  const past = await postBooking(booking({ slot: '2020-01-01T09:00:00.000Z' }))
  assert.equal(past.status, 400)

  const badPhone = await postBooking(
    booking({ contact: { name: 'Ana', phone: 'call me' }, slot: '2030-06-06T09:00:00.000Z' }),
  )
  assert.equal(badPhone.status, 400)

  const noBody = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal(noBody.status, 400)
})

test('slots endpoint returns taken slots for the mode and range', async () => {
  const taken = await fetch(`${base}/api/slots?mode=shop&from=2030-06-01&to=2030-06-30`)
  assert.equal(taken.status, 200)
  assert.deepEqual(await taken.json(), { taken: [SLOT] })

  const outside = await fetch(`${base}/api/slots?mode=shop&from=2030-06-04&to=2030-06-30`)
  assert.deepEqual(await outside.json(), { taken: [] })

  const mobile = await fetch(`${base}/api/slots?mode=mobile&from=2030-06-01&to=2030-06-30`)
  assert.deepEqual(await mobile.json(), { taken: [SLOT] })

  const tooWide = await fetch(`${base}/api/slots?mode=shop&from=2030-01-01&to=2030-03-01`)
  assert.equal(tooWide.status, 400)

  const badMode = await fetch(`${base}/api/slots?mode=onsite&from=2030-06-01&to=2030-06-02`)
  assert.equal(badMode.status, 400)

  const badDate = await fetch(`${base}/api/slots?mode=shop&from=06/01/2030&to=2030-06-02`)
  assert.equal(badDate.status, 400)
})

test('stats counts the active queue and category hints', async () => {
  const response = await fetch(`${base}/api/stats`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    queue: 2,
    byCategoryHint: { laptop: 1, auto: 1 },
  })
})

test('admin status updates require the token', async () => {
  const anonymous = await patchStatus(shopCode, 'diagnosis')
  assert.equal(anonymous.status, 401)
  assert.deepEqual(anonymous.body, { error: 'unauthorized' })

  const wrong = await patchStatus(shopCode, 'diagnosis', 'nope')
  assert.equal(wrong.status, 401)

  const invalid = await patchStatus(shopCode, 'on-fire', ADMIN_TOKEN)
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error, 'invalid')

  const updated = await patchStatus(shopCode, 'diagnosis', ADMIN_TOKEN)
  assert.equal(updated.status, 200)
  assert.equal(updated.body.status, 'diagnosis')
  assert.equal(updated.body.code, shopCode)
  assert.ok(typeof updated.body.updatedAt === 'string')

  const unknown = await patchStatus('NT-ZZZZ', 'diagnosis', ADMIN_TOKEN)
  assert.equal(unknown.status, 404)
})

test('done bookings leave the queue and free the slot', async () => {
  const done = await patchStatus(shopCode, 'done', ADMIN_TOKEN)
  assert.equal(done.status, 200)
  assert.equal(done.body.status, 'done')

  const publicView = (await (await fetch(`${base}/api/bookings/${shopCode}`)).json()) as {
    status: string
  }
  assert.equal(publicView.status, 'done')

  const slots = await fetch(`${base}/api/slots?mode=shop&from=2030-06-01&to=2030-06-30`)
  assert.deepEqual(await slots.json(), { taken: [] })

  const stats = (await (await fetch(`${base}/api/stats`)).json()) as {
    queue: number
    byCategoryHint: Record<string, number>
  }
  assert.equal(stats.queue, 1)
  assert.deepEqual(stats.byCategoryHint, { auto: 1 })
})

test('bookings survive a restart through the JSON file', async () => {
  const reopened = new FileStore(directory)
  await reopened.init()
  const bookingRecord = await reopened.findByCode(shopCode.toLowerCase())
  assert.ok(bookingRecord)
  assert.equal(bookingRecord.code, shopCode)
  assert.equal(bookingRecord.status, 'done')
  await reopened.close()
})

test('status updates are disabled when ADMIN_TOKEN is not configured', async () => {
  const started = await listen(createApp(store, { adminToken: null }))
  try {
    const response = await patchStatus(shopCode, 'diagnosis', ADMIN_TOKEN, started.base)
    assert.equal(response.status, 503)
    assert.deepEqual(response.body, { error: 'admin_disabled' })
  } finally {
    await close(started.server)
  }
})

test('booking creation is rate limited per IP', async () => {
  const started = await listen(createApp(store, { adminToken: ADMIN_TOKEN }))
  try {
    const responses: number[] = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const result = await postBooking({}, started.base)
      responses.push(result.status)
    }
    assert.deepEqual(responses.slice(0, 10), Array(10).fill(400))
    assert.equal(responses[10], 429)
  } finally {
    await close(started.server)
  }
})

test('unknown /api routes answer JSON 404', async () => {
  const response = await fetch(`${base}/api/nope`)
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true)
  assert.deepEqual(await response.json(), { error: 'not_found' })
  assert.equal(response.headers.get('x-powered-by'), null)
})

test('the server prices the booking itself and rejects unknown jobs and off-hours slots', async () => {
  const forged = await postBooking(booking({ slot: '2030-06-05T08:00:00.000Z', estimate: { priceFrom: 1, priceTo: 1, etaHours: [0, 0] } }))
  assert.equal(forged.status, 201)
  const stored = (await store.findByCode(String(forged.body.code)))!
  assert.ok(stored.estimate.priceFrom > 1, 'price comes from the price list, not the request')

  const unknown = await postBooking(booking({ jobIds: ['no-such-job'], slot: '2030-06-06T08:00:00.000Z' }))
  assert.equal(unknown.status, 400)

  const wrongMode = await postBooking(booking({ mode: 'mobile', jobIds: ['laptop-screen'], location: 'Iași', slot: '2030-06-06T08:00:00.000Z' }))
  assert.equal(wrongMode.status, 400)

  // 03:00 in Bucharest is not a slot we offer.
  const night = await postBooking(booking({ slot: '2030-06-06T00:00:00.000Z' }))
  assert.equal(night.status, 400)
})
