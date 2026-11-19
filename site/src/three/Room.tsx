import { useMemo } from 'react'
import { AdditiveBlending, BufferGeometry, ExtrudeGeometry, PlaneGeometry, Shape } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { BufferGeometry as BG, Group, Material } from 'three'
import { faces, GeoBuilder, type Bucket } from './builder'
import { C, makeMainFloor, makeSlateFloor, makeSoftSquare } from './materials'
import type { Theme } from './contract'
import { ROOM, STREET } from './layout'

const { W, H, back, wall, part, vest, archX0, archX1, archJamb, archTop, cut } = ROOM

/** Square 60x60 LED panels in the suspended ceiling grid (x, z). */
export const LED_PANELS: readonly (readonly [number, number])[] = [
  [1.45, -1.55],
  [3.55, -1.55],
  [1.45, -3.7],
  [3.55, -3.7],
  [1.45, -5.6],
]

/** Shell: walls, partition with the chamfered arch, storefront, back door, ceiling LED panels, plinth. */
export function buildRoom(b: GeoBuilder): void {
  // Plinth the whole diorama floats on.
  b.slab('satin', faces({ py: C.baseTop, rest: C.base }), [STREET.baseX0, -0.36, STREET.baseZ0], [STREET.baseX1, -0.002, 3.4 + STREET.curb], 0.03)
  b.slab('satin', faces({ py: C.baseTop, rest: C.base }), [STREET.baseX0, -0.36, 3.4], [STREET.baseX1, STREET.roadY - 0.002, STREET.roadEnd], 0.03)

  // Left wall: white in the shop, matte black in the vestibule.
  b.slab('matte', faces({ px: C.wallWhite, py: C.poche, rest: C.exterior }), [-wall, 0, back - wall], [0, H, 0])
  b.slab('matte', faces({ px: C.blackWall, py: C.poche, rest: C.exterior }), [-wall, 0, 0], [0, H, vest + 0.06])
  // Back wall.
  b.slab('matte', faces({ pz: C.wallWhite, py: C.poche, rest: C.exterior }), [0, 0, back - wall], [W + wall, H, back])
  // Right wall: see <RightWall/> (it rises when the camera is inside the shop).

  // Skirting in the shop (dark grey), black in the vestibule.
  b.slab('satin', C.skirting, [0, 0, back + 0.01], [0.012, 0.07, -part])
  b.slab('satin', C.skirting, [0, 0, back], [W, 0.07, back + 0.012])

  // Partition with the octagonal arch: black street side + reveal, white shop side.
  const c = archTop - archJamb
  const s = new Shape()
  s.moveTo(0, 0)
  s.lineTo(archX0, 0)
  s.lineTo(archX0, archJamb)
  s.lineTo(archX0 + c, archTop)
  s.lineTo(archX1 - c, archTop)
  s.lineTo(archX1, archJamb)
  s.lineTo(archX1, 0)
  s.lineTo(W, 0)
  s.lineTo(W, H)
  s.lineTo(0, H)
  s.closePath()
  const pg = new ExtrudeGeometry(s, { depth: part, bevelEnabled: false, curveSegments: 1 })
  b.add(
    'matte',
    pg,
    (n, p) => {
      if (n.z > 0.7) return C.blackWall // street side
      if (n.z < -0.7) return C.wallWhite // shop side
      if (n.y > 0.7 && p.y > H - 0.01) return C.poche
      return C.blackWall // arch reveal
    },
    [0, 0, -part],
  )
  // Aluminium threshold strip under the arch.
  b.slab('metal', C.alu, [archX0, 0, -0.03], [archX1, 0.008, 0.02])

  buildStorefront(b)
  buildBackDoor(b)

  // Radiator on the right wall, in front of the counter.
  b.group([W - 0.06, 0, -1.95], 0, () => {
    b.box('satin', C.white, [0.07, 0.58, 1.3], [0, 0.46, 0], 0, 0.01)
    if (!b.lite) for (let i = -12; i <= 12; i++) b.box('satin', '#dfe2e3', [0.075, 0.5, 0.008], [0.002, 0.46, i * 0.05])
    b.cyl('metal', C.steel, 0.012, 0.012, 0.08, [0, 0.14, 0.68])
    b.box('satin', C.white, [0.03, 0.02, 0.04], [0.02, 0.15, -0.6])
  })
}

