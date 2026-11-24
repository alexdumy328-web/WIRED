import { useEffect, useRef } from 'react'
import { sceneState, type ModelId } from '../three/contract'

/** Show a device in the 3D viewer, exploded (or the default laptop, assembled, for null). */
export function showModel(model: ModelId | null) {
  sceneState.model = model
  sceneState.explode = model ? 1 : 0
  if (!model) sceneState.highlight = null
}

/** True while a popup owns the 3D viewer; sections must not change the device then. */
let paused = false
export const pauseDeviceSections = (p: boolean) => {
  paused = p
  if (!p) window.dispatchEvent(new Event('scroll'))
}

/**
 * Marks a section as owning the 3D viewer. While the section covers the middle of the
 * viewport, the viewer shows `model` (null clears it).
 */
export function useDeviceSection<T extends HTMLElement>(model: ModelId | null) {
  const ref = useRef<T>(null)

  const isActive = () => {
    const r = ref.current?.getBoundingClientRect()
    const mid = window.innerHeight / 2
    return !!r && r.top <= mid && r.bottom >= mid
  }
  const modelRef = useRef(model)
  modelRef.current = model

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      if (!paused && isActive()) showModel(modelRef.current)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Re-apply at once when the model changes while active (e.g. a tab click).
  useEffect(() => {
    if (!paused && isActive()) showModel(model)
  }, [model])

  return ref
}
