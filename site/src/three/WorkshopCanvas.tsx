import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useMemo, useRef } from 'react'
import { NeutralToneMapping } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { CameraRig } from './cameraRig'
import { sceneState, STATION_MODEL, type StopId, type WorkshopCanvasProps } from './contract'
import { STREET } from './layout'
import { DemandDriver, useDocumentVisible } from './runtime'
import { Scene } from './Scene'

/** Low-end path: no shadow maps, fewer props, lower DPR cap. */
function detectLite(): boolean {
  if (typeof window === 'undefined') return false
  const cores = navigator.hardwareConcurrency ?? 8
  const small = Math.min(window.innerWidth, window.innerHeight) < 560 || window.innerWidth < 700
  return cores <= 4 || small
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

export default function WorkshopCanvas({
  theme,
  reducedMotion,
  className,
  showHotspots = false,
  labels,
  onSelect,
  paused = false,
  partLabels,
  interactive = false,
}: WorkshopCanvasProps) {
  const lite = useMemo(detectLite, [])
  const visible = useDocumentVisible()
  const controls = useRef<OrbitControlsImpl | null>(null)

  const select = useCallback(
    (id: StopId) => {
      if (interactive) {
        const m = STATION_MODEL[id]
        sceneState.tour = false
        sceneState.focus = id
        sceneState.model = m
        sceneState.explode = m ? 1 : 0
        sceneState.highlight = null
      }
      onSelect?.(id)
    },
    [interactive, onSelect],
  )

  const keepInside = useCallback(() => {
    const c = controls.current
    if (!c) return
    const t = c.target
    t.set(clamp(t.x, STREET.baseX0, STREET.baseX1), clamp(t.y, 0.1, 2.4), clamp(t.z, STREET.baseZ0, STREET.roadEnd))
    const cam = c.object
    if (cam.position.y < 0.12) cam.position.y = 0.12
  }, [])

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
      style={{ background: 'transparent', touchAction: interactive ? 'none' : undefined }}
      aria-hidden={showHotspots || interactive ? undefined : true}
    >
      <CameraRig reducedMotion={reducedMotion} interactive={interactive} controls={controls} />
      {interactive && (
        <OrbitControls
          ref={controls}
          enableDamping
          dampingFactor={0.09}
          minDistance={0.25}
          maxDistance={32}
          minPolarAngle={0.12}
          maxPolarAngle={Math.PI * 0.47}
          screenSpacePanning
          panSpeed={0.7}
          rotateSpeed={0.6}
          zoomSpeed={0.8}
          onChange={keepInside}
          onStart={() => {
            sceneState.tour = false
          }}
        />
      )}
      {reducedMotion && visible && <DemandDriver />}
      <Suspense fallback={null}>
        <Scene
          theme={theme}
          reducedMotion={reducedMotion}
          lite={lite}
          showHotspots={showHotspots || interactive}
          labels={labels}
          onSelect={select}
          partLabels={partLabels}
        />
      </Suspense>
    </Canvas>
  )
}
