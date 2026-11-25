/**
 * Apple push notifications for the iOS app: status alerts, and the "driver on the way" Live Activity.
 *
 * Off until APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY (the .p8 key's text) are set. Nothing else changes
 * while it is off: the app keeps polling, and every call here is a no-op.
 *
 * Alerts carry localisation keys, not text, so the phone shows them in its own language
 * (the keys live in the app's Localizable.strings).
 */
import http2 from 'node:http2'
import { createPrivateKey, sign, type KeyObject } from 'node:crypto'
import type { Collection, Db } from 'mongodb'
import { DRIVER_STATUSES as OPEN_FOR_DRIVER, type DriverPosition } from './admin/driver.ts'

export type ApnsEnv = 'sandbox' | 'production'

export type ApnsMessage = {
  token: string
  env: ApnsEnv
  pushType: 'alert' | 'liveactivity'
  priority: 5 | 10
  payload: Record<string, unknown>
  /** Groups alerts for the same booking, so a newer status replaces the older one. */
  collapseId?: string
}

export type ApnsResult = { status: number; reason?: string }
/** Sends one message. Swapped for a fake in tests. */
export type ApnsTransport = (message: ApnsMessage & { topic: string; jwt: string }) => Promise<ApnsResult>

export type ApnsConfig = { keyId: string; teamId: string; key: KeyObject; bundleId: string }

export function apnsConfig(env: Record<string, string | undefined>): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim()
  const teamId = env.APNS_TEAM_ID?.trim() || env.APPLE_TEAM_ID?.trim()
  // Vercel keeps newlines, but a key pasted as one line with literal \n works too.
  const pem = env.APNS_KEY?.trim().replace(/\\n/g, '\n')
  if (!keyId || !teamId || !pem) return null
  try {
    return { keyId, teamId, key: createPrivateKey(pem), bundleId: env.APNS_BUNDLE_ID?.trim() || 'ro.norgelis.app' }
  } catch {
    console.warn('[push] APNS_KEY is not a valid private key: push stays off')
    return null
  }
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url')

/** Apple's provider token: ES256, reused for 50 minutes (Apple refuses tokens older than an hour or renewed too often). */
function tokenMaker(config: ApnsConfig, now: () => number) {
  let cached: { at: number; jwt: string } | null = null
  return () => {
    if (cached && now() - cached.at < 50 * 60_000) return cached.jwt
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))
    const claims = b64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now() / 1000) }))
    const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: config.key, dsaEncoding: 'ieee-p1363' })
    cached = { at: now(), jwt: `${header}.${claims}.${b64url(signature)}` }
    return cached.jwt
  }
}

/** HTTP/2 to Apple, one connection per host, closed when idle so a serverless instance can freeze cleanly. */
export function http2Transport(): ApnsTransport {
  const sessions = new Map<string, http2.ClientHttp2Session>()
  const session = (host: string) => {
    const open = sessions.get(host)
    if (open && !open.closed && !open.destroyed) return open
    const s = http2.connect(`https://${host}`)
    s.setTimeout(10_000, () => s.close())
    s.on('error', () => sessions.delete(host))
    s.on('close', () => sessions.delete(host))
    s.unref()
    sessions.set(host, s)
    return s
  }
  return (m) =>
    new Promise<ApnsResult>((resolve) => {
      const host = m.env === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
      let req: http2.ClientHttp2Stream
      try {
        req = session(host).request({
          ':method': 'POST',
          ':path': `/3/device/${m.token}`,
          authorization: `bearer ${m.jwt}`,
          'apns-topic': m.topic,
          'apns-push-type': m.pushType,
          'apns-priority': String(m.priority),
          ...(m.collapseId ? { 'apns-collapse-id': m.collapseId } : {}),
          'content-type': 'application/json',
        })
      } catch (error) {
        resolve({ status: 0, reason: (error as Error).message })
        return
      }
      let status = 0
      let body = ''
      req.setTimeout(8_000, () => req.close(http2.constants.NGHTTP2_CANCEL))
      req.on('response', (headers) => (status = Number(headers[':status'])))
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        let reason: string | undefined
        try {
          reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined
        } catch {
          reason = undefined
        }
        resolve({ status, reason })
      })
      req.on('error', (error) => resolve({ status: 0, reason: error.message }))
      req.end(JSON.stringify(m.payload))
    })
}

