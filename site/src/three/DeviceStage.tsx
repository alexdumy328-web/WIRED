// @refresh reset
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { Color, MeshStandardMaterial, NeutralToneMapping, Vector3, type Group, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { sceneState, type DeviceStageProps, type ModelId, type Theme } from './contract'
import { DeviceModel, type DeviceRuntime } from './DeviceModel'
import { getModel, modelPoints } from './devices'
import { fitView } from './devices/fit'
import { lathe } from './devices/kit'
import { GeoBuilder } from './builder'
import { useBucketMaterials } from './materials'
import { DemandDriver, ReadySignal, useDocumentVisible } from './runtime'

const FALLBACK: ModelId = 'laptop'
const PLINTH_H = 0.05 // in plinth units (radius 1)

/** Where a model sits on the plinth: assembled footprint centred, bottom on the top face. */
function stageFrame(id: ModelId) {
  const a = getModel(id)
  const cx = (a.boxA.min.x + a.boxA.max.x) / 2
  const cz = (a.boxA.min.z + a.boxA.max.z) / 2
  const y0 = -a.boxA.min.y
  // Exploded parts may drop below the base (screws, motors): lift the device so nothing sinks into the plinth.
  const lift = Math.max(0, a.boxA.min.y - a.boxE.min.y)
  let r = 0
  for (const b of [a.boxA, a.boxE])
    for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) r = Math.max(r, Math.hypot(x - cx, z - cz) * (b === a.boxA ? 1 : 0.6))
  return { a, cx, cz, y0, lift, radius: Math.max(0.12, r * 1.08) }
}

function usePlinthGeo() {
  return useMemo(() => {
    const b = new GeoBuilder()
    const h = PLINTH_H
    lathe(b, 'satin', '#ffffff', [[0, -h], [0.97, -h], [1.0, -h * 0.8], [1.0, -h * 0.25], [0.985, -h * 0.05], [0.96, 0], [0, 0]], [0, 0, 0], 0, 72)
    return b.build().get('satin')!
  }, [])
}

function Plinth({ theme, radius }: { theme: Theme; radius: { current: number } }) {
  const geo = usePlinthGeo()
  const ref = useRef<Group>(null)
  const dark = theme === 'dark'
  const mats = useMemo(
    () => ({
      body: new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }),
      top: new MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 }),
      ring: new MeshStandardMaterial({ color: '#D9A93F', roughness: 0.3, metalness: 0.85, emissive: new Color('#D9A93F'), emissiveIntensity: 0.18 }),
    }),
    [],
  )
  mats.body.color.set(dark ? '#25272b' : '#d9dce0')
  mats.top.color.set(dark ? '#2e3136' : '#e9ebee')
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const s = g.scale.x + (radius.current - g.scale.x) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.25))
    g.scale.setScalar(s)
  })
  return (
    <group ref={ref} scale={radius.current}>
      <mesh geometry={geo} material={mats.body} receiveShadow />
      <mesh position-y={0.0015} rotation-x={-Math.PI / 2} material={mats.top}>
        <circleGeometry args={[0.93, 72]} />
      </mesh>
      <mesh position-y={-PLINTH_H * 0.5} rotation-x={Math.PI / 2} material={mats.ring}>
        <torusGeometry args={[1.0, 0.006, 6, 96]} />
      </mesh>
    </group>
  )
}

const RIM = 16
const _pts = Array.from({ length: RIM }, () => new Vector3())
const _corners: Vector3[] = []
const _fit: Vector3[] = []
const _out = { pos: new Vector3(), target: new Vector3() }
const _dir = new Vector3()

