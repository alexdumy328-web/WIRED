import { useSyncExternalStore } from 'react'

/**
 * GDPR cookie & browser storage consent store.
 *
 * Strictly necessary:
 *   - auth session cookies (better-auth) when signed in
 *   - `nt-consent` in localStorage to remember the visitor's choice
 *
 * Optional preferences (stored only after opt-in):
 *   - `nt-lang` (chosen interface language)
 *   - `nt-theme` (chosen light/dark theme)
 *   - `nt_last_phone` (phone remembered in the booking form)
 */

export const CONSENT_STORAGE_KEY = 'nt-consent'
export const PREFERENCE_KEYS = ['nt-lang', 'nt-theme', 'nt_last_phone'] as const
export const CONSENT_VERSION = 1

export type ConsentChoice = {
  v: number
  preferences: boolean
  decidedAt: string
}

export type ConsentState = {
  choice: ConsentChoice | null
  dialogOpen: boolean
}

function readStoredConsent(): ConsentChoice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ConsentChoice> | null
    if (
      parsed &&
      parsed.v === CONSENT_VERSION &&
      typeof parsed.preferences === 'boolean' &&
      typeof parsed.decidedAt === 'string'
    ) {
      return {
        v: parsed.v,
        preferences: parsed.preferences,
        decidedAt: parsed.decidedAt,
      }
    }
    return null
  } catch {
    return null
  }
}

let state: ConsentState = {
  choice: readStoredConsent(),
  dialogOpen: false,
}

const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** True only after the visitor explicitly allowed optional preference storage. */
export function canStorePreferences(): boolean {
  return state.choice?.preferences === true
}

/** Removes optional preference keys from localStorage when consent is declined or withdrawn. */
export function clearPreferenceStorage() {
  if (typeof window === 'undefined') return
  try {
    for (const key of PREFERENCE_KEYS) {
      window.localStorage.removeItem(key)
    }
  } catch {
    /* storage blocked */
  }
}

export function saveConsent(preferences: boolean) {
  const next: ConsentChoice = {
    v: CONSENT_VERSION,
    preferences,
    decidedAt: new Date().toISOString(),
  }
  if (!preferences) {
    clearPreferenceStorage()
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage blocked */
    }
  }
  state = { choice: next, dialogOpen: false }
  emit()
}

export function openCookieSettings() {
  state = { ...state, dialogOpen: true }
  emit()
}

export function closeCookieSettings() {
  state = { ...state, dialogOpen: false }
  emit()
}

/** Reloads in-memory state from localStorage (used by tests). */
export function reloadConsentState() {
  state = { choice: readStoredConsent(), dialogOpen: false }
  emit()
}

export function useConsent(): ConsentState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
