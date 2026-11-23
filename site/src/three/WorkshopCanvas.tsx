// @refresh reset
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { NeutralToneMapping } from 'three'
import { CameraRig } from './cameraRig'
import type { WorkshopCanvasProps } from './contract'
import { DemandDriver, useDocumentVisible } from './runtime'
import { Scene } from './Scene'

/** Low-end path: no shadow maps, fewer props, lower DPR cap. */
function detectLite(): boolean {
  if (typeof window === 'undefined') return false
  const cores = navigator.hardwareConcurrency ?? 8
  const small = Math.min(window.innerWidth, window.innerHeight) < 560 || window.innerWidth < 700
  return cores <= 4 || small
}

export default function WorkshopCanvas({
  theme,
  reducedMotion,
  className,
  showHotspots = false,
  labels,
  onSelect,
  paused = false,
  partLabels,
}: WorkshopCanvasProps) {
  const lite = useMemo(detectLite, [])
  const visible = useDocumentVisible()

  return (
    <Canvas
      className={className}
      dpr={lite ? [1, 1.5] : [1, 1.75]}
      shadows={lite ? false : 'percentage'}
      frameloop={!visible || paused ? 'never' : reducedMotion ? 'demand' : 'always'}
      gl={{ alpha: true, antialias: true, stencil: false, powerPreference: 'high-performance', toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}
      camera={{ fov: 35, near: 0.03, far: 140, position: [14, 14, 14] }}
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
        <Scene
          theme={theme}
          reducedMotion={reducedMotion}
          lite={lite}
          showHotspots={showHotspots}
          labels={labels}
          onSelect={onSelect}
          partLabels={partLabels}
        />
      </Suspense>
    </Canvas>
  )
}
