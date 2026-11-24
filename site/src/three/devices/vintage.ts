import type { GeoBuilder, V3 } from '../builder'
import { circlePath, elcap, extrude, header, K, knob, lathe, pcb, roundRect, roundRectPath, screw, shade, slots, tube } from './kit'
import type { ModelSpec } from './types'
import { C, rng } from '../materials'

/**
 * Late-70s stereo cassette deck. Front = +z, floor at y = 0.
 * Brushed aluminium faceplate with two warm-lit VU meters, piano-key transport,
 * smoked cassette door. Exploded: the cover lifts, the faceplate pulls forward,
 * the transport rises with its heads and belts floating out of it, and the caps,
 * TO-3 power transistors on their heatsink and the level pots lift off the
 * brown phenolic board.
 */
const W = 0.43
const H = 0.12
const D = 0.29
const ZF = D / 2 // chassis front (faceplate back face)
const FP = 0.01 // faceplate thickness
const ALU = '#cfd2d5'
const WOOD = '#6b3f22'
/** Transport: plate centre behind the cassette door. */
const MECH: V3 = [-0.125, 0.012, ZF - 0.03]
const POTS = [0.03, 0.075, 0.12, 0.165]
const SINK: V3 = [0.06, 0.012, -0.12]

function chassis(b: GeoBuilder) {
  // Bottom pan, side rails, back panel with RCA jacks + mains lead, feet, transformer, phenolic main board.
  b.box('metal', '#8d9297', [W - 0.012, 0.003, D], [0, 0.0105, 0])
  for (const s of [-1, 1]) b.box('metal', '#7d8287', [0.003, 0.03, D], [s * (W / 2 - 0.008), 0.024, 0])
  b.box('metal', '#3a3d41', [W - 0.012, H - 0.012, 0.003], [0, (H - 0.012) / 2 + 0.009, -D / 2 + 0.0015])
  for (let i = 0; i < 4; i++)
    for (const [dx, col] of [[0, '#d8d8d4'], [0.014, C.red]] as const) {
      const x = 0.07 + i * 0.03 + dx * 0
      const y = 0.04 + (dx > 0 ? 0.018 : 0)
      b.cyl('metal', K.gold, 0.0045, 0.0045, 0.012, [x, y, -D / 2 - 0.006], [Math.PI / 2, 0, 0], 14)
      b.cyl('gloss', col, 0.0058, 0.0058, 0.002, [x, y, -D / 2 - 0.001], [Math.PI / 2, 0, 0], 14)
    }
  b.box('matte', '#e6e2d6', [0.03, 0.006, 0.0005], [0.115, 0.075, -D / 2 - 0.0005])
  tube(b, 'gloss', '#151515', [[-0.17, 0.04, -D / 2], [-0.17, 0.04, -D / 2 - 0.03], [-0.15, 0.02, -D / 2 - 0.06]], 0.003)
  for (const x of [-0.17, 0.17]) for (const z of [-0.11, 0.11]) b.cyl('matte', K.rubber, 0.014, 0.012, 0.009, [x, 0.0045, z], 0, 14)
  // Mains transformer (laminations + bell end).
  b.group([0.168, 0.012, -0.095], 0, () => {
    b.box('metal', '#4a4e53', [0.05, 0.046, 0.042], [0, 0.023, 0], 0, 0.001)
    for (let i = 0; i < 10; i++) b.box('metal', '#5d6267', [0.0505, 0.0012, 0.0425], [0, 0.004 + i * 0.0042, 0])
    b.box('satin', '#b8712f', [0.03, 0.032, 0.05], [0, 0.024, 0], 0, 0.006)
    for (const s of [-1, 1]) b.box('metal', '#9aa0a5', [0.06, 0.003, 0.012], [0, 0.0015, s * 0.026])
  })
  // Main board: brown phenolic with copper-ish traces, axial resistors, disc caps, TO-92s.
  b.group([0.075, 0.018, -0.02], 0, () => {
    const t = pcb(b, { w: 0.24, d: 0.22, t: 0.0016, color: K.phenolic, seed: 19, traces: 160, vias: 40, silk: 50, edge: '#5e3c1c' })
    const r = rng(5)
    for (let i = 0; i < 46; i++) {
      const x = -0.11 + r() * 0.22
      const z = -0.1 + r() * 0.2
      if (Math.abs(x - 0.0) < 0.03 && z < -0.05) continue
      const rot = r() > 0.5 ? Math.PI / 2 : 0
      b.group([x, t + 0.002, z], rot, () => {
        b.cyl('satin', '#d8c39a', 0.0012, 0.0012, 0.0062, [0, 0, 0], [0, 0, Math.PI / 2], 8)
        for (let k = 0; k < 3; k++) b.cyl('satin', ['#7a3b1c', '#141414', C.red, '#e0a020', '#2b5fbf'][Math.floor(r() * 5)], 0.00125, 0.00125, 0.0006, [-0.0018 + k * 0.0013, 0, 0], [0, 0, Math.PI / 2], 8)
        for (const s of [-1, 1]) b.box('metal', K.solder, [0.003, 0.0003, 0.0003], [s * 0.0045, -0.001, 0])
      })
    }
    for (let i = 0; i < 14; i++) b.cyl('gloss', '#e0702a', 0.0028, 0.0028, 0.0012, [-0.1 + r() * 0.2, t + 0.004, -0.09 + r() * 0.18], [Math.PI / 2, r() * 3, 0], 12)
    for (let i = 0; i < 10; i++) {
      const p: V3 = [-0.1 + r() * 0.2, t, -0.09 + r() * 0.18]
      b.cyl('satin', '#151515', 0.0022, 0.0022, 0.0045, [p[0], p[1] + 0.0042, p[2]], 0, 10)
    }
    header(b, 6, 1, [0.105, t, 0.08], Math.PI / 2, 0.0039, 0.007)
    for (const [x, z] of [[-0.112, -0.102], [0.112, -0.102], [-0.112, 0.102], [0.112, 0.102]] as const) screw(b, [x, t, z], 0.0028)
  })
  // Wiring loom from the transport to the board.
  tube(b, 'gloss', '#d4c9a8', [[-0.06, 0.03, 0.08], [-0.02, 0.026, 0.05], [0.0, 0.026, 0.0]], 0.0016, { radial: 5 })
  tube(b, 'gloss', C.red, [[-0.06, 0.034, 0.075], [-0.025, 0.03, 0.04], [-0.01, 0.028, -0.01]], 0.0012, { radial: 5 })
}