function buildStorefront(b: GeoBuilder): void {
  const z = vest + 0.03
  const fw = 0.065 // PVC profile width
  const fd = 0.07
  const pvc = C.pvc
  // Vertical posts.
  for (const x of [0.03, 1.0, 2.0, 2.6, 3.2, 4.1, W - 0.03]) b.box('satin', pvc, [fw, H, fd], [x, H / 2, z])
  // Rails across fixed panels.
  for (const [x0, x1] of [
    [0, 2.0],
    [3.2, W],
  ] as const) {
    for (const y of [0.03, 0.86, 2.15]) b.box('satin', pvc, [x1 - x0, fw, fd], [(x0 + x1) / 2, y, z])
  }
  b.box('satin', pvc, [W, 0.1, fd], [W / 2, H - 0.05, z])
  // Door leaves: transom + mid rail + kick plate.
  b.box('satin', pvc, [1.2, fw, fd], [2.6, 2.15, z])
  for (const x of [2.3, 2.9]) {
    b.box('satin', pvc, [0.6, 0.12, fd], [x, 0.06, z])
    b.box('satin', pvc, [0.6, 0.06, fd], [x, 1.02, z])
  }
  // Handles.
  for (const s of [-1, 1]) {
    b.box('metal', C.steel, [0.025, 0.3, 0.025], [2.6 + s * 0.08, 1.05, z + 0.06])
    b.box('metal', C.steel, [0.025, 0.3, 0.025], [2.6 + s * 0.08, 1.05, z - 0.06])
  }
  // Opaque lower panels.
  for (const [x0, x1] of [
    [0.06, 1.0],
    [1.0, 2.0],
    [3.2, 4.1],
    [4.1, W - 0.06],
  ] as const)
    b.box('satin', '#eef0f0', [x1 - x0 - fw, 0.8, 0.03], [(x0 + x1) / 2, 0.45, z])
  // Glass: fixed panes, door panes, top-hung windows.
  const glass = '#d6e4ec'
  for (const [x0, x1] of [
    [0.06, 1.0],
    [1.0, 2.0],
    [3.2, 4.1],
    [4.1, W - 0.06],
  ] as const) {
    b.box('glass', glass, [x1 - x0 - fw, 1.24, 0.012], [(x0 + x1) / 2, 1.505, z])
    b.box('glass', glass, [x1 - x0 - fw, 0.42, 0.012], [(x0 + x1) / 2, 2.41, z])
  }
  for (const x of [2.3, 2.9]) {
    b.box('glass', glass, [0.5, 0.86, 0.012], [x, 0.56, z])
    b.box('glass', glass, [0.5, 1.07, 0.012], [x, 1.6, z])
  }
  b.box('glass', glass, [1.1, 0.42, 0.012], [2.6, 2.41, z])
  // Doormat.
  b.box('matte', '#2a2b2d', [1.1, 0.012, 0.55], [2.6, 0.006, vest - 0.35], 0, 0.004)
}

function buildBackDoor(b: GeoBuilder): void {
  const z = back + 0.035
  const x0 = 2.25
  const x1 = 3.15
  const top = 2.12
  const pvc = C.pvc
  b.box('satin', pvc, [0.07, top, 0.06], [x0, top / 2, z])
  b.box('satin', pvc, [0.07, top, 0.06], [x1, top / 2, z])
  b.box('satin', pvc, [x1 - x0 + 0.07, 0.07, 0.06], [(x0 + x1) / 2, top, z])
  b.box('satin', pvc, [x1 - x0, 0.14, 0.05], [(x0 + x1) / 2, 0.07, z])
  b.box('satin', pvc, [x1 - x0, 0.08, 0.05], [(x0 + x1) / 2, 1.0, z])
  b.box('frosted', '#eef3f5', [x1 - x0 - 0.06, 0.82, 0.02], [(x0 + x1) / 2, 0.55, z])
  b.box('frosted', '#eef3f5', [x1 - x0 - 0.06, 1.0, 0.02], [(x0 + x1) / 2, 1.55, z])
  b.box('metal', C.steel, [0.13, 0.025, 0.03], [x1 - 0.12, 1.05, z + 0.04])
  // Light switch beside the door.
  b.box('satin', C.white, [0.08, 0.08, 0.015], [x1 + 0.35, 1.2, back + 0.008])
}

