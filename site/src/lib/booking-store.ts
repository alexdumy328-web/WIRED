import { useSyncExternalStore } from 'react'

/** Tiny shared store so "Book this" buttons anywhere on the page can preselect jobs in the form. */
type State = { jobIds: string[]; mode: 'shop' | 'mobile' | null; nonce: number }
let state: State = { jobIds: [], mode: null, nonce: 0 }
const subs = new Set<() => void>()

export function preselect(jobIds: string[], mode: 'shop' | 'mobile') {
  state = { jobIds, mode, nonce: state.nonce + 1 }
  subs.forEach((f) => f())
  document.getElementById('programare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function usePreselect() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
