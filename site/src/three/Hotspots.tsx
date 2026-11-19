import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { CircleGeometry, Color, DoubleSide, RingGeometry, Vector3, type Group, type MeshBasicMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { sceneState, TOUR, type StopId } from './contract'
import { ANCHORS, OCCLUDERS } from './layout'

const GOLD = new Color('#D9A93F').multiplyScalar(1.35)
const MAX_DIST = 40
const _v = new Vector3()

/** Segment (p -> q) vs axis-aligned box, slab test. */
function segmentHitsBox(p: Vector3, q: Vector3, min: readonly number[], max: readonly number[]): boolean {
  let t0 = 0
  let t1 = 0.97 // stop just short of the anchor so the host surface does not occlude itself
  const pa = [p.x, p.y, p.z]
  const da = [q.x - p.x, q.y - p.y, q.z - p.z]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(da[i]) < 1e-9) {
      if (pa[i] < min[i] || pa[i] > max[i]) return false
      continue
    }
    let a = (min[i] - pa[i]) / da[i]
    let b = (max[i] - pa[i]) / da[i]
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 > t1) return false
  }
  return true
}

function activeStop(): StopId | null {
  if (sceneState.focus) return sceneState.focus
  const i = Math.round(sceneState.t)
  return TOUR[Math.max(0, Math.min(TOUR.length - 1, i))] ?? null
}

type HotspotProps = {
  id: Exclude<StopId, 'overview'>
  label: string
  reducedMotion: boolean
  onSelect?: (id: StopId) => void
  phase: number
}

function Hotspot({ id, label, reducedMotion, onSelect, phase }: HotspotProps) {
  const group = useRef<Group>(null)
  const pulse = useRef<Group>(null)
  const viaMat = useRef<MeshBasicMaterial>(null)
  const pulseMat = useRef<MeshBasicMaterial>(null)
  const dom = useRef<HTMLDivElement>(null)
  const vis = useRef(0)
  const [open, setOpen] = useState(false)
  const anchor = ANCHORS[id]

  const viaGeo = useMemo(() => {
    const ring = new RingGeometry(0.62, 1, 32)
    const dot = new CircleGeometry(0.34, 24)
    const g = mergeGeometries([ring, dot], false)!
    ring.dispose()
    dot.dispose()
    return g
  }, [])
  const pulseGeo = useMemo(() => new RingGeometry(0.9, 1, 40), [])

  useFrame(({ camera, clock }, dt) => {
    const g = group.current
    if (!g) return
    _v.set(anchor[0], anchor[1], anchor[2])
    const dist = camera.position.distanceTo(_v)
    let target = 1
    if (dist > MAX_DIST) target = 0
    else if (dist > MAX_DIST * 0.7) target = (MAX_DIST - dist) / (MAX_DIST * 0.3)
    if (activeStop() === id && !sceneState.focus) target *= 0.35
    if (sceneState.focus === id) target = 0
    if (target > 0) for (const [min, max] of OCCLUDERS) if (segmentHitsBox(camera.position, _v, min, max)) { target = 0; break }
    if (open) target = Math.max(target, 0.9)
    vis.current = reducedMotion ? target : vis.current + (target - vis.current) * (1 - Math.exp(-dt / 0.18))
    const a = vis.current

    // Constant screen size: scale with distance, always face the camera.
    g.quaternion.copy(camera.quaternion)
    g.scale.setScalar(Math.max(0.012, dist * 0.009))
    g.visible = a > 0.01
    if (viaMat.current) viaMat.current.opacity = a
    if (pulse.current && pulseMat.current) {
      const p = reducedMotion ? 0 : ((clock.elapsedTime * 0.55 + phase) % 1)
      pulse.current.scale.setScalar(1 + p * 1.6)
      pulseMat.current.opacity = reducedMotion ? 0 : a * 0.7 * (1 - p)
    }
    const el = dom.current
    if (el) {
      el.style.opacity = String(a)
      el.style.visibility = a > 0.05 ? 'visible' : 'hidden'
    }
  })

  return (
    <group ref={group} position={[anchor[0], anchor[1], anchor[2]]}>
      <mesh geometry={viaGeo} renderOrder={10}>
        <meshBasicMaterial ref={viaMat} color={GOLD} transparent depthTest={false} depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <group ref={pulse}>
        <mesh geometry={pulseGeo} renderOrder={10}>
          <meshBasicMaterial ref={pulseMat} color={GOLD} transparent depthTest={false} depthWrite={false} toneMapped={false} side={DoubleSide} />
        </mesh>
      </group>
      <Html center zIndexRange={[10, 0]} pointerEvents="auto">
        <div ref={dom} style={{ position: 'relative', width: 30, height: 30, pointerEvents: 'auto' }}>
          <button
            type="button"
            className="nt-hotspot"
            aria-label={label}
            data-station={id}
            data-open={open ? 'true' : 'false'}
            onClick={() => onSelect?.(id)}
            onPointerEnter={() => setOpen(true)}
            onPointerLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            style={{ position: 'absolute', inset: 0, border: 0, padding: 0, margin: 0, borderRadius: 999, background: 'transparent', cursor: 'pointer' }}
          >
            <span
              className="nt-hotspot__label"
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 'calc(100% + 4px)',
                top: '50%',
                transform: `translateY(-50%) translateX(${open ? 0 : -4}px)`,
                opacity: open ? 1 : 0,
                transition: reducedMotion ? 'none' : 'opacity .18s ease, transform .18s ease',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                padding: '5px 11px',
                borderRadius: 999,
                font: '500 12px/1.2 system-ui, sans-serif',
                color: '#fff',
                background: 'rgba(18,19,20,.78)',
                border: '1px solid rgba(217,169,63,.55)',
              }}
            >
              {label}
            </span>
          </button>
        </div>
      </Html>
    </group>
  )
}

const DEFAULT_LABELS: Record<Exclude<StopId, 'overview'>, string> = {
  pcbWall: 'Boards & ECUs',
  bench: 'Board-level repair',
  laptop: 'Laptops & PCs',
  coffee: 'Espresso & appliances',
  counter: 'Reception',
  door: 'Mobile car electrics',
}

export function Hotspots({
  labels,
  reducedMotion,
  onSelect,
}: {
  labels?: Partial<Record<StopId, string>>
  reducedMotion: boolean
  onSelect?: (id: StopId) => void
}) {
  const ids = Object.keys(ANCHORS) as Exclude<StopId, 'overview'>[]
  return (
    <group>
      {ids.map((id, i) => (
        <Hotspot key={id} id={id} label={labels?.[id] ?? DEFAULT_LABELS[id]} reducedMotion={reducedMotion} onSelect={onSelect} phase={i * 0.17} />
      ))}
    </group>
  )
}
