import { createHash, timingSafeEqual } from 'node:crypto'

/** Constant-time string comparison: both sides are hashed first so lengths never leak. */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = createHash('sha256').update(a).digest()
  const right = createHash('sha256').update(b).digest()
  return timingSafeEqual(left, right)
}
