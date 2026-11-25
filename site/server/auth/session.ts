import { fromNodeHeaders } from 'better-auth/node'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { AuditLog } from '../security/audit.ts'
import type { Auth, Env } from './auth.ts'
import { bootstrapRole, effectiveRole, isRole, type Role } from './roles.ts'

export type Viewer = {
  id: string
  email: string
  name: string
  emailVerified: boolean
  role: Role
}

/** What the session service needs from Better Auth; tests can pass a fake. */
export type SessionSource = {
  getSession(headers: Headers, fresh: boolean): Promise<{ user: Record<string, unknown> } | null>
  /** Persists a bootstrap promotion. */
  setRole?(userId: string, role: Role): Promise<void>
}

export function betterAuthSource(auth: Auth): SessionSource {
  return {
    async getSession(headers, fresh) {
      const result = await auth.api.getSession({ headers, query: fresh ? { disableCookieCache: true } : undefined })
      return result ? { user: result.user as Record<string, unknown> } : null
    },
    async setRole(userId, role) {
      const context = await auth.$context
      await context.internalAdapter.updateUser(userId, { role })
    },
  }
}

declare module 'express-serve-static-core' {
  interface Locals {
    viewer?: Viewer
  }
}

export function clientIp(req: Request): string | null {
  return req.ip ?? req.socket.remoteAddress ?? null
}

export type SessionService = {
  /** The signed-in user, or null. `fresh` skips the cookie cache and reads the database. */
  viewer(req: Request, fresh?: boolean): Promise<Viewer | null>
  /** 401 without a session. */
  requireAuth: RequestHandler
  /** 401 without a session, 403 when the role is not listed. Always reads the database. */
  requireRole(...roles: Role[]): RequestHandler
}

export function createSessionService(source: SessionSource, env: Env, audit: AuditLog | null): SessionService {
  async function viewer(req: Request, fresh = false): Promise<Viewer | null> {
    let session
    try {
      session = await source.getSession(fromNodeHeaders(req.headers), fresh)
    } catch {
      return null
    }
    if (!session) return null
    const user = session.user
    const email = String(user.email ?? '')
    const emailVerified = user.emailVerified === true
    const stored: Role = isRole(user.role) ? user.role : 'customer'
    const boot = bootstrapRole(env, email, emailVerified)
    const role = effectiveRole(stored, boot)

    // A cached cookie can carry an old role; confirm against the database before promoting.
    if (role !== stored && !fresh) return viewer(req, true)

    if (role !== stored && source.setRole) {
      try {
        await source.setRole(String(user.id), role)
        await audit?.record({ action: 'role_bootstrap', actor: { id: String(user.id), role }, detail: { from: stored, to: role }, ip: clientIp(req) })
      } catch {
        // The effective role still applies for this request.
      }
    }
    return { id: String(user.id), email, name: String(user.name ?? ''), emailVerified, role }
  }

  const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    const found = await viewer(req)
    if (!found) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    res.locals.viewer = found
    next()
  }

  function requireRole(...roles: Role[]): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const found = await viewer(req, true)
      if (!found) {
        res.status(401).json({ error: 'unauthorized' })
        return
      }
      if (!roles.includes(found.role)) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      res.locals.viewer = found
      next()
    }
  }

  return { viewer, requireAuth, requireRole }
}
