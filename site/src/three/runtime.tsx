import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { sceneState } from './contract'

/** Signals "first frames rendered" to the page (and the preview's screenshot script). */
export function ReadySignal() {
  const n = useRef(0)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    // Keep frames coming until the scene has settled (matters in on-demand mode).
    let raf = 0
    const tick = () => {
      if (n.current < 8) {
        invalidate()
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [invalidate])
  useFrame(() => {
    n.current++
    if (n.current === 6) {
      document.documentElement.dataset.ntScene = 'ready'
      window.dispatchEvent(new Event('nt-scene-ready'))
    }
  })
  return null
}

/**
 * With reduced motion a canvas renders on demand: this watches sceneState
 * (written by the page without React) and requests frames when it changes.
 */
export function DemandDriver() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let raf = 0
    let last = ''
    let warm = 12
    const tick = () => {
      const s = sceneState
      const sig = `${s.explode}|${s.model}|${s.highlight}`
      if (sig !== last) {
        last = sig
        warm = Math.max(warm, 4)
      }
      if (warm > 0) {
        warm--
        invalidate()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [invalidate])
  return null
}

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}
