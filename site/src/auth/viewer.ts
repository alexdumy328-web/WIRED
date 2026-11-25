import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api'

export type Role = 'customer' | 'driver' | 'technician' | 'owner' | 'dev'
export type Viewer = { id: string; email: string; name: string; emailVerified: boolean; role: Role }
type State = { status: 'loading' | 'ready' | 'unavailable'; user: Viewer | null; google: boolean }

let state: State = { status: 'loading', user: null, google: false }
let started = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** Asks the server who is signed in. Call again after signing in or out. */
export async function refreshViewer(): Promise<void> {
  started = true
  const result = await api<{ user: Viewer | null; providers?: { google?: boolean } }>('/api/me')
  if (result.ok) {
    state = { status: 'ready', user: result.data.user, google: result.data.providers?.google === true }
  } else {
    state = { status: 'unavailable', user: null, google: false }
  }
  emit()
}

/** The signed-in user, shared by every component. Loads once on first use. */
export function useViewer() {
  const current = useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
  useEffect(() => {
    if (!started) void refreshViewer()
  }, [])
  return { ...current, refresh: refreshViewer }
}

/** Works in /admin: technicians, owners and devs. */
export const isStaff = (user: Viewer | null) => user?.role === 'technician' || user?.role === 'owner' || user?.role === 'dev'
/** Sees money, settings and stats, and may archive or void. */
export const isManager = (user: Viewer | null) => user?.role === 'owner' || user?.role === 'dev'