function cover(b: GeoBuilder) {
  // Black steel U-cover (top + sides) with vent slots, walnut veneer side cheeks.
  b.box('satin', '#1d1e20', [W - 0.006, 0.0025, D], [0, H - 0.00125, 0], 0, 0.001)
  slots(b, 0.09, -0.07, H + 0.0001, 9, 3, 0.012, 0.004, 0.016, 0.012, '#08090a')
  for (const s of [-1, 1]) {
    b.box('satin', '#1d1e20', [0.0025, H - 0.01, D], [s * (W / 2 - 0.0042), (H - 0.01) / 2 + 0.01, 0])
    b.box('satin', (n) => (Math.abs(n.x) > 0.7 ? WOOD : shade(WOOD, 0.8)), [0.012, H + 0.002, D + 0.004], [s * (W / 2 + 0.003), H / 2, 0], 0, 0.002)
    const r = rng(s > 0 ? 3 : 4)
    for (let i = 0; i < 7; i++) b.box('satin', shade(WOOD, 0.82 + r() * 0.12), [0.0004, 0.0016 + r() * 0.002, D - 0.004], [s * (W / 2 + 0.0092), 0.012 + i * 0.016 + r() * 0.006, 0])
    for (const z of [-0.1, 0.1]) screw(b, [s * (W / 2 - 0.0055), 0.025, z], 0.0024, [0, 0, -s * Math.PI / 2], 0, '#202124')
  }
}

