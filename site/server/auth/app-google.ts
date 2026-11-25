/**
 * Google sign-in for the iOS app.
 *
 * The app cannot run Google's web flow itself, and the browser it opens (ASWebAuthenticationSession) keeps its own
 * cookies. So the website does the sign-in, then hands the session to the app through a one-time code:
 *
 *   app opens  GET /api/app/google            -> Better Auth's Google sign-in, coming back to /api/app/google/done
 *   Google  -> /api/auth/callback/google      -> session cookie set in that browser
 *   browser -> GET /api/app/google/done        -> a code valid for 2 minutes, once; redirect to norgelis://auth?code=
 *   app     -> POST /api/app/google/exchange   -> the session cookie, set on the app's own request
 *
 * The code is random (32 bytes), stored hashed, single use and short lived. Only the app's URL scheme receives it,
 * because ASWebAuthenticationSession hands the norgelis:// redirect to the app that opened it.
 */
import { createHash, randomBytes } from 'node:crypto'
import express from 'express'
import type { Router } from 'express'
import type { Db } from 'mongodb'
import type { Auth } from './auth.ts'

const CODE_TTL_MS = 2 * 60_000
const APP_CALLBACK = 'norgelis://auth'

type Handoff = { hash: string; cookies: string[]; at: Date }

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

/** The Better Auth session token cookie in a Cookie header, as "name=value" (the signed value kept as it is). */
export function sessionCookies(header: string | undefined): string[] {
  return (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => /^(__Secure-)?better-auth\.session_token=/.test(part))
}

export function createAppGoogleRouter(options: { db: Db; auth: Auth; production: boolean; googleEnabled: boolean; now?: () => number }): Router {
  const { db, auth, production, googleEnabled } = options
  const now = options.now ?? Date.now
  const handoffs = db.collection<Handoff>('app_handoffs')
  let ready: Promise<unknown> | null = null
  const ensureIndexes = () =>
    (ready ??= Promise.all([
      handoffs.createIndex({ hash: 1 }, { unique: true, name: 'hash' }),
      handoffs.createIndex({ at: 1 }, { expireAfterSeconds: 600, name: 'ttl' }),
    ]).catch(() => {
      ready = null
    }))

  const router = express.Router()
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  const fail = (res: express.Response, reason: string) => res.redirect(302, `${APP_CALLBACK}?error=${encodeURIComponent(reason)}`)

  /** Step 1: start Google's sign-in in the app's browser, coming back to /done. */
  router.get('/google', async (req, res) => {
    if (!googleEnabled) return fail(res, 'unavailable')
    try {
      const response = (await auth.api.signInSocial({
        body: { provider: 'google', callbackURL: '/api/app/google/done', errorCallbackURL: '/api/app/google/done' },
        headers: new Headers({ cookie: req.headers.cookie ?? '' }),
        asResponse: true,
      })) as Response
      // The OAuth state cookie must reach the browser, or the callback is refused.
      for (const cookie of response.headers.getSetCookie()) res.append('Set-Cookie', cookie)
      const body = (await response.json()) as { url?: string }
      if (!body.url) return fail(res, 'unavailable')
      res.redirect(302, body.url)
    } catch (error) {
      console.warn('[app-google] start failed:', (error as Error).message)
      fail(res, 'unavailable')
    }
  })

  /** Step 2: signed in on the website (session cookie present): give the app a one-time code. */
  router.get('/google/done', async (req, res) => {
    if (typeof req.query.error === 'string') return fail(res, req.query.error)
    const cookies = sessionCookies(req.headers.cookie)
    const session = cookies.length ? await auth.api.getSession({ headers: new Headers({ cookie: req.headers.cookie ?? '' }) }).catch(() => null) : null
    if (!session) return fail(res, 'no_session')
    await ensureIndexes()
    const code = randomBytes(32).toString('base64url')
    await handoffs.insertOne({ hash: sha(code), cookies, at: new Date(now()) })
    res.redirect(302, `${APP_CALLBACK}?code=${encodeURIComponent(code)}`)
  })

  /** Step 3: the app trades the code for the session cookie, once. */
  router.post('/google/exchange', express.json({ limit: '2kb' }), async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : ''
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) {
      res.status(400).json({ error: 'invalid' })
      return
    }
    const found = await handoffs.findOneAndDelete({ hash: sha(code) })
    if (!found || now() - found.at.getTime() > CODE_TTL_MS) {
      res.status(401).json({ error: 'expired' })
      return
    }
    for (const pair of found.cookies) {
      res.append('Set-Cookie', `${pair}; Path=/; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}; Max-Age=${30 * 86400}`)
    }
    res.json({ ok: true })
  })

  return router
}
