import type { Db } from 'mongodb'
import type { Auth, Env } from '../auth/auth.ts'
import type { Mailer } from '../auth/outbox.ts'
import type { Notifier } from '../notify.ts'
import type { SessionService } from '../auth/session.ts'
import type { AuditLog } from '../security/audit.ts'
import type { LimiterRegistry } from '../security/limiter.ts'
import type { Documents } from '../documents/index.ts'
import type { BookingAdmin } from './bookings.ts'
import type { Counters } from './counters.ts'
import type { Customers } from './customers.ts'
import type { Photos } from './photos.ts'
import type { Warranties } from './warranties.ts'
import type { SettingsService } from './settings.ts'
import type { DriverTracking } from './driver.ts'

export type PlatformDeps = {
  db: Db
  env: Env
  production: boolean
  storeKind: string
  auth: Auth
  sessions: SessionService
  settings: SettingsService
  bookings: BookingAdmin
  counters: Counters
  customers: Customers
  warranties: Warranties
  driver: DriverTracking
  photos: Photos
  documents: Documents
  audit: AuditLog
  mailer: Mailer
  notifier: Notifier
  limiters: LimiterRegistry
  authConfig: { baseURL: string; trustedOrigins: string[] }
  /** Legacy ADMIN_TOKEN, when set. */
  adminToken: string | undefined
}
