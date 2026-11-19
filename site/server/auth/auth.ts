import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { emailOTP, jwt } from 'better-auth/plugins'
import { randomBytes } from 'node:crypto'
import type { Db } from 'mongodb'
import type { AuditLog } from '../security/audit.ts'
import { otpMail, pickLang, type OtpKind } from './emails.ts'
import { MailUnavailableError, type Mailer } from './outbox.ts'

export type Env = Record<string, string | undefined>

export const OTP_LENGTH = 6
export const OTP_EXPIRES_SECONDS = 10 * 60
export const OTP_MAX_ATTEMPTS = 5
export const MIN_PASSWORD_LENGTH = 10
export const CLIENT_IP_HEADER = 'x-nt-client-ip'

export type AuthConfig = {
  production: boolean
  secret: string
  baseURL: string
  trustedOrigins: string[]
}

function origins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

/** Reads the environment. Refuses to boot in production without BETTER_AUTH_SECRET. */
export function resolveAuthConfig(env: Env, production: boolean): AuthConfig {
  let secret = env.BETTER_AUTH_SECRET?.trim() ?? ''
  if (!secret) {
    if (production) throw new Error('BETTER_AUTH_SECRET is required in production')
    // Development: a throwaway secret, so sessions end when the server restarts.
    secret = randomBytes(32).toString('base64url')
    console.warn('[auth] BETTER_AUTH_SECRET is unset: using a temporary secret, sessions reset on restart')
  } else if (production && secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
  }

  const appOrigins = origins(env.APP_ORIGINS)
  const vercelHost = env.VERCEL_URL?.trim()
  const baseURL =
    env.BETTER_AUTH_URL?.trim().replace(/\/+$/, '') ||
    appOrigins[0] ||
    (vercelHost ? `https://${vercelHost}` : production ? '' : 'http://localhost:5173')
  if (!baseURL) throw new Error('BETTER_AUTH_URL (or APP_ORIGINS) is required in production')

  const trusted = new Set([baseURL, ...appOrigins])
  if (!production && appOrigins.length === 0) trusted.add('http://localhost:5173')
  return { production, secret, baseURL, trustedOrigins: [...trusted] }
}

export type CreateAuthOptions = {
  db: Db
  env: Env
  config: AuthConfig
  mailer: Mailer
  audit: AuditLog
  /** Turn Better Auth's own rate limiter off (tests that hammer one endpoint). */
  rateLimitEnabled?: boolean
}

export function createAuth(options: CreateAuthOptions) {
  const { db, env, config, mailer, audit } = options
  const googleId = env.GOOGLE_CLIENT_ID?.trim()
  const googleSecret = env.GOOGLE_CLIENT_SECRET?.trim()
  const google = googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret, prompt: 'select_account' as const } : null

  return betterAuth({
    appName: 'Norgelis Tech',
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: mongodbAdapter(db),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      requireEmailVerification: true,
    },
    emailVerification: { sendOnSignIn: true, autoSignInAfterVerification: true },
    ...(google ? { socialProviders: { google } } : {}),

    user: {
      additionalFields: {
        // Not settable from the client: roles change only through the dev dashboard.
        role: { type: 'string', required: false, defaultValue: 'customer', input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Signed cookie so most requests skip the database. Role-gated routes bypass it.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      useSecureCookies: config.production,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: config.production },
      // Express sets this header from req.ip, so a client cannot spoof its own address.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },

    rateLimit: {
      enabled: options.rateLimitEnabled ?? true,
      storage: 'database',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 600, max: 10 },
        '/sign-in/social': { window: 60, max: 20 },
        '/get-session': { window: 60, max: 300 },
      },
    },

    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await audit.record({ action: 'sign_in', actor: { id: String(session.userId) }, ip: session.ipAddress })
          },
        },
      },
    },

    plugins: [
      emailOTP({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_EXPIRES_SECONDS,
        allowedAttempts: OTP_MAX_ATTEMPTS,
        storeOTP: 'hashed',
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        // Per IP. The OTP itself locks after OTP_MAX_ATTEMPTS wrong guesses.
        rateLimit: { window: 60, max: 12 },
        async sendVerificationOTP({ email, otp, type }, ctx) {
          const headers = ctx?.request?.headers ?? ctx?.headers
          const mail = otpMail(email, otp, type as OtpKind, pickLang(headers), OTP_EXPIRES_SECONDS / 60)
          try {
            await mailer.send(mail)
          } catch (error) {
            if (error instanceof MailUnavailableError) throw new APIError('SERVICE_UNAVAILABLE', { message: 'mail_unavailable' })
            throw error
          }
        },
      }),
      jwt({ jwt: { expirationTime: '15m', issuer: config.baseURL, audience: config.baseURL } }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