function faceplate(b: GeoBuilder) {
  // Pivot at the faceplate back face centre (z = 0 is its back). Front at z = FP.
  const dx = -0.125
  const plate = roundRect(W - 0.004, H - 0.004, 0.003, 0, H / 2)
  plate.holes.push(roundRectPath(0.13, 0.058, 0.003, dx, 0.072))
  // Clearance holes for the level pots' shafts (hidden under the knobs).
  for (const x of POTS) plate.holes.push(circlePath(0.0105, x, 0.032))
  extrude(b, 'metal', ALU, plate, FP, [0, 0, FP / 2], 0, 0.0012, 8)
  // Brushed lines; the rows level with the pots stop short of their shafts (the knobs cover the gaps).
  for (let i = 0; i < 26; i++) {
    const y = 0.006 + i * 0.0043
    const col = shade(ALU, 0.93 + (i % 3) * 0.03)
    const x0 = 0.083 - (W - 0.17) / 2
    const x1 = 0.083 + (W - 0.17) / 2
    const cuts = Math.abs(y - 0.032) < 0.011 ? POTS : []
    let from = x0
    for (const px of [...cuts, x1 + 0.011]) {
      const to = Math.min(px - 0.011, x1)
      if (to > from) b.box('metal', col, [to - from, 0.0006, 0.0002], [(from + to) / 2, y, FP + 0.0001])
      from = px + 0.011
    }
  }
  // Cassette door: black frame around a smoked window (the cassette shows through), eject recess.
  for (const s of [-1, 1]) {
    b.box('gloss', '#121314', [0.15, 0.012, 0.004], [dx, 0.072 + s * 0.035, FP + 0.002], 0, 0.0015)
    b.box('gloss', '#121314', [0.012, 0.07, 0.004], [dx + s * 0.07, 0.072, FP + 0.002], 0, 0.0015)
  }
  b.box('glass', '#3a3226', [0.13, 0.058, 0.002], [dx, 0.072, FP + 0.0032])
  b.box('metal', ALU, [0.05, 0.003, 0.0006], [dx, 0.105, FP + 0.0043])
  // Piano-key transport row under the door, with symbols.
  const keys = ['rec', 'rew', 'play', 'ff', 'stop', 'pause'] as const
  keys.forEach((k, i) => {
    const x = dx - 0.0625 + i * 0.025
    b.box('metal', k === 'rec' ? '#9c2a24' : '#d9dcdf', [0.022, 0.016, 0.03], [x, 0.0135, FP + 0.012], [-0.08, 0, 0], 0.0015)
    const ys = 0.017
    const zs = FP + 0.0275
    if (k === 'rec') b.cyl('matte', '#f2f2f2', 0.0022, 0.0022, 0.0004, [x, ys, zs], [Math.PI / 2, 0, 0], 10)
    else if (k === 'stop') b.box('matte', '#1a1a1a', [0.004, 0.004, 0.0004], [x, ys, zs])
    else if (k === 'pause') for (const s of [-1, 1]) b.box('matte', '#1a1a1a', [0.0012, 0.0045, 0.0004], [x + s * 0.0013, ys, zs])
    else {
      const dir = k === 'rew' ? -1 : 1
      const n = k === 'play' ? 1 : 2
      for (let j = 0; j < n; j++) b.box('matte', '#1a1a1a', [0.0022, 0.0022, 0.0004], [x + (j - (n - 1) / 2) * 0.0026 * dir, ys, zs], [0, 0, Math.PI / 4])
    }
  })
  // Tape counter with reset button.
  b.box('gloss', '#0d0d0e', [0.03, 0.011, 0.003], [-0.02, 0.1, FP + 0.0015], 0, 0.001)
  for (let i = 0; i < 3; i++) b.box('satin', '#efeee8', [0.0065, 0.008, 0.0005], [-0.028 + i * 0.008, 0.1, FP + 0.0032])
  b.cyl('satin', '#1b1b1c', 0.0032, 0.0032, 0.004, [-0.002, 0.1, FP + 0.002], [Math.PI / 2, 0, 0], 10)
  // VU meters: black bezels, warm backlit faces, scale arcs with a red zone, needles.
  for (const mx of [0.045, 0.125]) {
    b.box('gloss', '#101112', [0.072, 0.05, 0.005], [mx, 0.088, FP + 0.0025], 0, 0.002)
    b.box('glow', '#ffcf86', [0.064, 0.042, 0.0006], [mx, 0.088, FP + 0.0056])
    for (let i = 0; i <= 14; i++) {
      const a = -0.75 + (i / 14) * 1.5
      const red = i > 10
      b.box('glow', red ? '#d0281f' : '#2a1d10', [0.0007, i % 2 ? 0.0028 : 0.0045, 0.0003], [mx + Math.sin(a) * 0.04, 0.07 + Math.cos(a) * 0.04 - 0.004, FP + 0.0061], [0, 0, -a])
    }
    b.box('glow', '#2a1d10', [0.06, 0.0005, 0.0003], [mx - 0.001, 0.1, FP + 0.0061], [0, 0, 0])
    b.box('glow', '#d0281f', [0.016, 0.0009, 0.0003], [mx + 0.022, 0.0995, FP + 0.0062], [0, 0, -0.32])
    b.box('matte', '#121212', [0.0007, 0.034, 0.0003], [mx - 0.008, 0.087, FP + 0.0066], [0, 0, 0.35])
    b.box('matte', '#2a1d10', [0.016, 0.0018, 0.0003], [mx, 0.073, FP + 0.0061])
    b.box('glass', '#fff4e0', [0.066, 0.044, 0.001], [mx, 0.088, FP + 0.0074])
  }
  // Labels under the meters, power switch, headphone jack, gold badge, shaft holes for the pots.
  for (const x of POTS) b.cyl('matte', '#2a2c2f', 0.0045, 0.0045, 0.0006, [x - 0.0, 0.032, FP + 0.0002], [Math.PI / 2, 0, 0], 12)
  for (const x of POTS) b.box('matte', '#3a3c40', [0.016, 0.0016, 0.0003], [x, 0.012, FP + 0.0002])
  b.box('gloss', '#141414', [0.022, 0.012, 0.008], [0.19, 0.093, FP + 0.004], 0, 0.002)
  b.cyl('glow', '#ff5a2a', 0.0016, 0.0016, 0.001, [0.19, 0.075, FP + 0.0006], [Math.PI / 2, 0, 0], 8)
  b.cyl('metal', '#2a2c2f', 0.006, 0.006, 0.004, [0.2, 0.032, FP + 0.002], [Math.PI / 2, 0, 0], 14)
  b.cyl('matte', '#050505', 0.0032, 0.0032, 0.0045, [0.2, 0.032, FP + 0.0022], [Math.PI / 2, 0, 0], 12)
  b.box('metal', K.gold, [0.04, 0.005, 0.0004], [0.085, 0.052, FP + 0.0003])
  b.box('matte', '#3a3c40', [0.03, 0.0025, 0.0003], [-0.17, 0.112, FP + 0.0002])
  for (const x of [-W / 2 + 0.008, W / 2 - 0.008]) for (const y of [0.012, H - 0.012]) screw(b, [x, y, FP], 0.0022, [Math.PI / 2, 0, 0], 0, '#9ea3a8')
}

