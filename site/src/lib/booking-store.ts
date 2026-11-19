import { useSyncExternalStore } from 'react'
import type { ServiceMode } from '../types'

/** Shared state for the booking popup: any "Book" button can open it with jobs preselected. */
type State = { open: boolean; jobIds: string[]; mode: ServiceMode | null; nonce: number }
let state: State = { open: false, jobIds: [], mode: null, nonce: 0 }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function openBooking(jobIds: string[] = [], mode: ServiceMode | null = null) {
  state = { open: true, jobIds, mode, nonce: state.nonce + 1 }
  emit()
}

/** Kept for callers that preselect a job; it opens the popup. */
export const preselect = (jobIds: string[], mode: ServiceMode) => openBooking(jobIds, mode)

export function closeBooking() {
  state = { ...state, open: false }
  emit()
}

export function useBooking() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