/** Textured floors (separate meshes: they need their own maps). */
export function Floors() {
  const main = useMemo(() => {
    const t = makeMainFloor()
    t.repeat.set(W / 2.4, (back * -1 - part) / 2.4)
    return t
  }, [])
  const slate = useMemo(() => {
    const t = makeSlateFloor()
    t.repeat.set(W / 1.2, vest / 1.2)
    return t
  }, [])
  const depth = -back - part
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0.001, back + depth / 2]} receiveShadow>
        <planeGeometry args={[W, depth]} />
        <meshStandardMaterial map={main} roughness={0.62} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0.001, vest / 2 - 0.12]} receiveShadow>
        <planeGeometry args={[W, vest + 0.24]} />
        <meshStandardMaterial map={slate} roughness={0.7} metalness={0} />
      </mesh>
    </group>
  )
}

/** Ceiling LED panels: floating emissive squares with a soft additive bloom, one draw call. */
export function CeilingLights({ theme }: { theme: Theme }) {
  const core = useMemo(() => {
    const parts: BufferGeometry[] = LED_PANELS.map(([x, z]) => new PlaneGeometry(0.58, 0.58).rotateX(Math.PI / 2).translate(x, H - 0.012, z))
    return mergeGeometries(parts, false)!
  }, [])
  const bloom = useMemo(() => {
    const parts: BufferGeometry[] = LED_PANELS.map(([x, z]) => new PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2).translate(x, H - 0.03, z))
    return mergeGeometries(parts, false)!
  }, [])
  const tex = useMemo(() => makeSoftSquare(), [])
  const dark = theme === 'dark'
  return (
    <group>
      <mesh geometry={core}>
        <meshBasicMaterial color="#f4f8ff" toneMapped={false} />
      </mesh>
      <mesh geometry={bloom} renderOrder={3}>
        <meshBasicMaterial map={tex} color="#dfeaff" transparent opacity={dark ? 0.55 : 0.0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Shared flag: static shadow map needs re-rendering (wall moved, laptop exploded...). */
export const shadowFlags = { dirty: true }

/**
 * The camera-facing right wall. Cut down to a low stub while the camera is
 * outside (dollhouse view); rises to full height when the camera is inside the
 * shop or vestibule so interior shots never look into the void.
 */
export function RightWall({ mats, reducedMotion }: { mats: Record<Bucket, Material>; reducedMotion: boolean }) {
  const parts = useMemo(() => {
    const b = new GeoBuilder()
    b.slab('matte', faces({ nx: C.wallWhite, py: C.poche, rest: C.exterior }), [W, 0, back - wall], [W + wall, H, -part])
    b.slab('matte', faces({ nx: C.blackWall, py: C.poche, rest: C.exterior }), [W, 0, -part], [W + wall, H, vest + 0.06])
    const wallGeo = b.build()
    // Split AC unit high on the wall near the arch (as in the photos).
    const a = new GeoBuilder()
    a.box('satin', '#f1f2f0', [0.21, 0.29, 0.86], [W - 0.105, 2.28, -0.95], 0, 0.04)
    a.box('satin', '#d9dbd9', [0.01, 0.05, 0.78], [W - 0.215, 2.18, -0.95])
    a.box('glow', '#7fe39a', [0.004, 0.012, 0.02], [W - 0.212, 2.3, -0.62])
    return { wallGeo, acGeo: a.build() }
  }, [])
  const wallRef = useRef<Group>(null)
  const acRef = useRef<Group>(null)
  const h = useRef(cut / H)
  useFrame(({ camera }, dt) => {
    const p = camera.position
    const inside = p.x > 0 && p.x < W - 0.05 && p.z > back && p.z < vest && p.y < H + 0.4
    const goal = inside ? 1 : cut / H
    const prev = h.current
    h.current = reducedMotion ? goal : prev + (goal - prev) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.16))
    if (Math.abs(goal - h.current) < 0.002) h.current = goal
    if (wallRef.current) wallRef.current.scale.y = h.current
    if (acRef.current) acRef.current.visible = h.current > 0.96
    if (h.current !== prev) shadowFlags.dirty = true
  })
  const mesh = (geos: Map<Bucket, BG>) =>
    [...geos].map(([k, g]) => <mesh key={k} geometry={g} material={mats[k]} castShadow={k !== 'glow'} receiveShadow={k !== 'glow'} />)
  return (
    <>
      <group ref={wallRef} scale-y={cut / H}>
        {mesh(parts.wallGeo)}
      </group>
      <group ref={acRef} visible={false}>
        {mesh(parts.acGeo)}
      </group>
    </>
  )
}