function tapeMechanism(b: GeoBuilder) {
  // Pivot at the transport's front-bottom centre. Steel plate (facing +z) with the cassette in front of it,
  // capstan + pinch roller under the cassette; flywheel + motor behind the plate.
  b.box('metal', '#9aa0a5', [0.14, 0.095, 0.003], [0, 0.052, -0.012], 0, 0.001)
  for (const s of [-1, 1]) b.box('metal', '#868c92', [0.003, 0.09, 0.06], [s * 0.068, 0.05, -0.04])
  // Cassette: smoke-grey shell, white label, window with two reels of brown tape.
  b.group([0, 0.062, -0.002], 0, () => {
    b.box('satin', '#2c2d30', [0.1, 0.064, 0.012], [0, 0, 0], 0, 0.002)
    b.box('satin', '#f1ece0', [0.088, 0.03, 0.0005], [0, 0.012, 0.0062])
    b.box('satin', '#d9a93f', [0.088, 0.006, 0.0006], [0, 0.023, 0.0064])
    for (let i = 0; i < 3; i++) b.box('matte', '#5a5650', [0.05 - i * 0.012, 0.0015, 0.0004], [-0.01, 0.014 - i * 0.004, 0.0066])
    b.box('glass', '#c9c3b5', [0.044, 0.016, 0.0006], [0, -0.006, 0.0063])
    for (const s of [-1, 1]) {
      b.cyl('satin', '#3a2416', s < 0 ? 0.016 : 0.011, s < 0 ? 0.016 : 0.011, 0.006, [s * 0.021, -0.006, 0.001], [Math.PI / 2, 0, 0], 22)
      b.cyl('satin', '#f2f2ee', 0.0065, 0.0065, 0.0065, [s * 0.021, -0.006, 0.001], [Math.PI / 2, 0, 0], 14)
      for (let k = 0; k < 6; k++) b.box('matte', '#2c2d30', [0.0012, 0.003, 0.007], [s * 0.021 + Math.cos(k) * 0.0045, -0.006 + Math.sin(k) * 0.0045, 0.001], [0, 0, k])
    }
    b.box('satin', '#2c2d30', [0.07, 0.008, 0.012], [0, -0.028, 0], 0, 0.001)
    b.box('satin', '#4a2c18', [0.05, 0.0012, 0.004], [0, -0.0325, 0])
  })
  // Capstan + pinch roller (rubber).
  b.cyl('metal', K.chrome, 0.0015, 0.0015, 0.024, [0.03, 0.022, -0.004], [Math.PI / 2, 0, 0], 10)
  b.cyl('matte', K.rubber, 0.0055, 0.0055, 0.01, [0.038, 0.022, 0.0], [Math.PI / 2, 0, 0], 16)
  b.cyl('metal', '#9aa0a5', 0.006, 0.006, 0.002, [0.038, 0.022, -0.0062], [Math.PI / 2, 0, 0], 12)
  // Reel spindles, flywheel, motor behind the plate.
  for (const s of [-1, 1]) b.cyl('satin', '#eeeeea', 0.004, 0.004, 0.012, [s * 0.021, 0.056, -0.006], [Math.PI / 2, 0, 0], 8)
  b.cyl('metal', '#b9bec3', 0.03, 0.03, 0.008, [0.022, 0.04, -0.04], [Math.PI / 2, 0, 0], 32)
  b.cyl('metal', '#868c92', 0.012, 0.012, 0.009, [0.022, 0.04, -0.04], [Math.PI / 2, 0, 0], 20)
  b.cyl('metal', '#3a3d41', 0.016, 0.016, 0.03, [-0.035, 0.065, -0.058], [Math.PI / 2, 0, 0], 22)
  b.cyl('metal', '#c9cdd1', 0.0045, 0.0045, 0.008, [-0.035, 0.065, -0.039], [Math.PI / 2, 0, 0], 12)
  b.box('satin', '#f0ead9', [0.008, 0.004, 0.006], [-0.035, 0.084, -0.062])
  // Solenoid and its leads.
  b.box('gloss', '#1d1e21', [0.018, 0.016, 0.022], [-0.045, 0.018, -0.035], 0, 0.002)
  b.box('satin', '#b8712f', [0.012, 0.014, 0.018], [-0.045, 0.018, -0.035])
}

