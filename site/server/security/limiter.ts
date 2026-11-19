import type { NextFunction, Request, Response } from 'express'

export type LimiterStats = { name: string; windowMs: number; max: number; allowed: number; blocked: number; tracked: number }

/** Per-IP fixed-window limiters that also keep counters for the dev dashboard. */
export class LimiterRegistry {
  private readonly stats = new Map<string, { windowMs: number; max: number; allowed: number; blocked: number; hits: Map<string, { count: number; resetAt: number }> }>()

  create(name: string, windowMs: number, max: number) {
    const entry = { windowMs, max, allowed: 0, blocked: 0, hits: new Map<string, { count: number; resetAt: number }>() }
    this.stats.set(name, entry)
    return (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now()
      const key = req.ip ?? req.socket.remoteAddress ?? 'unknown'
      let hit = entry.hits.get(key)
      if (!hit || now >= hit.resetAt) {
        hit = { count: 0, resetAt: now + windowMs }
        entry.hits.set(key, hit)
        if (entry.hits.size > 5000) {
          for (const [ip, value] of entry.hits) if (now >= value.resetAt) entry.hits.delete(ip)
        }
      }
      hit.count += 1
      if (hit.count > max) {
        entry.blocked += 1
        res.setHeader('Retry-After', Math.max(1, Math.ceil((hit.resetAt - now) / 1000)))
        res.status(429).json({ error: 'rate_limited' })
        return
      }
      entry.allowed += 1
      next()
    }
  }

  snapshot(): LimiterStats[] {
    return [...this.stats].map(([name, entry]) => ({
      name,
      windowMs: entry.windowMs,
      max: entry.max,
      allowed: entry.allowed,
      blocked: entry.blocked,
      tracked: entry.hits.size,
    }))
  }
}
