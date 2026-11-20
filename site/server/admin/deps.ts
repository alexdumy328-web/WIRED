import type { Db } from 'mongodb'
import type { Auth, Env } from '../auth/auth.ts'
import type { Mailer } from '../auth/outbox.ts'
import type { Notifier } from '../notify.ts'
import type { SessionService } from '../auth/session.ts'
import type { AuditLog } from '../security/audit.ts'
import type { LimiterRegistry } from '../security/limiter.ts'
import type { BookingAdmin } from './bookings.ts'
import type { SettingsService } from './settings.ts'

export type PlatformDeps = {
  db: Db
  env: Env
  production: boolean
  storeKind: string
  auth: Auth
  sessions: SessionService
  settings: SettingsService
  bookings: BookingAdmin
  audit: AuditLog
  mailer: Mailer
  notifier: Notifier
  limiters: LimiterRegistry
  authConfig: { baseURL: string; trustedOrigins: string[] }
  /** Legacy ADMIN_TOKEN, when set. */
  adminToken: string | undefined
}
