import { useMemo } from 'react'
import type { GeoBuilder } from './builder'
import { C, makePegboard } from './materials'

const TOP = 0.9 // bench top surface height
export const BENCH = { depth: 0.75, top: TOP, b1: [-0.55, -2.25] as const, b2: [-2.3, -4.0] as const }
export const PEG = { z0: -0.72, z1: -3.2, y0: 1.3, y1: 2.06 } as const
/** Laptop sits on this point (top of the stand). */
export const LAPTOP_SEAT = [0.4, TOP + 0.135, -3.15] as const

function bench(b: GeoBuilder, z0: number, z1: number) {
  const d = BENCH.depth
  const zc = (z0 + z1) / 2
  const len = z0 - z1
  b.box('satin', C.benchTop, [d, 0.04, len], [d / 2, TOP - 0.02, zc], 0, 0.006)
  for (const x of [0.06, d - 0.06])
    for (const z of [z0 - 0.06, z1 + 0.06]) b.box('satin', C.benchLeg, [0.05, TOP - 0.04, 0.05], [x, (TOP - 0.04) / 2, z])
  // Apron and foot rails.
  b.box('satin', C.benchLeg, [0.03, 0.07, len - 0.12], [d - 0.06, TOP - 0.075, zc])
  for (const z of [z0 - 0.06, z1 + 0.06]) b.box('satin', C.benchLeg, [d - 0.12, 0.04, 0.04], [d / 2, 0.14, z])
}

function chair(b: GeoBuilder, x: number, z: number, yaw: number) {
  const k = '#18191b'
  b.group([x, 0, z], yaw, () => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      b.box('gloss', k, [0.3, 0.035, 0.04], [Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15], a === 0 ? 0 : -a)
      b.cyl('matte', '#101112', 0.025, 0.025, 0.03, [Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29], [Math.PI / 2, 0, a], 8)
    }
    b.cyl('metal', '#2a2c2e', 0.022, 0.022, 0.34, [0, 0.27, 0], 0, 8)
    b.box('matte', k, [0.48, 0.07, 0.48], [0, 0.48, 0], 0, 0.03)
    // Mesh back, leaning back (chair faces -x locally).
    b.box('matte', '#222326', [0.04, 0.5, 0.44], [0.26, 0.82, 0], [0, 0, -0.12], 0.02)
    b.box('gloss', k, [0.06, 0.28, 0.06], [0.24, 0.58, 0], [0, 0, -0.12])
    for (const s of [-1, 1]) {
      b.box('gloss', k, [0.03, 0.2, 0.03], [0.02, 0.6, s * 0.25])
      b.box('gloss', k, [0.24, 0.03, 0.06], [-0.02, 0.7, s * 0.25], 0, 0.01)
    }
  })
}

function toolCabinet(b: GeoBuilder) {
  // Black rolling cabinet with white drawers, under the first bench.
  b.group([0.52, 0, -2.0], 0, () => {
    b.box('gloss', '#151618', [0.46, 0.66, 0.5], [0, 0.45, 0], 0, 0.012)
    for (let i = 0; i < 5; i++) {
      const y = 0.22 + i * 0.118
      b.box('satin', '#dcdfe1', [0.02, 0.1, 0.42], [0.235, y, 0])
      b.box('metal', C.steel, [0.02, 0.012, 0.3], [0.25, y + 0.03, 0])
    }
    for (const x of [-0.18, 0.18]) for (const z of [-0.2, 0.2]) b.cyl('matte', '#2b2c2e', 0.04, 0.04, 0.03, [x, 0.06, z], [Math.PI / 2, 0, 0], 10)
  })
}

