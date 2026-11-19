import { useEffect, useRef } from 'react'
import type { JobCategory } from '../types'
import { sceneState, MODEL_STOP, type ModelId, type StopId } from '../three/contract'
import { setViewStop } from './scene-view'

/** Which bench in the shop each service category lives at. */
export const categoryStop: Record<JobCategory, StopId> = {
  laptop: 'laptop',
  pc: 'laptop',
  it: 'laptop',
  board: 'bench',
  coffee: 'coffee',
  appliance: 'coffee',
  vintage: 'bench',
  auto: 'door',
}

/** Where a hotspot click scrolls to. */
export const stopSection: Record<StopId, string> = {
  overview: 'top',
  pcbWall: 'recenzii',
  bench: 'servicii',
  laptop: 'servicii',
  coffee: 'servicii',
  counter: 'programare',
  door: 'mobil',
}

/** Fly the camera to a station and show (or clear) an exploded device there. */
export function focus(stop: StopId, model: ModelId | null = null) {
  sceneState.focus = model ? MODEL_STOP[model] : stop
  sceneState.frame = 0
  sceneState.model = model
  sceneState.explode = model ? 1 : 0
  if (!model) sceneState.highlight = null
  setViewStop(sceneState.focus)
}

type StationOpts = {
  stop: StopId
  /** Exploded device to show while this section is active. */
  model?: ModelId | null
  /** Called with 0..1 progress of the section through the viewport. */
  onProgress?: (p: number) => void
}

/** True while a popup owns the 3D window; sections must not steer the camera then. */
let paused = false
export const pauseStations = (p: boolean) => {
  paused = p
  if (!p) window.dispatchEvent(new Event('scroll'))
}

/**
 * Marks a section as a camera station. While the section covers the middle of the
 * viewport, the 3D window flies to `stop` (or the model's station).
 */
export function useStation<T extends HTMLElement>(opts: StationOpts) {
  const ref = useRef<T>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts

  const isActive = () => {
    const r = ref.current?.getBoundingClientRect()
    const mid = window.innerHeight / 2
    return !!r && r.top <= mid && r.bottom >= mid
  }

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      const el = ref.current
      if (!el || paused || !isActive()) return
      const o = optsRef.current
      focus(o.stop, o.model ?? null)
      if (o.onProgress) {
        const r = el.getBoundingClientRect()
        o.onProgress(Math.min(Math.max((window.innerHeight / 2 - r.top) / Math.max(r.height, 1), 0), 1))
      }
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

  // Re-apply at once when the stop or model changes while active (e.g. a tab click).
  useEffect(() => {
    if (!paused && isActive()) focus(opts.stop, opts.model ?? null)
  }, [opts.stop, opts.model])

  return ref
}
