/** Tiny in-memory TTL cache with a hard entry cap. One instance per service. */
export type CacheEntry<T> = { value: T; expiresAt: number }

export class TtlCache {
  private readonly max: number
  private readonly entries = new Map<string, CacheEntry<unknown>>()

  constructor(max = 500) {
    this.max = max
  }

  get<T>(key: string): T | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key)
      return null
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.entries.size >= this.max && !this.entries.has(key)) {
      const now = Date.now()
      for (const [entryKey, entry] of this.entries) {
        if (now >= entry.expiresAt) this.entries.delete(entryKey)
      }
      while (this.entries.size >= this.max) {
        const oldest = this.entries.keys().next().value
        if (oldest === undefined) break
        this.entries.delete(oldest)
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs })
  }
}