function StageContent({ theme, reducedMotion, partLabels, controls }: { theme: Theme; reducedMotion: boolean; partLabels?: Record<string, string>; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const mats = useBucketMaterials(theme)
  const [shown, setShown] = useState<ModelId>(() => sceneState.model ?? FALLBACK)
  const leaving = useRef(false)
  const runtime = useRef<DeviceRuntime>({ id: null, g: 0, presence: 0 })
  const lifter = useRef<Group>(null)
  const frame = useMemo(() => stageFrame(shown), [shown])
  const radius = useRef(frame.radius)
  const st = useRef({ e: 0, dist: 0, target: new Vector3(), init: false })
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)

  const onLeft = useCallback(() => {
    leaving.current = false
    setShown(sceneState.model ?? FALLBACK)
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const want = sceneState.model ?? FALLBACK
    leaving.current = want !== shown
    radius.current = frame.radius
    const rt = runtime.current
    const g = rt.id === shown ? rt.g : 0
    const l = lifter.current
    if (l) l.position.set(-frame.cx, frame.y0 + frame.lift * g, -frame.cz)

    // Camera: fit the device (as a turntable cylinder, so the fit holds while it spins) + plinth.
    const s = st.current
    const goalE = leaving.current ? 0 : Math.min(1, Math.max(0, Number(sceneState.explode) || 0))
    s.e = reducedMotion ? goalE : s.e + (goalE - s.e) * (1 - Math.exp(-dt / 0.45))
    // Fit the parts as they are (offset onto the plinth) plus the plinth rim, from the current view direction.
    const corners = modelPoints(frame.a, s.e, _corners)
    const oy = frame.y0 + frame.lift * s.e
    _fit.length = 0
    for (const c of corners) _fit.push(c.set(c.x - frame.cx, c.y + oy, c.z - frame.cz))
    const pr = radius.current
    for (let i = 0; i < RIM; i++) {
      const a = (i / RIM) * Math.PI * 2
      _fit.push(_pts[i].set(Math.cos(a) * pr, -PLINTH_H * pr, Math.sin(a) * pr))
    }
    const ctl = controls.current
    _dir.copy(camera.position).sub(ctl ? ctl.target : _out.target)
    if (_dir.lengthSq() < 1e-8) _dir.set(0.4, 0.35, 1)
    _dir.normalize()
    const az = Math.atan2(_dir.x, _dir.z)
    const el = Math.asin(Math.max(-1, Math.min(1, _dir.y)))
    const aspect = size.width / Math.max(1, size.height)
    fitView(_fit, az, el, camera.fov, aspect, _out, 1.1, 1.18)
    const dist = _out.pos.distanceTo(_out.target)
    if (!s.init || reducedMotion) {
      s.dist = dist
      s.target.copy(_out.target)
      s.init = true
    } else {
      const k = 1 - Math.exp(-dt / 0.6)
      s.dist += (dist - s.dist) * k
      s.target.lerp(_out.target, k)
    }
    if (ctl) {
      ctl.target.copy(s.target)
      ctl.minDistance = ctl.maxDistance = s.dist
    }
    camera.near = Math.max(0.005, s.dist * 0.02)
    camera.far = s.dist * 20
    camera.updateProjectionMatrix()
  })

  const dark = theme === 'dark'
  return (
    <>
      <Environment resolution={128} frames={1} environmentIntensity={dark ? 0.9 : 1.05}>
        <Lightformer form="rect" intensity={2.6} position={[0, 5, 1]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[-4, 1.8, 2.5]} rotation-y={Math.PI / 3} scale={[3, 2.4, 1]} />
        <Lightformer form="rect" intensity={1.0} position={[4, 1.2, 2]} rotation-y={-Math.PI / 3} scale={[3, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[0, 1.6, -4]} scale={[5, 1.4, 1]} />
        <Lightformer form="ring" color="#ffe7bf" intensity={0.5} position={[2.5, 3, -2.5]} scale={0.8} />
        <Lightformer form="rect" intensity={0.5} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[6, 6, 1]} />
      </Environment>
      <Plinth theme={theme} radius={radius} />
      <ContactShadows
        key={`${shown}-${reducedMotion ? sceneState.explode : 'live'}`}
        position={[0, 0.003, 0]}
        scale={frame.radius * 2.1}
        resolution={512}
        blur={2.4}
        far={Math.max(0.2, frame.a.boxE.max.y - frame.a.boxA.min.y + frame.lift)}
        opacity={dark ? 0.7 : 0.45}
        frames={reducedMotion ? 1 : Infinity}
        color="#000000"
      />
      <group ref={lifter}>
        <DeviceModel
          key={shown}
          id={shown}
          mats={mats}
          reducedMotion={reducedMotion}
          leaving={leaving}
          onLeft={onLeft}
          partLabels={partLabels}
          runtime={runtime.current}
          castShadow={false}
        />
      </group>
    </>
  )
}

/**
 * Standalone viewer for one exploded device on a turntable plinth (no shop).
 * Reads sceneState.model / explode / highlight; transparent background.
 */
export default function DeviceStage({ theme, reducedMotion, className, paused = false, partLabels }: DeviceStageProps) {
  const visible = useDocumentVisible()
  const controls = useRef<OrbitControlsImpl | null>(null)
  return (
    <Canvas
      className={className}
      dpr={[1, 1.75]}
      frameloop={!visible || paused ? 'never' : reducedMotion ? 'demand' : 'always'}
      gl={{ alpha: true, antialias: true, stencil: false, toneMapping: NeutralToneMapping, toneMappingExposure: 1 }}
      camera={{ fov: 28, near: 0.01, far: 40, position: [0.55, 0.42, 1.0] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        if (import.meta.env.DEV) (window as unknown as { __ntGl?: unknown }).__ntGl = gl
      }}
      style={{ background: 'transparent', touchAction: 'pan-y' }}
    >
      <OrbitControls
        ref={controls}
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.55}
        minPolarAngle={0.55}
        maxPolarAngle={1.42}
      />
      {reducedMotion && visible && <DemandDriver />}
      <Suspense fallback={null}>
        <StageContent theme={theme} reducedMotion={reducedMotion} partLabels={partLabels} controls={controls} />
      </Suspense>
      <ReadySignal />
    </Canvas>
  )
}