function headBlock(b: GeoBuilder) {
  // Pivot at the head plate. Erase head + chrome rec/play head + tape guides, pointing +y into the cassette.
  b.box('metal', '#8d9297', [0.04, 0.003, 0.016], [0, 0, 0], 0, 0.0008)
  b.box('metal', K.chrome, [0.012, 0.012, 0.009], [0.004, 0.0075, 0.0], 0, 0.002)
  b.cyl('metal', '#f2f4f6', 0.0045, 0.0045, 0.012, [0.004, 0.0125, 0.0], [0, 0, Math.PI / 2], 16)
  b.box('matte', '#1b1b1c', [0.0006, 0.0005, 0.007], [0.004, 0.0172, 0.0])
  b.box('metal', '#b9bec3', [0.007, 0.01, 0.007], [-0.012, 0.0065, 0.0], 0, 0.0015)
  for (const x of [-0.019, 0.016]) b.cyl('metal', K.chrome, 0.0012, 0.0012, 0.012, [x, 0.0075, 0.0], 0, 8)
  for (let i = 0; i < 4; i++) tube(b, 'gloss', ['#c3262b', '#e6e6e6', '#1d4fbf', '#141414'][i], [[0.0, 0.002, -0.004 - i * 0.0008], [0.006, -0.003, -0.0055], [0.02, -0.006, -0.006 - i * 0.0004]], 0.0005, { radial: 4 })
  screw(b, [-0.016, 0.0015, 0.005], 0.0018)
  screw(b, [0.016, 0.0015, 0.005], 0.0018)
}

