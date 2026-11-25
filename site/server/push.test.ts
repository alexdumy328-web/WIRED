import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { after, before, beforeEach, describe, test } from 'node:test'
import type { Db } from 'mongodb'
import { MongoClient } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { apnsConfig, createPush, type ApnsMessage } from './push.ts'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const ENV = { APNS_KEY_ID: 'KEY1234567', APNS_TEAM_ID: 'TEAM123456', APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n') }

let mongo: MongoMemoryServer
let client: MongoClient
let db: Db
let sent: (ApnsMessage & { topic: string; jwt: string })[]
let answer: (m: ApnsMessage) => { status: number; reason?: string }
let clock: number

const DEVICE = 'aa'.repeat(32)
const START = 'bb'.repeat(32)
const ACTIVITY = 'cc'.repeat(32)
const position = (eta: number | undefined, code = 'NT-LIVE') => ({ userId: 'drv', name: 'Ion', lat: 47.16, lon: 27.58, bookingCode: code, etaMinutes: eta, updatedAt: new Date(clock) })

function push(env: Record<string, string | undefined> = ENV) {
  return createPush(db, env, {
    now: () => clock,
    transport: async (m) => {
      sent.push(m)
      return answer(m)
    },
  })
}

before(async () => {
  mongo = await MongoMemoryServer.create()
  client = await MongoClient.connect(mongo.getUri())
})

after(async () => {
  await client?.close()
  await mongo?.stop()
})

beforeEach(async () => {
  db = client.db(`push_${Math.random().toString(36).slice(2)}`)
  sent = []
  answer = () => ({ status: 200 })
  clock = Date.parse('2026-11-25T10:00:00Z')
  await db.collection('bookings').insertOne({ code: 'NT-LIVE', status: 'received', userId: 'u1', device: { brand: 'Apple', model: 'iPhone 13' } })
})

describe('push', () => {
  test('off without a key: nothing is sent and nothing fails', async () => {
    assert.equal(apnsConfig({}), null)
    assert.equal(apnsConfig({ ...ENV, APNS_KEY: 'garbage' }), null)
    const p = push({})
    assert.equal(p.enabled, false)
    await p.registerDevice('u1', { token: DEVICE, env: 'sandbox' })
    await p.driverMoved(position(9))
    assert.equal(await p.statusChanged({ code: 'NT-LIVE', status: 'ready' }), 0)
    assert.equal(sent.length, 0)
  })

  test('the provider token is a valid ES256 JWT for the team and key', async () => {
    const p = push()
    await p.registerDevice('u1', { token: DEVICE, env: 'sandbox' })
    await p.statusChanged({ code: 'NT-LIVE', status: 'ready' })
    const [h, c, s] = sent[0]!.jwt.split('.')
    assert.deepEqual(JSON.parse(Buffer.from(h!, 'base64url').toString()), { alg: 'ES256', kid: 'KEY1234567' })
    assert.equal(JSON.parse(Buffer.from(c!, 'base64url').toString()).iss, 'TEAM123456')
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url')))
  })

  test('a status change alerts the owner of the booking with localisation keys', async () => {
    const p = push()
    await p.registerDevice('u1', { token: DEVICE, env: 'production' })
    await p.registerDevice('someone-else', { token: 'dd'.repeat(32), env: 'production' })
    assert.equal(await p.statusChanged({ code: 'NT-LIVE', status: 'ready' }), 1)
    const m = sent[0]!
    assert.equal(m.token, DEVICE)
    assert.equal(m.topic, 'ro.norgelis.app')
    assert.equal(m.pushType, 'alert')
    assert.equal((m.payload.aps as any).alert['loc-key'], 'push.status.ready')
    assert.deepEqual((m.payload.aps as any).alert['loc-args'], ['Apple iPhone 13'])
    assert.equal(m.payload.code, 'NT-LIVE')
  })

  test('the driver starts the Live Activity once, then updates it at most every 30 s unless the ETA moves, and ends it', async () => {
    const p = push()
    await p.registerDevice('u1', { token: DEVICE, env: 'sandbox', startToken: START })
    await p.driverMoved(position(12))
    assert.equal(sent.length, 1)
    const start = sent[0]!
    assert.equal(start.token, START)
    assert.equal(start.topic, 'ro.norgelis.app.push-type.liveactivity')
    const aps = start.payload.aps as any
    assert.equal(aps.event, 'start')
    assert.equal(aps['attributes-type'], 'DriverActivityAttributes')
    assert.deepEqual(aps.attributes, { code: 'NT-LIVE', device: 'Apple iPhone 13', startedAt: Math.floor(clock / 1000) })
    assert.equal(aps['content-state'].etaMinutes, 12)
    assert.equal(aps['content-state'].phase, 'onTheWay')

    // The started activity sends its own token back through the app.
    await p.registerActivity('nt-live', { token: ACTIVITY, env: 'sandbox' })
    sent = []
    clock += 5_000
    await p.driverMoved(position(11))
    assert.equal(sent.length, 0, 'too soon, even with a new ETA')
    clock += 10_000
    await p.driverMoved(position(11))
    assert.equal(sent.length, 1, 'the ETA moved')
    assert.equal((sent[0]!.payload.aps as any).event, 'update')
    assert.equal(sent[0]!.priority, 5)
    clock += 15_000
    await p.driverMoved(position(11))
    assert.equal(sent.length, 1, 'same ETA within 30 s')
    clock += 20_000
    await p.driverMoved(position(2))
    assert.equal(sent.length, 2)
    const arriving = sent[1]!
    assert.equal((arriving.payload.aps as any)['content-state'].phase, 'arriving')
    assert.equal(arriving.priority, 10, 'arriving lights the screen')
    assert.ok((arriving.payload.aps as any).alert)

    await p.driverStopped('NT-LIVE', 'arrived')
    const end = sent[2]!
    assert.equal((end.payload.aps as any).event, 'end')
    assert.equal((end.payload.aps as any)['content-state'].phase, 'arrived')
    assert.equal(await db.collection('push_activities').countDocuments({}), 0)
    await p.driverStopped('NT-LIVE')
    assert.equal(sent.length, 3, 'ending twice sends once')
  })

  test('a phone with Live Activities off gets a plain alert; a closed job gets nothing', async () => {
    const p = push()
    await p.registerDevice('u1', { token: DEVICE, env: 'sandbox' })
    await p.driverMoved(position(7))
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.pushType, 'alert')
    assert.equal((sent[0]!.payload.aps as any).alert['loc-key'], 'push.driver.body')

    sent = []
    await db.collection('bookings').insertOne({ code: 'NT-DONE', status: 'done', userId: 'u1' })
    await p.driverMoved(position(7, 'NT-DONE'))
    assert.equal(sent.length, 0)
  })

  test('Apple saying a token is dead removes it', async () => {
    const p = push()
    await p.registerDevice('u1', { token: DEVICE, env: 'sandbox' })
    answer = () => ({ status: 410, reason: 'Unregistered' })
    await p.statusChanged({ code: 'NT-LIVE', status: 'repairing' })
    assert.equal(await db.collection('push_devices').countDocuments({}), 0)
  })

  test('a token from the other APNs environment is retried there once and remembered', async () => {
    const p = push()
    await p.registerDevice('u1', { token: DEVICE, env: 'production' })
    answer = (m) => (m.env === 'production' ? { status: 400, reason: 'BadDeviceToken' } : { status: 200 })
    assert.equal(await p.statusChanged({ code: 'NT-LIVE', status: 'ready' }), 1)
    assert.deepEqual(sent.map((m) => m.env), ['production', 'sandbox'])
    assert.equal((await db.collection('push_devices').findOne({ token: DEVICE }))?.env, 'sandbox')
    answer = () => ({ status: 400, reason: 'BadDeviceToken' })
    await p.statusChanged({ code: 'NT-LIVE', status: 'ready' })
    assert.equal(await db.collection('push_devices').countDocuments({}), 0, 'dead on both hosts')
  })

  test('deleting the account forgets its phones', async () => {
    const p = push()
    await p.registerDevice('u1', { token: DEVICE, env: 'sandbox' })
    await p.forgetUser('u1')
    assert.equal(await db.collection('push_devices').countDocuments({}), 0)
  })
})
