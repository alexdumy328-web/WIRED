import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Object3D, type Material } from 'three'
import { BUCKETS, GeoBuilder, type Bucket } from './builder'
import { buildBenches, Pegboard } from './Bench'
import { buildCoffee } from './Coffee'
import { sceneState, type StopId, type Theme } from './contract'
import { buildCounter } from './Counter'
import { Hotspots } from './Hotspots'
import { ReadySignal } from './runtime'
import { STREET } from './layout'
import { themeK, useBucketMaterials } from './materials'
import { buildPcbFrame, PcbWall } from './PcbWall'
import { buildRoom, CeilingLights, Floors, RightWall, shadowFlags } from './Room'
import { ShopDevices } from './ShopDevices'
import { buildStreet, StreetSurfaces } from './Street'

export type SceneProps = {
  theme: Theme
  reducedMotion: boolean
  lite: boolean
  showHotspots: boolean
  labels?: Partial<Record<StopId, string>>
  onSelect?: (id: StopId) => void
  partLabels?: Record<string, string>
}

/** All static geometry, merged into one mesh per material bucket. */
function StaticMeshes({ mats, lite }: { mats: Record<Bucket, Material>; lite: boolean }) {
  const geos = useMemo(() => {
    const b = new GeoBuilder(lite)
    buildRoom(b)
    buildPcbFrame(b)
    buildBenches(b)
    buildCounter(b)
    buildCoffee(b)
    buildStreet(b)
    return b.build()
  }, [lite])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  return (
    <group>
      {BUCKETS.filter((k) => geos.has(k)).map((k) => (
        <mesh
          key={k}
          geometry={geos.get(k)}
          material={mats[k]}
          castShadow={k === 'matte' || k === 'satin' || k === 'gloss' || k === 'metal'}
          receiveShadow={k !== 'glow'}
          renderOrder={k === 'glass' ? 2 : 0}
        />
      ))}
    </group>
  )
}

function Lights({ theme, lite }: { theme: Theme; lite: boolean }) {
  const dark = theme === 'dark'
  const target = useMemo(() => {
    const o = new Object3D()
    o.position.set(2.4, 0, -1.2)
    return o
  }, [])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#3c4046', dark ? 0.55 : 1.25]} />
      <primitive object={target} />
      <directionalLight
        position={[9.5, 15, 8]}
        target={target}
        intensity={dark ? 1.15 : 2.1}
        castShadow={!lite}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={2}
        shadow-camera-far={45}
      />
      {/* Cool white "ceiling panels" filling the shop. */}
      <pointLight position={[1.5, 2.45, -1.6]} color="#f3f7ff" intensity={dark ? 3.2 : 2.2} distance={7} decay={1.6} />
      <pointLight position={[3.5, 2.45, -3.7]} color="#f3f7ff" intensity={dark ? 3.2 : 2.2} distance={7} decay={1.6} />
      <pointLight position={[1.5, 2.45, -5.4]} color="#f3f7ff" intensity={dark ? 2.2 : 1.4} distance={6} decay={1.6} />
      {/* Van headlights spill. */}
      <pointLight position={[5.3, 0.6, 4.55]} color="#ffeccc" intensity={dark ? 1.6 : 0.6} distance={3} decay={2} />
    </>
  )
}

/** Shadows are static: render the shadow map on the first frames and when the laptop moves. */
function ShadowBaker({ theme }: { theme: Theme }) {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  const lastExplode = useRef(-1)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    frames.current = 0
  }, [gl, theme])
  useFrame(() => {
    const e = sceneState.explode
    if (frames.current < 4 || shadowFlags.dirty || Math.abs(e - lastExplode.current) > 0.002) gl.shadowMap.needsUpdate = true
    shadowFlags.dirty = false
    lastExplode.current = e
    frames.current++
  })
  return null
}

export function Scene({ theme, reducedMotion, lite, showHotspots, labels, onSelect, partLabels }: SceneProps) {
  const k = themeK(theme)
  const mats = useBucketMaterials(theme)
  const cx = (STREET.baseX0 + STREET.baseX1) / 2
  const cz = (STREET.baseZ0 + STREET.roadEnd) / 2
  return (
    <>
      <Lights theme={theme} lite={lite} />
      <Environment resolution={64} frames={1} environmentIntensity={k.env}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[14, 3, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[6, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[14, 3, 1]} />
        <Lightformer form="ring" color="#ffd9a0" intensity={1.6} position={[2, 2, 8]} scale={3} />
      </Environment>
      <StaticMeshes mats={mats} lite={lite} />
      <RightWall mats={mats} reducedMotion={reducedMotion} />
      <Floors />
      <CeilingLights theme={theme} />
      <Pegboard />
      <PcbWall theme={theme} reducedMotion={reducedMotion} />
      <StreetSurfaces theme={theme} />
      <ShopDevices mats={mats} reducedMotion={reducedMotion} partLabels={partLabels} />
      {showHotspots && <Hotspots labels={labels} reducedMotion={reducedMotion} onSelect={onSelect} />}
      <ContactShadows
        position={[cx, -0.37, cz]}
        scale={[STREET.baseX1 - STREET.baseX0 + 4, STREET.roadEnd - STREET.baseZ0 + 4]}
        resolution={lite ? 256 : 512}
        blur={2.6}
        far={1.2}
        opacity={theme === 'dark' ? 0.75 : 0.42}
        frames={1}
        color="#000000"
      />
      {!lite && <ShadowBaker theme={theme} />}
      <ReadySignal />
    </>
  )
}