function belts(b: GeoBuilder) {
  // Main drive belt (motor pulley -> flywheel) and a thin counter belt; pivot = flywheel centre.
  const loop = (cx0: number, cy0: number, r0: number, cx1: number, cy1: number, r1: number): V3[] => {
    const pts: V3[] = []
    const a = Math.atan2(cy1 - cy0, cx1 - cx0)
    for (let i = 0; i <= 10; i++) {
      const t = a + Math.PI / 2 + (i / 10) * Math.PI
      pts.push([cx0 + Math.cos(t) * r0, cy0 + Math.sin(t) * r0, 0])
    }
    for (let i = 0; i <= 6; i++) {
      const t = a - Math.PI / 2 + (i / 6) * Math.PI
      pts.push([cx1 + Math.cos(t) * r1, cy1 + Math.sin(t) * r1, 0])
    }
    return pts
  }
  tube(b, 'satin', K.rubber, loop(0, 0, 0.0305, -0.057, 0.025, 0.0055), 0.0013, { closed: true, seg: 90, radial: 6 })
  tube(b, 'satin', '#1c1c1d', loop(-0.02, 0.0, 0.012, -0.075, 0.03, 0.006), 0.0008, { closed: true, seg: 60, radial: 5, pos: [0, 0, 0.004] })
  b.torus('satin', K.rubber, 0.007, 0.0012, [-0.057, -0.03, -0.004], 0, 20)
}

function capacitors(b: GeoBuilder) {
  // Electrolytics on the phenolic board (pivot = board top). Two big filter cans by the transformer.
  const caps: [number, number, number, number, string][] = [
    [-0.09, -0.11, 0.011, 0.036, '#1a1a1c'],
    [-0.062, -0.11, 0.011, 0.036, '#1a1a1c'],
    [-0.02, 0.0, 0.005, 0.012, '#1e3f99'],
    [-0.005, 0.03, 0.004, 0.01, '#1e3f99'],
    [0.02, -0.02, 0.006, 0.014, '#1a1a1c'],
    [0.045, 0.04, 0.004, 0.01, '#1e3f99'],
    [0.065, 0.0, 0.0045, 0.011, '#1e3f99'],
    [0.09, 0.03, 0.005, 0.012, '#1a1a1c'],
    [-0.04, 0.05, 0.004, 0.009, '#1e3f99'],
    [0.02, 0.07, 0.0035, 0.008, '#1e3f99'],
  ]
  for (const [x, z, r, h, c] of caps) elcap(b, r, h, [x, 0, z], c, c === '#1e3f99' ? '#d4dcef' : '#9aa1ab')
  for (const [x, z] of [[-0.035, 0.015], [0.05, -0.04]] as const) b.cyl('gloss', '#e6c02c', 0.004, 0.004, 0.012, [x, 0.006, z], 0, 14)
}

function transistors(b: GeoBuilder) {
  // Black anodised finned heatsink (fins along x) with two TO-3 cans on its front face. Pivot = heatsink bottom.
  b.box('satin', '#17181a', [0.08, 0.05, 0.006], [0, 0.025, 0.012], 0, 0.001)
  for (let i = 0; i < 11; i++) b.box('satin', '#1c1d20', [0.0022, 0.05, 0.024], [-0.038 + i * 0.0076, 0.025, -0.003])
  for (const x of [-0.02, 0.02]) {
    b.group([x, 0.026, 0.015], [Math.PI / 2, 0, 0], () => {
      lathe(b, 'metal', '#c9cdd1', [[0, 0], [0.0125, 0], [0.0125, 0.0012], [0.0085, 0.0018], [0.0085, 0.008], [0.0075, 0.009], [0, 0.009]], [0, 0, 0], 0, 24)
      b.box('metal', '#b9bec3', [0.038, 0.0012, 0.016], [0, 0.0006, 0], 0, 0.0005)
      for (const s of [-1, 1]) b.cyl('metal', '#9aa0a5', 0.0022, 0.0022, 0.002, [s * 0.015, 0.0018, 0], 0, 8)
    })
  }
  b.box('matte', '#c8c4b5', [0.07, 0.04, 0.0006], [0, 0.026, 0.0152])
  for (const x of [-0.03, 0.03]) tube(b, 'gloss', '#e6e6e6', [[x, 0.006, 0.02], [x * 0.9, 0.0, 0.03], [x * 0.6, -0.004, 0.05]], 0.0008, { radial: 5 })
}