function pegboardTools(b: GeoBuilder) {
  const x = 0.035
  // Red-handled screwdrivers, hanging tips down.
  for (let i = 0; i < 9; i++) {
    const z = -0.84 - i * 0.068
    b.cyl('gloss', C.red, 0.015, 0.017, 0.11, [x + 0.02, 1.9, z], 0, 8)
    b.cyl('gloss', '#151515', 0.012, 0.015, 0.03, [x + 0.02, 1.97, z], 0, 8)
    b.cyl('metal', C.steel, 0.0035, 0.0035, 0.13 + (i % 3) * 0.03, [x + 0.02, 1.78 - (i % 3) * 0.015, z], 0, 5)
  }
  // Small precision screwdrivers (red / blue / black).
  for (let i = 0; i < 4; i++) {
    const z = -1.5 - i * 0.04
    b.cyl('gloss', ['#1b4fc0', C.red, '#141414', C.red][i], 0.009, 0.009, 0.08, [x + 0.015, 1.88, z], 0, 6)
    b.cyl('metal', C.steel, 0.0025, 0.0025, 0.08, [x + 0.015, 1.8, z], 0, 4)
  }
  // Pliers / cutters, red grips, bottom row.
  for (let i = 0; i < 5; i++) {
    const z = -0.95 - i * 0.12
    b.box('gloss', C.red, [0.016, 0.13, 0.016], [x + 0.015, 1.5, z - 0.018], [0.22, 0, 0])
    b.box('gloss', C.red, [0.016, 0.13, 0.016], [x + 0.015, 1.5, z + 0.018], [-0.22, 0, 0])
    b.box('metal', '#8d9296', [0.014, 0.06, 0.03], [x + 0.015, 1.6, z])
  }
  // Yellow bit holder bar.
  b.box('gloss', C.yellow, [0.03, 0.03, 0.34], [x + 0.015, 1.4, -0.98])
  if (!b.lite) for (let i = 0; i < 10; i++) b.cyl('gloss', '#222', 0.006, 0.006, 0.04, [x + 0.02, 1.43, -0.84 - i * 0.03], 0, 5)
  // Yellow and blue straps.
  b.box('matte', C.yellow, [0.012, 0.6, 0.045], [x + 0.008, 1.66, -1.83])
  b.box('matte', C.yellow, [0.012, 0.62, 0.045], [x + 0.008, 1.64, -1.97], [0.04, 0, 0])
  b.box('matte', '#2459c9', [0.012, 0.52, 0.045], [x + 0.008, 1.72, -2.12])
  for (const z of [-1.83, -1.97, -2.12]) b.box('gloss', '#222', [0.02, 0.04, 0.05], [x + 0.012, 1.98, z])
  // Coiled cables: red and black, with dangling tails.
  const coils: [number, number, string, number][] = [
    [-2.33, 1.84, '#1a1a1a', 0.07],
    [-2.5, 1.84, '#1a1a1a', 0.065],
    [-2.67, 1.84, C.red, 0.075],
    [-2.84, 1.85, '#1a1a1a', 0.06],
    [-2.98, 1.84, C.red, 0.055],
    [-3.1, 1.84, '#1a1a1a', 0.05],
    [-2.4, 1.56, C.red, 0.05],
    [-2.6, 1.56, C.red, 0.045],
  ]
  for (const [z, y, col, r] of coils) {
    b.torus('gloss', col, r, 0.007, [x + 0.02, y, z], Math.PI / 2, 16)
    if (!b.lite) {
      b.torus('gloss', col, r * 0.8, 0.006, [x + 0.028, y - 0.01, z + 0.01], Math.PI / 2, 14)
      b.box('gloss', col, [0.008, 0.3, 0.008], [x + 0.02, y - r - 0.15, z + 0.02])
    }
  }
  // Blue screwdriver set rack.
  b.box('gloss', '#1d4fbf', [0.04, 0.035, 0.24], [x + 0.02, 1.47, -2.48])
  if (!b.lite) for (let i = 0; i < 7; i++) b.cyl('gloss', '#1d4fbf', 0.007, 0.007, 0.08, [x + 0.03, 1.52, -2.38 - i * 0.032], 0, 6)
}