/** A phone of a signed-in user. `startToken` lets the server start the Live Activity on its own. */
type DeviceDoc = { token: string; userId: string; env: ApnsEnv; startToken?: string; updatedAt: Date }
/** A running Live Activity, bound to one booking. Whoever holds the code may follow it, as on the website. */
type ActivityDoc = { token: string; code: string; env: ApnsEnv; updatedAt: Date }
/** What was last sent for a booking, so a driver posting every few seconds does not become a push every few seconds. */
type LiveDoc = { code: string; startedAt: Date; sentAt: Date; eta: number | null; ended?: boolean }
type BookingDoc = { code: string; status: string; userId?: string; device?: { brand?: string; model?: string } }

/** The Live Activity's moving part. Must match `DriverActivityAttributes.ContentState` in the app. */
export type LiveState = { driverName: string; etaMinutes: number | null; phase: 'onTheWay' | 'arriving' | 'arrived' | 'ended'; updatedAt: number }

/** At most one update this often per booking, unless the ETA moved. Apple does not budget priority 5 updates. */
const UPDATE_EVERY_MS = 30_000
const MIN_GAP_MS = 10_000
/** "Arriving" below this many minutes: sent at priority 10 so the lock screen lights up. */
const ARRIVING_MIN = 2
const DRIVER_STATUSES = new Set(OPEN_FOR_DRIVER)

/** Apple's answers that mean the token is dead and should be forgotten. */
const deadToken = (r: ApnsResult) => r.status === 410 || (r.status === 400 && (r.reason === 'BadDeviceToken' || r.reason === 'DeviceTokenNotForTopic'))

export type Push = ReturnType<typeof createPush>