function pots(b: GeoBuilder) {
  // Four level pots on a bracket (pivot = bracket bottom at the board front), shafts + knobs through the faceplate.
  b.box('metal', '#8d9297', [0.165, 0.03, 0.002], [0.0975, 0.03, -0.004], 0, 0.0006)
  for (const x of POTS) {
    b.cyl('metal', '#9aa0a5', 0.0085, 0.0085, 0.01, [x, 0.032, -0.01], [Math.PI / 2, 0, 0], 18)
    b.box('satin', K.phenolic, [0.017, 0.012, 0.0016], [x, 0.03, -0.016])
    for (let k = -1; k <= 1; k++) b.box('metal', K.solder, [0.0018, 0.008, 0.0006], [x + k * 0.005, 0.02, -0.016])
    b.cyl('metal', K.brass, 0.0045, 0.0045, 0.006, [x, 0.032, 0.001], [Math.PI / 2, 0, 0], 12)
    b.cyl('metal', '#c9cdd1', 0.0022, 0.0022, 0.03, [x, 0.032, 0.012], [Math.PI / 2, 0, 0], 10)
  }
}

/** The level pots' knobs, pulled off their shafts before the faceplate can come away. Same pivot as the pots. */
function potKnobs(b: GeoBuilder) {
  for (const x of POTS) knob(b, 0.0105, 0.014, [x, 0.032, FP + 0.0055], { color: '#d8dbde', skirt: '#141516', line: '#141516' })
}

export const VINTAGE: ModelSpec = {
  id: 'vintage',
  // Shares the ESD mat with the logic board: hides the idle board while it is on show.
  span: 0.32,
  parts: [
    { id: '_chassis', rank: 6, build: chassis },
    { id: 'case', rank: 0, build: cover, xpos: [0, 0.3, -0.02] },
    { id: 'faceplate', rank: 2, build: faceplate, pos: [0, 0, ZF], xpos: [0, 0, ZF + 0.17] },
    { id: 'tapeMechanism', rank: 3, build: tapeMechanism, pos: MECH, xpos: [MECH[0] - 0.01, MECH[1] + 0.13, MECH[2] - 0.02] },
    { id: 'heads', rank: 4, parent: 'tapeMechanism', build: headBlock, pos: [-0.004, 0.016, -0.002], xpos: [-0.004, 0.0, 0.07] },
    // Belts slip forward off the pulleys into the gap behind the plate, rise out, then settle behind.
    {
      id: 'belts',
      rank: 4,
      parent: 'tapeMechanism',
      build: belts,
      pos: [0.022, 0.04, -0.04],
      via: [
        [0.022, 0.04, -0.027],
        [0.022, 0.15, -0.027],
      ],
      xpos: [0.03, 0.135, -0.05],
    },
    { id: 'capacitors', rank: 4, build: capacitors, pos: [0.075, 0.0196, -0.02], xpos: [0.075, 0.1, -0.02] },
    // Heatsink rises clear of the back panel before it leans back.
    { id: 'transistors', rank: 3, build: transistors, pos: SINK, via: [[SINK[0], SINK[1] + 0.12, SINK[2]]], xpos: [SINK[0], SINK[1] + 0.15, SINK[2] - 0.03] },
    { id: 'pots', rank: 3, build: pots, pos: [0, 0, ZF], xpos: [0, 0.11, ZF + 0.06] },
    // Knobs come off their shafts first, then wait above the pots' exploded spot.
    { id: '_knobs', rank: 0, group: 'pots', build: potKnobs, pos: [0, 0, ZF], via: [[0, 0, ZF + 0.03]], xpos: [0, 0.11, ZF + 0.095] },
  ],
}
