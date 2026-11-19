import { useEffect, useRef } from 'react'
import type { JobCategory } from '../types'
import { sceneState, type StopId } from '../three/contract'

/** Which bench in the shop each service category lives at. */
export const categoryStop: Record<JobCategory, StopId> = {
  laptop: 'laptop',
  pc: 'laptop',
  it: 'laptop',
  board: 'bench',
  coffee: 'coffee',
  appliance: 'coffee',
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
  door: 'auto',
}

type Explode = { from: number; to: number } // section progress range mapped to explode 0..1

type StationOpts = {
  stop: StopId | null // null = hand control back to the scroll tour
  frame: number // -1..1, where the subject should sit horizontally
  explode?: Explode
  /** Called with 0..1 progress of the section through the viewport. */
  onProgress?: (p: number) => void
}

const ss = sceneState as typeof sceneState & { explode?: number }

/**
 * Marks a section as a camera station. While the section covers the middle of the
 * viewport, the camera flies to `stop` and the subject is framed at `frame`.
 */
export function useStation<T extends HTMLElement>(opts: StationOpts) {
  const ref = useRef<T>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const tick = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const mid = vh / 2
      const o = optsRef.current
      if (r.top <= mid && r.bottom >= mid) {
        sceneState.focus = o.stop
        sceneState.frame = o.frame
        const p = Math.min(Math.max((mid - r.top) / Math.max(r.height, 1), 0), 1)
        o.onProgress?.(p)
        if (o.explode) {
          const e = (p - o.explode.from) / (o.explode.to - o.explode.from)
          ss.explode = Math.min(Math.max(e, 0), 1)
        } else ss.explode = 0
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

  // Re-apply immediately when the stop changes while the section is active (e.g. a tab click).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const mid = window.innerHeight / 2
    if (r.top <= mid && r.bottom >= mid) {
      sceneState.focus = opts.stop
      sceneState.frame = opts.frame
    }
  }, [opts.stop, opts.frame])

  return ref
}
