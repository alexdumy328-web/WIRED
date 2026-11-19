import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { NeutralToneMapping } from 'three'
import { CameraRig } from './cameraRig'
import { sceneState, type WorkshopCanvasProps } from './contract'
import { Scene } from './Scene'

/** Low-end path: no shadow maps, fewer props, lower DPR cap. */
function detectLite(): boolean {
  if (typeof window === 'undefined') return false
  const cores = navigator.hardwareConcurrency ?? 8
  const small = Math.min(window.innerWidth, window.innerHeight) < 560 || window.innerWidth < 700
  return cores <= 4 || small
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/**
 * With reduced motion the canvas renders on demand: this watches sceneState
 * (written by the page without React) and requests a frame only when it changes.
 */
function DemandDriver() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    let raf = 0
    let last = ''
    let warm = 12
    const tick = () => {
      const sig = `${sceneState.t.toFixed(4)}|${sceneState.focus}|${sceneState.frame}|${sceneState.explode}`
      if (sig !== last || warm > 0) {
        last = sig
        warm = Math.max(0, warm - 1)
        invalidate()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [invalidate])
  return null
}

export default function WorkshopCanvas({ theme, reducedMotion, className, showHotspots = false, labels, onSelect }: WorkshopCanvasProps) {
  const lite = useMemo(detectLite, [])
  const visible = useDocumentVisible()
  return (
    <Canvas
      className={className}
      dpr={lite ? [1, 1.5] : [1, 1.75]}
      shadows={lite ? false : 'percentage'}
      frameloop={!visible ? 'never' : reducedMotion ? 'demand' : 'always'}
      gl={{ alpha: true, antialias: true, stencil: false, powerPreference: 'high-performance', toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}
      camera={{ fov: 35, near: 0.05, far: 140, position: [14, 14, 14] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        // Dev-only handle for the preview's draw-call readout.
        if (import.meta.env.DEV) (window as unknown as { __ntGl?: unknown }).__ntGl = gl
      }}
      style={{ background: 'transparent' }}
      aria-hidden={showHotspots ? undefined : true}
    >
      <CameraRig reducedMotion={reducedMotion} />
      {reducedMotion && visible && <DemandDriver />}
      <Suspense fallback={null}>
        <Scene theme={theme} reducedMotion={reducedMotion} lite={lite} showHotspots={showHotspots} labels={labels} onSelect={onSelect} />
      </Suspense>
    </Canvas>
  )
}
