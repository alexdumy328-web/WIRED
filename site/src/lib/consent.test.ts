import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONSENT_STORAGE_KEY,
  PREFERENCE_KEYS,
  canStorePreferences,
  closeCookieSettings,
  openCookieSettings,
  reloadConsentState,
  saveConsent,
} from './consent'

function createMemoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  }
}

describe('consent.ts', () => {
  const prevWindow = globalThis.window
  let storage: ReturnType<typeof createMemoryStorage>

  beforeEach(() => {
    storage = createMemoryStorage()
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: storage },
      configurable: true,
      writable: true,
    })
    reloadConsentState()
  })

  afterEach(() => {
    if (prevWindow === undefined) {
      // @ts-expect-error restoring undefined window in node env
      delete globalThis.window
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: prevWindow,
        configurable: true,
        writable: true,
      })
    }
  })

  it('denies optional preference storage before the visitor decides', () => {
    expect(canStorePreferences()).toBe(false)
    expect(storage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })

  it('allows preference storage after explicit opt-in and persists choice', () => {
    saveConsent(true)
    expect(canStorePreferences()).toBe(true)
    const raw = storage.getItem(CONSENT_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.preferences).toBe(true)
    expect(parsed.v).toBe(1)
    expect(typeof parsed.decidedAt).toBe('string')
  })

  it('clears preference storage keys when consent is declined or withdrawn', () => {
    for (const key of PREFERENCE_KEYS) {
      storage.setItem(key, 'value')
    }
    saveConsent(true)
    expect(canStorePreferences()).toBe(true)

    saveConsent(false)
    expect(canStorePreferences()).toBe(false)
    for (const key of PREFERENCE_KEYS) {
      expect(storage.getItem(key)).toBeNull()
    }
  })

  it('ignores corrupt or outdated consent payloads', () => {
    storage.setItem(CONSENT_STORAGE_KEY, '{not-json')
    reloadConsentState()
    expect(canStorePreferences()).toBe(false)

    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 999, preferences: true, decidedAt: '2026-01-01' }))
    reloadConsentState()
    expect(canStorePreferences()).toBe(false)
  })

  it('opens and closes cookie settings without altering stored preference decision', () => {
    openCookieSettings()
    expect(canStorePreferences()).toBe(false)
    closeCookieSettings()
    expect(storage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })
})
