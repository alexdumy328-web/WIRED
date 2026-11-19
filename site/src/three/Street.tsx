import { useMemo } from 'react'
import { AdditiveBlending, Color, ExtrudeGeometry, Shape } from 'three'
import type { GeoBuilder } from './builder'
import type { Theme } from './contract'
import { ROOM, STREET } from './layout'
import { C, makeAsphalt, makePavement, makeRadialGlow, themeK } from './materials'

/** Van parked along the kerb, nose toward +x (the camera side at the door stop). */
export const VAN = { x: 2.35, z: 4.55, yaw: 0 } as const

export function buildStreet(b: GeoBuilder): void {
  const x0 = STREET.baseX0
  const x1 = STREET.baseX1
  // Kerb stones.
  b.slab('satin', '#b9bdc0', [x0 + 0.02, STREET.roadY, STREET.paveEnd], [x1 - 0.02, 0.0, STREET.paveEnd + STREET.curb], 0.01)
  // Lane dashes + parking bay ends.
  for (let x = x0 + 0.3; x < x1 - 0.6; x += 1.4) b.slab('matte', '#d9dbdc', [x, STREET.roadY, 6.05], [x + 0.75, STREET.roadY + 0.004, 6.15])
  for (const x of [0.0, 4.95]) b.slab('matte', '#d9dbdc', [x, STREET.roadY, STREET.paveEnd + STREET.curb], [x + 0.08, STREET.roadY + 0.004, 5.6])
  // Bollards at the shop front.
  for (const x of [0.4, 4.6]) {
    b.cyl('satin', '#202224', 0.05, 0.05, 0.7, [x, 0.35, 2.75], 0, 10)
    b.cyl('glow', '#ffdcae', 0.051, 0.051, 0.03, [x, 0.62, 2.75], 0, 10)
  }
  b.group([VAN.x, STREET.roadY, VAN.z], VAN.yaw, () => van(b))
}

function van(b: GeoBuilder) {
  const L = 4.3
  const Wd = 1.78
  const body = '#eef0f1'
  // Side profile extruded across the width.
  const s = new Shape()
  s.moveTo(-L / 2, 0.36)
  s.lineTo(L / 2 - 0.05, 0.36)
  s.lineTo(L / 2, 0.55)
  s.lineTo(L / 2 - 0.02, 0.98)
  s.lineTo(L / 2 - 0.55, 1.12)
  s.lineTo(L / 2 - 1.2, 1.84)
  s.lineTo(-L / 2 + 0.06, 1.88)
  s.lineTo(-L / 2, 1.8)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: Wd - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 1 })
  b.add('gloss', g, body, [0, 0, -(Wd - 0.08) / 2])
  // Dark lower cladding + bumpers.
  b.box('satin', '#2b2d30', [L + 0.02, 0.2, Wd + 0.02], [0, 0.44, 0], 0, 0.04)
  b.box('satin', '#2b2d30', [0.14, 0.22, Wd - 0.1], [L / 2 + 0.01, 0.5, 0], 0, 0.04)
  b.box('satin', '#2b2d30', [0.12, 0.2, Wd - 0.1], [-L / 2 - 0.01, 0.48, 0], 0, 0.04)
  // Windscreen (sloped), side cabin windows, rear-door windows.
  const ws = Math.atan2(1.84 - 1.12, 0.65)
  const side = Wd / 2 + 0.045 // outside the extrusion bevel
  b.box('gloss', '#0f1418', [0.9, 0.02, Wd - 0.14], [L / 2 - 0.875 + 0.04, 1.48 + 0.037, 0], [0, 0, -ws], 0.005)
  for (const sd of [-1, 1]) {
    b.box('gloss', '#0f1418', [0.55, 0.4, 0.02], [L / 2 - 1.2, 1.42, sd * side])
    b.box('satin', '#c9cdd0', [0.012, 1.1, 0.01], [L / 2 - 1.55, 1.05, sd * side])
    // Brand-gold pinstripe (no text).
    b.box('gloss', C.gold, [L - 0.6, 0.05, 0.012], [-0.15, 0.78, sd * side])
    // Mirrors.
    b.box('gloss', '#1b1c1e', [0.1, 0.14, 0.12], [L / 2 - 0.6, 1.22, sd * (side + 0.07)], 0, 0.02)
  }
  b.box('gloss', '#0f1418', [0.02, 0.4, Wd - 0.5], [-L / 2 - 0.05, 1.4, 0])
  // Grille + lights.
  b.box('satin', '#1a1b1d', [0.03, 0.14, 0.9], [L / 2 + 0.012, 0.78, 0])
  for (const sd of [-1, 1]) {
    b.box('glow', '#fff6e2', [0.03, 0.1, 0.28], [L / 2 + 0.008, 0.84, sd * 0.66], [0, sd * 0.25, 0], 0.01)
    b.box('glow', '#ff2a2a', [0.03, 0.34, 0.1], [-L / 2 - 0.03, 1.15, sd * 0.8])
    b.box('glow', '#ffb028', [0.03, 0.04, 0.12], [L / 2 + 0.01, 0.62, sd * 0.7])
  }
  // Wheels.
  for (const x of [L / 2 - 0.75, -L / 2 + 0.75])
    for (const sd of [-1, 1]) {
      b.cyl('matte', '#161718', 0.33, 0.33, 0.22, [x, 0.33, sd * (Wd / 2 - 0.08)], [Math.PI / 2, 0, 0], 16)
      b.cyl('metal', '#a9adb1', 0.18, 0.18, 0.225, [x, 0.33, sd * (Wd / 2 - 0.08)], [Math.PI / 2, 0, 0], 12)
    }
  // Roof rack bars.
  if (!b.lite) for (const x of [-1.4, -0.5, 0.4]) b.box('metal', '#9a9fa4', [0.03, 0.03, Wd - 0.2], [x, 1.93, 0])
}

export function StreetSurfaces({ theme }: { theme: Theme }) {
  const pave = useMemo(() => {
    const t = makePavement()
    t.repeat.set((STREET.baseX1 - STREET.baseX0) / 2, (STREET.paveEnd - ROOM.vest) / 2)
    return t
  }, [])
  const asphalt = useMemo(() => {
    const t = makeAsphalt()
    t.repeat.set((STREET.baseX1 - STREET.baseX0) / 3, (STREET.roadEnd - STREET.paveEnd) / 3)
    return t
  }, [])
  const glow = useMemo(() => makeRadialGlow(), [])
  const warm = useMemo(() => new Color('#fff1d6'), [])
  const k = themeK(theme)
  const pw = STREET.baseX1 - STREET.baseX0
  const pd = STREET.paveEnd - ROOM.vest - 0.06
  const rd = STREET.roadEnd - STREET.paveEnd - STREET.curb
  const xc = (STREET.baseX0 + STREET.baseX1) / 2
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[xc, 0.0, ROOM.vest + 0.06 + pd / 2]} receiveShadow>
        <planeGeometry args={[pw, pd]} />
        <meshStandardMaterial map={pave} roughness={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[xc, STREET.roadY + 0.001, STREET.paveEnd + STREET.curb + rd / 2]} receiveShadow>
        <planeGeometry args={[pw, rd]} />
        <meshStandardMaterial map={asphalt} roughness={0.92} />
      </mesh>
      {/* headlight pools on the asphalt */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} rotation-x={-Math.PI / 2} position={[VAN.x + 2.7, STREET.roadY + 0.006, VAN.z + sd * 0.6]}>
          <planeGeometry args={[1.3, 0.9]} />
          <meshBasicMaterial map={glow} color={warm} transparent opacity={k.halo * 0.75} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
