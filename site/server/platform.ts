/**
 * Accounts, roles, dashboards and hardening, built around one MongoDB database.
 * app.ts takes an optional Platform; without one the API behaves as before and the account
 * routes answer 503.
 */
import { toNodeHandler } from 'better-auth/node'
import type { Express, Request } from 'express'
import type { Db } from 'mongodb'
import { createBookingAdmin } from './admin/bookings.ts'
import { createDevRouter } from './admin/dev-routes.ts'
import type { PlatformDeps } from './admin/deps.ts'
import { createAdminRouter } from './admin/routes.ts'
import { createSettingsService, type SettingsService } from './admin/settings.ts'
import { createAuth, CLIENT_IP_HEADER, resolveAuthConfig, type Env } from './auth/auth.ts'
import { createMailer, type Mailer } from './auth/outbox.ts'
import { createNotifier, type Notifier } from './notify.ts'
import { betterAuthSource, createSessionService, type SessionService, type SessionSource } from './auth/session.ts'
import { createAuditLog, type AuditLog } from './security/audit.ts'
import { attachErrorLog } from './security/error-log.ts'
import { LimiterRegistry } from './security/limiter.ts'
import { resolvePickupRates } from './pickup-service.ts'

export type Platform = {
  readonly settings: SettingsService
  readonly sessions: SessionService
  readonly audit: AuditLog
  readonly mailer: Mailer
  readonly notifier: Notifier
  readonly deps: PlatformDeps
  /** Before body parsing: the Better Auth handler at /api/auth/*. */
  mountEarly(app: Express): void
  /** After the public routes: /api/me, /api/admin, /api/dev, /api/settings/public. */
  mountApi(app: Express): void
  /** Id of the signed-in user, if any (cookie cache is fine for this). */
  userId(req: Request): Promise<string | null>
}

export type PlatformOptions = {
  db: Db
  env?: Env
  production?: boolean
  storeKind?: string
  fetchImpl?: typeof fetch
  quiet?: boolean
  /** Better Auth's own limiter; on by default. */
  rateLimitEnabled?: boolean
  /** Replace Better Auth as the session source (unit tests). */
  sessionSource?: SessionSource
}

export async function createPlatform(options: PlatformOptions): Promise<Platform> {
  const env = options.env ?? process.env
  const production = options.production ?? env.NODE_ENV === 'production'
  const config = resolveAuthConfig(env, production)
  const { db } = options

  await attachErrorLog(db).catch(() => undefined)
  const audit = createAuditLog(db, config.secret)
  const mailer = createMailer({ db, env, production, fetchImpl: options.fetchImpl, quiet: options.quiet })
  const auth = createAuth({ db, env, config, mailer, audit, rateLimitEnabled: options.rateLimitEnabled })
  const sessions = createSessionService(options.sessionSource ?? betterAuthSource(auth), env, audit)
  const settings = createSettingsService(db, resolvePickupRates())
  const adminToken = env.ADMIN_TOKEN?.trim() || undefined
  const notifier = createNotifier({ mailer, origin: config.baseURL, ownerEmails: env.OWNER_EMAILS, quiet: options.quiet })

  const deps: PlatformDeps = {
    db,
    env,
    production,
    storeKind: options.storeKind ?? 'mongo',
    auth,
    sessions,
    settings,
    bookings: createBookingAdmin(db),
    audit,
    mailer,
    notifier,
    limiters: new LimiterRegistry(),
    authConfig: { baseURL: config.baseURL, trustedOrigins: config.trustedOrigins },
    adminToken,
  }

  const authHandler = toNodeHandler(auth)
  const authLimit = deps.limiters.create('auth', 60_000, 300)

  return {
    settings,
    sessions,
    audit,
    mailer,
    notifier,
    deps,
    mountEarly(app) {
      app.all('/api/auth/*splat', authLimit, (req, res) => {
        // Better Auth reads the client address from this header. Overwriting it here means a
        // client cannot pick its own rate-limit bucket by sending X-Forwarded-For.
        req.headers[CLIENT_IP_HEADER] = req.ip ?? req.socket.remoteAddress ?? ''
        res.set('Cache-Control', 'no-store')
        return authHandler(req, res)
      })
    },
    mountApi(app) {
      app.use('/api/dev', createDevRouter(deps))
      app.use('/api', createAdminRouter(deps))
    },
    async userId(req) {
      return (await sessions.viewer(req))?.id ?? null
    },
  }
}

