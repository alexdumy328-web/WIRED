import type { NextFunction, Request, Response } from 'express'
import { securityHeaders, type HeaderOptions } from './policy.ts'

/** Express middleware that sets the shared security headers on every response. */
export function securityHeadersMiddleware(options: HeaderOptions) {
  const headers = Object.entries(securityHeaders(options))
  return function setSecurityHeaders(_req: Request, res: Response, next: NextFunction) {
    for (const [name, value] of headers) res.setHeader(name, value)
    next()
  }
}