export function createPush(db: Db, env: Record<string, string | undefined>, options: { transport?: ApnsTransport; now?: () => number } = {}) {
  const config = apnsConfig(env)
  const now = options.now ?? Date.now
  const transport = options.transport ?? http2Transport()
  const jwt = config ? tokenMaker(config, now) : () => ''
  const devices: Collection<DeviceDoc> = db.collection('push_devices')
  const activities: Collection<ActivityDoc> = db.collection('push_activities')
  const live: Collection<LiveDoc> = db.collection('push_live')
  const bookings: Collection<BookingDoc> = db.collection('bookings')

  let ready: Promise<unknown> | null = null
  const ensureIndexes = () =>
    (ready ??= Promise.all([
      devices.createIndex({ token: 1 }, { unique: true, name: 'token' }),
      devices.createIndex({ userId: 1 }, { name: 'userId' }),
      // A phone that stops checking in for 60 days is gone (the app re-registers on every launch).
      devices.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 60 * 86_400, name: 'ttl_60d' }),
      activities.createIndex({ token: 1 }, { unique: true, name: 'token' }),
      activities.createIndex({ code: 1 }, { name: 'code' }),
      // A Live Activity lasts at most 12 hours on screen (8 active plus 4 stale).
      activities.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 12 * 3600, name: 'ttl_12h' }),
      live.createIndex({ code: 1 }, { unique: true, name: 'code' }),
      live.createIndex({ sentAt: 1 }, { expireAfterSeconds: 12 * 3600, name: 'ttl_12h' }),
    ]).catch(() => {
      ready = null
    }))

  async function send(messages: ApnsMessage[]): Promise<number> {
    if (!config || messages.length === 0) return 0
    const topic = (m: ApnsMessage) => (m.pushType === 'liveactivity' ? `${config.bundleId}.push-type.liveactivity` : config.bundleId)
    const one = (m: ApnsMessage) => transport({ ...m, topic: topic(m), jwt: jwt() }).catch((error: Error): ApnsResult => ({ status: 0, reason: error.message }))
    const results = await Promise.all(
      messages.map(async (m) => {
        const first = await one(m)
        if (!(first.status === 400 && first.reason === 'BadDeviceToken')) return first
        // A build signed for development sends sandbox tokens even when it says production (and the other way round).
        // Try the other host once, and remember it when it works.
        const env: ApnsEnv = m.env === 'production' ? 'sandbox' : 'production'
        const second = await one({ ...m, env })
        if (second.status === 200) {
          await Promise.all([devices.updateMany({ token: m.token }, { $set: { env } }), activities.updateMany({ token: m.token }, { $set: { env } })]).catch(() => undefined)
        }
        return second
      }),
    )
    const dead = messages.filter((_, i) => deadToken(results[i]!)).map((m) => m.token)
    if (dead.length) {
      await Promise.all([
        devices.deleteMany({ token: { $in: dead } }),
        devices.updateMany({ startToken: { $in: dead } }, { $unset: { startToken: '' } }),
        activities.deleteMany({ token: { $in: dead } }),
      ]).catch(() => undefined)
    }
    const failed = results.filter((r) => r.status !== 200 && !deadToken(r))
    if (failed.length) console.warn('[push] not delivered:', failed.map((r) => `${r.status} ${r.reason ?? ''}`.trim()).join(', '))
    return results.filter((r) => r.status === 200).length
  }

  const seconds = () => Math.floor(now() / 1000)
  const deviceName = (b: BookingDoc | null) => [b?.device?.brand, b?.device?.model].filter(Boolean).join(' ')

  function state(d: Pick<DriverPosition, 'name' | 'etaMinutes'> | null, phase?: LiveState['phase']): LiveState {
    const eta = d?.etaMinutes ?? null
    return {
      driverName: d?.name ?? '',
      etaMinutes: eta,
      phase: phase ?? (eta !== null && eta <= ARRIVING_MIN ? 'arriving' : 'onTheWay'),
      updatedAt: seconds(),
    }
  }

  async function activityMessages(code: string, aps: Record<string, unknown>, priority: 5 | 10): Promise<ApnsMessage[]> {
    const tokens = await activities.find({ code }).limit(20).toArray()
    return tokens.map((t) => ({ token: t.token, env: t.env, pushType: 'liveactivity' as const, priority, payload: { aps: { timestamp: seconds(), ...aps } } }))
  }

  return {
    enabled: Boolean(config),

    /** The app calls this on every launch for a signed-in user (tokens change on reinstall and restore). */
    async registerDevice(userId: string, input: { token: string; env: ApnsEnv; startToken?: string | null }): Promise<void> {
      await ensureIndexes()
      const set: Partial<DeviceDoc> = { userId, env: input.env, updatedAt: new Date(now()) }
      const update: Record<string, unknown> = { $set: set }
      if (input.startToken) set.startToken = input.startToken
      else if (input.startToken === null) update.$unset = { startToken: '' }
      await devices.updateOne({ token: input.token }, update, { upsert: true })
    },

    /** Sign-out: this phone stops getting the account's alerts. */
    async forgetDevice(token: string, userId: string): Promise<void> {
      await devices.deleteOne({ token, userId })
    },

    /** Account deleted: every phone of it. */
    async forgetUser(userId: string): Promise<void> {
      await devices.deleteMany({ userId })
    },

    /** A Live Activity's own push token. It may change while the activity runs, so this is an upsert. */
    async registerActivity(code: string, input: { token: string; env: ApnsEnv }): Promise<void> {
      await ensureIndexes()
      await activities.updateOne({ token: input.token }, { $set: { code: code.toUpperCase(), env: input.env, updatedAt: new Date(now()) } }, { upsert: true })
    },

    /** A new status the customer was told about by email. Same rule: only real changes, only when the owner left Notify on. */
    async statusChanged(booking: { code: string; status: string }): Promise<number> {
      if (!config) return 0
      const found = await bookings.findOne({ code: booking.code }, { projection: { userId: 1, code: 1, status: 1, device: 1 } })
      if (!found?.userId) return 0
      const phones = await devices.find({ userId: found.userId }).limit(10).toArray()
      const device = deviceName(found)
      return send(
        phones.map((p) => ({
          token: p.token,
          env: p.env,
          pushType: 'alert',
          priority: 10,
          collapseId: `status-${booking.code}`,
          payload: {
            aps: {
              alert: { 'title-loc-key': 'push.status.title', 'title-loc-args': [booking.code], 'loc-key': `push.status.${booking.status}`, 'loc-args': [device || booking.code] },
              sound: 'default',
              'thread-id': booking.code,
            },
            code: booking.code,
          },
        })),
      )
    },

    /**
     * The driver posted a position. Starts the customer's Live Activity the first time (or alerts a phone that
     * cannot show one), then updates it every 30 seconds or when the ETA changes.
     */
    async driverMoved(d: DriverPosition): Promise<void> {
      if (!config || !d.bookingCode) return
      const code = d.bookingCode
      const t = now()
      const prev = await live.findOne({ code })
      if (prev && !prev.ended) {
        const eta = d.etaMinutes ?? null
        const since = t - prev.sentAt.getTime()
        if (since < MIN_GAP_MS || (since < UPDATE_EVERY_MS && eta === prev.eta)) return
        await live.updateOne({ code }, { $set: { sentAt: new Date(t), eta } })
        const s = state(d)
        const arriving = s.phase === 'arriving' && (prev.eta === null || prev.eta > ARRIVING_MIN)
        await send(await activityMessages(code, { event: 'update', 'content-state': s, 'stale-date': seconds() + 180, ...(arriving ? { alert: { title: { 'loc-key': 'push.driver.arriving' }, body: { 'loc-key': 'push.driver.arriving.body', 'loc-args': [s.driverName] } } } : {}) }, arriving ? 10 : 5))
        return
      }
      const booking = await bookings.findOne({ code }, { projection: { userId: 1, code: 1, status: 1, device: 1 } })
      if (!booking || !DRIVER_STATUSES.has(booking.status)) return
      // Claim the start once, even with two instances racing (unique index on code).
      const claimed = await live
        .updateOne({ code, $or: [{ ended: true }] }, { $set: { startedAt: new Date(t), sentAt: new Date(t), eta: d.etaMinutes ?? null }, $unset: { ended: '' } })
        .then((r) => r.modifiedCount > 0)
      const inserted = claimed
        ? true
        : await live.insertOne({ code, startedAt: new Date(t), sentAt: new Date(t), eta: d.etaMinutes ?? null }).then(
            () => true,
            () => false,
          )
      if (!inserted) return
      const s = state(d)
      // A Live Activity the customer already started from the app gets the first update right away.
      const messages = await activityMessages(code, { event: 'update', 'content-state': s, 'stale-date': seconds() + 180 }, 5)
      if (booking.userId) {
        const phones = await devices.find({ userId: booking.userId }).limit(10).toArray()
        const alert = { title: { 'loc-key': 'push.driver.title' }, body: { 'loc-key': 'push.driver.body', 'loc-args': [s.driverName] }, sound: 'default' }
        for (const p of phones) {
          if (p.startToken && messages.length === 0) {
            messages.push({
              token: p.startToken,
              env: p.env,
              pushType: 'liveactivity',
              priority: 10,
              payload: {
                aps: {
                  timestamp: seconds(),
                  event: 'start',
                  'content-state': s,
                  'attributes-type': 'DriverActivityAttributes',
                  attributes: { code, device: deviceName(booking), startedAt: seconds() },
                  'stale-date': seconds() + 180,
                  alert,
                },
              },
            })
          } else if (!p.startToken) {
            // Live Activities off on that phone: a plain alert instead.
            messages.push({ token: p.token, env: p.env, pushType: 'alert', priority: 10, collapseId: `driver-${code}`, payload: { aps: { alert: { 'title-loc-key': 'push.driver.title', 'loc-key': 'push.driver.body', 'loc-args': [s.driverName] }, sound: 'default', 'thread-id': code }, code } })
          }
        }
      }
      await send(messages)
    },

    /** The driver is at the door: an alert, and the Live Activity shows "arrived" before it closes. */
    async driverArrived(code: string, driverName: string): Promise<void> {
      if (!config) return
      const booking = await bookings.findOne({ code }, { projection: { userId: 1 } })
      if (booking?.userId) {
        const phones = await devices.find({ userId: booking.userId }).limit(10).toArray()
        await send(phones.map((p) => ({ token: p.token, env: p.env, pushType: 'alert' as const, priority: 10 as const, collapseId: `driver-${code}`, payload: { aps: { alert: { 'title-loc-key': 'push.driver.at_door', 'loc-key': 'push.driver.at_door.body', 'loc-args': [driverName] }, sound: 'default', 'thread-id': code }, code } })))
      }
      await this.driverStopped(code, 'arrived')
    },

    /** The trip to this booking is over: arrived (collected or handed back) or cancelled. The Live Activity ends. */
    async driverStopped(code: string | undefined, phase: 'arrived' | 'ended' = 'ended'): Promise<void> {
      if (!config || !code) return
      const prev = await live.findOneAndUpdate({ code, ended: { $ne: true } }, { $set: { ended: true, sentAt: new Date(now()) } })
      if (!prev) return
      await send(await activityMessages(code, { event: 'end', 'content-state': state(null, phase), 'dismissal-date': seconds() + (phase === 'arrived' ? 15 * 60 : 60) }, 10))
      await activities.deleteMany({ code })
    },
  }
}
