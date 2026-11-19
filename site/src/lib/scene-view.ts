import { useSyncExternalStore } from 'react'
import type { StopId } from '../three/contract'

/** Reactive mirror of what the 3D window shows, for its label and the booking modal. */
let state = { stop: 'overview' as StopId, modal: false }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function setViewStop(stop: StopId) {
  if (state.stop === stop) return
  state = { ...state, stop }
  emit()
}

export function setModalOpen(modal: boolean) {
  if (state.modal === modal) return
  state = { ...state, modal }
  emit()
}

export function useSceneView() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