function microscope(b: GeoBuilder) {
  b.group([0.36, TOP, -0.98], 0, () => {
    b.box('satin', C.white, [0.3, 0.05, 0.26], [0, 0.025, 0], 0, 0.015)
    b.cyl('gloss', '#1b1c1e', 0.07, 0.07, 0.008, [0.02, 0.054, 0], 0, 20)
    b.cyl('metal', '#c9cdd0', 0.02, 0.02, 0.38, [-0.11, 0.24, 0], 0, 10)
    b.box('satin', C.white, [0.16, 0.05, 0.06], [-0.04, 0.33, 0])
    // Body + zoom knobs.
    b.cyl('satin', C.white, 0.045, 0.045, 0.1, [0.02, 0.34, 0], 0, 14)
    b.cyl('gloss', '#1b1c1e', 0.024, 0.024, 0.13, [0.02, 0.34, 0], [Math.PI / 2, 0, 0], 12)
    b.cyl('gloss', '#1b1c1e', 0.03, 0.026, 0.06, [0.02, 0.27, 0], 0, 12)
    // Binocular head tilted toward the operator (+x).
    b.box('satin', C.white, [0.08, 0.06, 0.1], [0.04, 0.41, 0], [0, 0, -0.5], 0.01)
    for (const s of [-1, 1]) b.cyl('gloss', '#18191a', 0.017, 0.017, 0.09, [0.09, 0.46, s * 0.032], [0, 0, -0.75], 10)
    // Focus arm knob + cable.
    b.cyl('gloss', '#1b1c1e', 0.025, 0.025, 0.1, [-0.11, 0.2, 0], [Math.PI / 2, 0, 0], 10)
    if (!b.lite) b.torus('gloss', '#111', 0.06, 0.004, [0.1, 0.003, 0.17], [Math.PI / 2, 0, 0], 14)
  })
}

