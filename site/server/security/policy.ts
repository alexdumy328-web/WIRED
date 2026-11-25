/**
 * Security header policy. Pure data and no project imports, so scripts/vercel-build.mjs can
 * load it too (it transpiles this file with esbuild) and the CDN serves the same headers
 * as the API.
 */
import { createHash } from 'node:crypto'

export type HeaderOptions = {
  production: boolean
  /** sha256 hashes (base64) of inline scripts that the SPA shell needs. */
  scriptHashes?: string[]
}

/** Hash every inline <script> (no src) in an HTML document, for the CSP script-src list. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    const body = match[1] ?? ''
    if (body.trim() === '') continue
    hashes.push(`sha256-${createHash('sha256').update(body).digest('base64')}`)
  }
  return hashes
}

export function buildCsp(options: HeaderOptions): string {
  const scripts = ["'self'", ...(options.scriptHashes ?? []).map((hash) => `'${hash}'`)]
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scripts,
    'script-src-attr': ["'none'"],
    // The 3D and map libraries inject <style> elements at run time, so inline styles are
    // allowed here (styles only; scripts stay locked to self and one hashed inline script).
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
    'connect-src': ["'self'", 'https://accounts.google.com'],
    'frame-src': ['https://www.openstreetmap.org', 'https://accounts.google.com'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://accounts.google.com'],
    'frame-ancestors': ["'none'"],
  }
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`)
  if (options.production) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

/** Header name/value pairs sent with every response. */
export function securityHeaders(options: HeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildCsp(options),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'X-Frame-Options': 'DENY',
  }
  if (options.production) headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains'
  return headers
}