function benchGear(b: GeoBuilder) {
  // Green ESD mat.
  b.box('matte', C.matGreen, [0.6, 0.004, 0.82], [0.43, TOP + 0.002, -1.66])
  // Oscilloscope (light grey case, screen toward the operator).
  b.group([0.2, TOP, -1.43], -0.08, () => {
    b.box('satin', '#d3d6d8', [0.16, 0.17, 0.33], [0, 0.085, 0], 0, 0.012)
    b.box('glow', '#16324a', [0.004, 0.11, 0.16], [0.082, 0.1, 0.05])
    b.box('glow', '#e8d24a', [0.005, 0.006, 0.14], [0.083, 0.11, 0.05], [0.3, 0, 0])
    b.box('glow', '#3ec7f0', [0.005, 0.005, 0.14], [0.083, 0.08, 0.05], [-0.2, 0, 0])
    if (!b.lite)
      for (let i = 0; i < 6; i++)
        b.cyl('gloss', '#2a2b2d', 0.008, 0.008, 0.012, [0.085, 0.06 + (i % 2) * 0.05, -0.06 - Math.floor(i / 2) * 0.03], [0, 0, Math.PI / 2], 8)
  })
  // Blue hot-air station.
  b.group([0.2, TOP, -1.88], 0, () => {
    b.box('gloss', C.blue, [0.18, 0.12, 0.15], [0, 0.06, 0], 0, 0.01)
    b.box('gloss', '#e3cf2a', [0.004, 0.05, 0.11], [0.091, 0.07, 0])
    b.box('glow', '#ff4b2b', [0.004, 0.018, 0.05], [0.093, 0.08, 0.02])
    b.cyl('gloss', '#1d1d1d', 0.018, 0.018, 0.14, [0.06, 0.18, 0.1], [0.4, 0, 0], 8)
  })
  // Yellow soldering station + iron holder.
  b.group([0.2, TOP, -2.12], 0, () => {
    b.box('gloss', C.yellow, [0.17, 0.1, 0.14], [0, 0.05, 0], 0, 0.01)
    b.box('gloss', '#151515', [0.004, 0.06, 0.12], [0.086, 0.05, 0])
    b.box('glow', '#ff5a2a', [0.004, 0.016, 0.04], [0.088, 0.065, 0.02])
    b.cyl('metal', C.steel, 0.022, 0.03, 0.09, [0.09, 0.07, -0.13], [0, 0, -0.6], 10)
    b.cyl('gloss', '#1a1a1a', 0.012, 0.012, 0.14, [0.13, 0.12, -0.13], [0, 0, -0.6], 8)
    b.box('matte', '#e6c440', [0.06, 0.012, 0.06], [0.14, 0.006, -0.13])
  })
  // Bench power supply (two units).
  b.group([0.2, TOP, -2.48], 0, () => {
    b.box('satin', '#e1e3e4', [0.22, 0.12, 0.2], [0, 0.06, 0], 0, 0.01)
    b.box('glow', '#36e07a', [0.004, 0.022, 0.06], [0.111, 0.085, 0.04])
    b.box('glow', '#ff4a3a', [0.004, 0.022, 0.06], [0.111, 0.085, -0.04])
    b.box('satin', '#d7d9db', [0.2, 0.08, 0.13], [0, 0.04, -0.2], 0, 0.01)
    b.box('glow', '#36e07a', [0.004, 0.018, 0.05], [0.101, 0.05, -0.2])
    for (const s of [-1, 1]) b.cyl('gloss', s > 0 ? C.red : '#111', 0.008, 0.008, 0.015, [0.112, 0.03, s * 0.05], [0, 0, Math.PI / 2], 8)
    if (!b.lite) b.torus('gloss', C.red, 0.05, 0.004, [0.2, 0.003, 0.05], [Math.PI / 2, 0, 0], 14)
  })
  // Laptop stand (dark) on bench two; laptop itself is the exploded-view component.
  b.group([LAPTOP_SEAT[0], TOP, LAPTOP_SEAT[2]], 0, () => {
    b.box('metal', '#2c2e31', [0.2, 0.008, 0.22], [0, 0.004, 0])
    b.box('metal', '#2c2e31', [0.008, 0.14, 0.03], [-0.02, 0.07, 0.09], [0, 0, -0.35])
    b.box('metal', '#2c2e31', [0.008, 0.14, 0.03], [-0.02, 0.07, -0.09], [0, 0, -0.35])
    b.box('metal', '#2c2e31', [0.25, 0.008, 0.26], [0, 0.13, 0])
  })
  // Blue gadget and a mouse on bench two.
  b.box('gloss', '#2552c2', [0.1, 0.05, 0.14], [0.25, TOP + 0.025, -3.65], 0, 0.008)
  b.box('gloss', '#18191a', [0.1, 0.03, 0.06], [0.6, TOP + 0.015, -3.38], 0, 0.014)
}

export function buildBenches(b: GeoBuilder): void {
  bench(b, BENCH.b1[0], BENCH.b1[1])
  bench(b, BENCH.b2[0], BENCH.b2[1])
  // Pegboard back panel edge (the face is a textured mesh).
  b.slab('satin', '#a9adb0', [0.005, PEG.y0, PEG.z1], [0.025, PEG.y1, PEG.z0])
  pegboardTools(b)
  microscope(b)
  benchGear(b)
  toolCabinet(b)
  chair(b, 1.15, -1.45, 0.15)
  chair(b, 1.2, -3.25, -0.25)
}

/** Pegboard face with the hole grid texture. */
export function Pegboard() {
  const tex = useMemo(() => {
    const t = makePegboard()
    t.repeat.set((PEG.z0 - PEG.z1) / 0.6, (PEG.y1 - PEG.y0) / 0.6)
    return t
  }, [])
  return (
    <mesh position={[0.026, (PEG.y0 + PEG.y1) / 2, (PEG.z0 + PEG.z1) / 2]} rotation-y={Math.PI / 2} receiveShadow>
      <planeGeometry args={[PEG.z0 - PEG.z1, PEG.y1 - PEG.y0]} />
      <meshStandardMaterial map={tex} roughness={0.7} />
    </mesh>
  )
}
