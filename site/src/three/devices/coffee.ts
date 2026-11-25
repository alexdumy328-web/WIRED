import type { GeoBuilder } from '../builder'
import { chip, elcap, jst, K, knob, lathe, pcb, screw, slots, smd, sphere, tube } from './kit'
import type { ModelSpec } from './types'
import { C, rng } from '../materials'

/**
 * Home espresso machine (single copper boiler, E61-style chrome group) with a
 * compact burr grinder beside it, on the coffee desk. Front = +z, floor at y = 0.
 * Exploded: the stainless shell lifts, the tank slides back, boiler rises, pump
 * and relay board come out of the right side, the group comes forward and the
 * portafilter drops with the gaskets floating between them; the grinder's hopper
 * and burr lift out.
 */
const W = 0.23
const D = 0.24
const H = 0.38
const BASE = 0.04
const INOX = '#d3d7da'
const INOX_D = '#aeb3b7'
const CHROME = '#e4e7ea'
/** Group head pivot: bottom of the bayonet ring. */
const GROUP = { x: 0, y: 0.165, z: 0.172 }
const GRINDER = { x: -0.225, z: 0.01 }

function frame(b: GeoBuilder) {
  // Base pan with feet, front fascia (gauge, switches, lamps, logo), drip tray, steam wand.
  b.box('metal', INOX, [W, BASE, D], [0, BASE / 2 + 0.006, 0], 0, 0.004)
  for (const x of [-0.09, 0.09]) for (const z of [-0.09, 0.09]) b.cyl('matte', K.rubber, 0.011, 0.012, 0.008, [x, 0.004, z], 0, 12)
  b.box('metal', INOX, [W, H - BASE, 0.004], [0, (H + BASE) / 2, D / 2 - 0.002], 0, 0.0015)
  b.box('metal', INOX_D, [W - 0.01, 0.004, D - 0.01], [0, BASE + 0.008, 0])
  // Pressure gauge.
  b.group([0, 0.325, D / 2], 0, () => {
    lathe(b, 'metal', CHROME, [[0, 0], [0.028, 0], [0.03, 0.004], [0.028, 0.012], [0.024, 0.013], [0, 0.013]], [0, 0, 0], [Math.PI / 2, 0, 0], 28)
    b.cyl('satin', '#f4f2ec', 0.024, 0.024, 0.001, [0, 0, 0.0128], [Math.PI / 2, 0, 0], 28)
    for (let i = 0; i <= 12; i++) {
      const a = -2.3 + (i / 12) * 4.6
      b.box('matte', i > 8 ? C.red : '#1b1b1c', [0.0008, 0.004, 0.0004], [Math.sin(a) * 0.019, Math.cos(a) * 0.019, 0.0135], [0, 0, -a])
    }
    b.box('matte', '#d9a93f', [0.012, 0.004, 0.0004], [0, -0.008, 0.0135])
    b.box('matte', C.red, [0.0012, 0.018, 0.0006], [0.004, 0.006, 0.0138], [0, 0, -0.45])
    b.cyl('glass', '#ffffff', 0.025, 0.025, 0.001, [0, 0, 0.0145], [Math.PI / 2, 0, 0], 28)
  })
  // Rocker switches with lamps, logo plate.
  for (const [x, lamp] of [[-0.075, true], [-0.05, true], [0.06, false], [0.085, true]] as const) {
    b.box('gloss', '#141414', [0.014, 0.022, 0.006], [x, 0.33, D / 2 + 0.003], 0, 0.002)
    b.box('gloss', '#222', [0.011, 0.009, 0.004], [x, 0.335, D / 2 + 0.006], [-0.25, 0, 0])
    if (lamp) b.cyl('glow', '#ff9a3c', 0.003, 0.003, 0.003, [x, 0.302, D / 2 + 0.0015], [Math.PI / 2, 0, 0], 10)
  }
  b.box('gloss', '#18191b', [0.07, 0.012, 0.002], [0, 0.272, D / 2 + 0.001], 0, 0.001)
  b.box('metal', '#d9a93f', [0.05, 0.003, 0.0006], [0, 0.272, D / 2 + 0.0023])
  // Drip tray + grille.
  b.box('metal', INOX_D, [0.2, 0.032, 0.09], [0, 0.022, D / 2 + 0.045], 0, 0.004)
  b.box('metal', INOX, [0.196, 0.003, 0.086], [0, 0.0395, D / 2 + 0.045])
  slots(b, 0, D / 2 + 0.045, 0.0412, 14, 3, 0.008, 0.016, 0.0125, 0.024, '#2a2c2e')
  b.box('gloss', '#c8262b', [0.016, 0.01, 0.003], [0.07, 0.03, D / 2 + 0.091], 0, 0.001)
  // Steam wand on the right: valve knob, chrome tube, black grip, tip.
  knob(b, 0.014, 0.018, [0.085, 0.29, D / 2], { color: '#1a1b1d', line: '#d9a93f' })
  tube(b, 'metal', CHROME, [[0.098, 0.27, D / 2 - 0.004], [0.104, 0.27, D / 2 + 0.03], [0.11, 0.24, D / 2 + 0.05], [0.112, 0.14, D / 2 + 0.06], [0.112, 0.09, D / 2 + 0.065]], 0.0045, { seg: 40 })
  b.cyl('satin', '#141414', 0.0075, 0.0075, 0.05, [0.111, 0.2, D / 2 + 0.056], [0.1, 0, 0], 12)
  b.cyl('metal', CHROME, 0.0055, 0.004, 0.012, [0.112, 0.084, D / 2 + 0.065], 0, 10)
  // Internal bracket the group bolts to.
  b.box('metal', INOX_D, [0.09, 0.08, 0.004], [0, 0.2, D / 2 - 0.01])
}

function housing(b: GeoBuilder) {
  // U-shell: both sides, top with cup-warmer grille, back. Lifts straight up.
  const h = H - BASE - 0.004
  const yc = BASE + 0.004 + h / 2
  for (const s of [-1, 1]) {
    b.box('metal', INOX, [0.0025, h, D], [s * (W / 2 + 0.0013), yc, 0], 0, 0.001)
    for (let i = 0; i < 12; i++) b.box('matte', '#3a3d40', [0.003, 0.003, 0.05], [s * (W / 2 + 0.0015), BASE + 0.03 + i * 0.006, -D / 2 + 0.05])
  }
  b.box('metal', INOX, [W + 0.005, 0.003, D], [0, H + 0.0015, 0], 0, 0.001)
  b.box('metal', INOX, [W + 0.005, h, 0.0025], [0, yc, -D / 2 - 0.0013])
  // Cup-warmer rail and grille.
  for (const s of [-1, 1]) {
    b.cyl('metal', CHROME, 0.004, 0.004, D - 0.03, [s * (W / 2 - 0.012), H + 0.022, 0], [Math.PI / 2, 0, 0], 12)
    for (const z of [-D / 2 + 0.02, D / 2 - 0.02]) b.cyl('metal', CHROME, 0.004, 0.004, 0.02, [s * (W / 2 - 0.012), H + 0.012, z], 0, 10)
  }
  for (const z of [-D / 2 + 0.015, D / 2 - 0.015]) b.cyl('metal', CHROME, 0.004, 0.004, W - 0.024, [0, H + 0.022, z], [0, 0, Math.PI / 2], 12)
  b.box('metal', INOX_D, [W - 0.04, 0.002, D - 0.05], [0, H + 0.004, 0])
  for (let i = 0; i < 15; i++) b.box('metal', CHROME, [W - 0.045, 0.002, 0.004], [0, H + 0.006, -D / 2 + 0.032 + i * 0.0125])
  for (const z of [-0.1, 0.1]) for (const s of [-1, 1]) screw(b, [s * (W / 2 + 0.0026), BASE + 0.015, z], 0.0025, [0, 0, -s * Math.PI / 2])
}

function tank(b: GeoBuilder) {
  // Translucent reservoir with water inside, lid, MAX marks; pivot at its bottom centre.
  const w = 0.1
  const h = 0.15
  const d = 0.06
  b.box('frosted', '#d7e8f2', [w, h, d], [0, h / 2, 0], 0, 0.006)
  b.box('glass', '#7fb6d9', [w - 0.008, h * 0.62, d - 0.008], [0, h * 0.32, 0], 0, 0.004)
  b.box('satin', '#1b1c1e', [w + 0.004, 0.008, d + 0.004], [0, h + 0.004, 0], 0, 0.003)
  b.box('satin', '#1b1c1e', [0.04, 0.01, 0.012], [0, h + 0.012, 0], 0, 0.004)
  for (let i = 0; i < 3; i++) b.box('matte', '#4b6b80', [0.012 - i * 0.003, 0.0012, 0.0006], [w / 2 - 0.012, h * 0.55 + i * 0.012, d / 2 + 0.0003])
  // Inlet tubes hanging into the water.
  tube(b, 'gloss', '#eef1f2', [[0.02, h + 0.006, 0.0], [0.022, h * 0.5, 0.004], [0.02, 0.015, 0.0]], 0.0022, { radial: 7 })
  tube(b, 'gloss', '#eef1f2', [[0.035, h + 0.006, 0.0], [0.036, h * 0.6, -0.006], [0.034, 0.03, -0.004]], 0.0018, { radial: 7 })
}

function boiler(b: GeoBuilder) {
  // Horizontal copper boiler (axis along z), brass end caps, element flange and thermostats.
  const r = 0.052
  const L = 0.15
  b.cyl('metal', K.copper, r, r, L, [0, 0, 0], [Math.PI / 2, 0, 0], 28)
  for (const s of [-1, 1]) {
    lathe(b, 'metal', K.brass, [[0, 0.016], [r * 0.45, 0.014], [r * 0.85, 0.008], [r + 0.002, 0.0], [r + 0.002, -0.006], [0, -0.006]], [0, 0, s * (L / 2 + 0.006)], [s * Math.PI / 2, 0, 0], 28)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      b.cyl('metal', K.steel, 0.0028, 0.0028, 0.004, [Math.cos(a) * (r - 0.004), Math.sin(a) * (r - 0.004), s * (L / 2 + 0.002)], [Math.PI / 2, 0, 0], 6)
    }
  }
  for (let i = 0; i < 4; i++) b.torus('metal', '#a8652f', r + 0.0008, 0.0012, [0, 0, -L / 2 + 0.025 + i * 0.033], 0, 40)
  // Heating element flange at the back with its two terminals and leads.
  b.cyl('metal', K.brass, 0.022, 0.022, 0.006, [0, -0.016, -L / 2 - 0.012], [Math.PI / 2, 0, 0], 18)
  for (const x of [-0.009, 0.009]) {
    b.cyl('satin', '#e8e2d2', 0.004, 0.004, 0.01, [x, -0.016, -L / 2 - 0.018], [Math.PI / 2, 0, 0], 10)
    b.box('metal', K.steel, [0.005, 0.0008, 0.006], [x, -0.016, -L / 2 - 0.025])
  }
  tube(b, 'gloss', C.red, [[-0.009, -0.016, -L / 2 - 0.027], [0.02, -0.05, -L / 2 - 0.03], [0.05, -0.08, -L / 2 - 0.012]], 0.0016, { radial: 6 })
  tube(b, 'gloss', '#1f54c4', [[0.009, -0.016, -L / 2 - 0.027], [0.03, -0.045, -L / 2 - 0.028], [0.055, -0.07, -L / 2 - 0.008]], 0.0016, { radial: 6 })
  // Thermostats, safety valve, pressurestat line on top.
  for (const z of [-0.04, 0.0]) {
    b.cyl('metal', K.steel, 0.009, 0.009, 0.01, [0, r + 0.005, z], 0, 16)
    b.cyl('satin', '#e8e2d2', 0.008, 0.008, 0.006, [0, r + 0.012, z], 0, 16)
    for (const x of [-0.004, 0.004]) b.box('metal', K.steel, [0.003, 0.008, 0.0008], [x, r + 0.019, z])
  }
  b.cyl('metal', K.brass, 0.007, 0.009, 0.022, [0.025, r + 0.004, 0.04], [0, 0, -0.5], 10)
  b.cyl('metal', K.brass, 0.005, 0.005, 0.01, [0.034, r + 0.018, 0.04], [0, 0, -0.5], 10)
  // Outlet pipe toward the group (copper elbow).
  tube(b, 'metal', K.copper, [[0, -r + 0.004, L / 2 - 0.02], [0, -r - 0.02, L / 2 + 0.005], [0, -r - 0.024, L / 2 + 0.03]], 0.004, { seg: 24 })
  for (const s of [-1, 1]) b.box('metal', INOX_D, [0.006, 0.05, 0.02], [s * (r + 0.003), -0.03, 0])
}

function pump(b: GeoBuilder) {
  // Vibration pump lying along z: black coil body, steel tube, brass outlet, inlet nipple, spade terminals.
  b.box('gloss', '#151517', [0.042, 0.042, 0.05], [0, 0, 0], 0, 0.006)
  for (const s of [-1, 1]) b.box('gloss', '#1d1e21', [0.044, 0.044, 0.004], [0, 0, s * 0.025], 0, 0.004)
  b.box('satin', '#e8e5dc', [0.002, 0.024, 0.03], [0.0215, 0, 0])
  for (let i = 0; i < 4; i++) b.box('matte', '#55585c', [0.0004, 0.0015, 0.02 - (i % 2) * 0.006], [0.0225, 0.007 - i * 0.004, 0])
  b.cyl('metal', K.steel, 0.009, 0.009, 0.05, [0, 0, -0.05], [Math.PI / 2, 0, 0], 16)
  b.cyl('metal', K.steel, 0.012, 0.012, 0.006, [0, 0, -0.072], [Math.PI / 2, 0, 0], 16)
  b.cyl('satin', '#e9e5da', 0.007, 0.007, 0.012, [0, 0, -0.081], [Math.PI / 2, 0, 0], 12)
  b.cyl('satin', '#e9e5da', 0.0035, 0.0035, 0.012, [0, 0, -0.092], [Math.PI / 2, 0, 0], 10)
  lathe(b, 'metal', K.brass, [[0, 0], [0.008, 0], [0.008, 0.012], [0.0065, 0.014], [0.0065, 0.022], [0.004, 0.024], [0, 0.024]], [0, 0, 0.026], [Math.PI / 2, 0, 0], 6)
  b.cyl('metal', K.brass, 0.0042, 0.0042, 0.012, [0, 0, 0.056], [Math.PI / 2, 0, 0], 10)
  for (const y of [-0.008, 0.008]) b.box('metal', K.steel, [0.0008, 0.006, 0.006], [-0.022, y, 0.012])
  // Rubber mounts + silicone inlet hose, PTFE outlet line.
  for (const s of [-1, 1]) b.cyl('matte', K.rubber, 0.01, 0.01, 0.008, [0, -0.024, s * 0.016], 0, 12)
  tube(b, 'gloss', '#eef1f2', [[0, 0, -0.097], [0, -0.01, -0.115], [-0.02, -0.012, -0.13]], 0.004, { radial: 8 })
  tube(b, 'gloss', '#f2f2ee', [[0, 0, 0.061], [0, 0.012, 0.075], [-0.012, 0.03, 0.08]], 0.0025, { radial: 7 })
}

function groupHead(b: GeoBuilder) {
  // E61-style chrome group: bell body, mushroom cap, lever, neck into the fascia. Pivot = bottom of bayonet ring.
  // Open bottom (radius 0.04) so the gasket stack can drop out once the portafilter is off.
  lathe(b, 'metal', CHROME, [[0.04, 0], [0.043, 0], [0.044, 0.012], [0.038, 0.016], [0.034, 0.04], [0.03, 0.07], [0.028, 0.078], [0, 0.078]], [0, 0, 0], 0, 32)
  lathe(b, 'metal', CHROME, [[0, 0.078], [0.022, 0.078], [0.026, 0.086], [0.024, 0.094], [0.012, 0.1], [0, 0.101]], [0, 0, 0], 0, 28)
  b.cyl('metal', CHROME, 0.022, 0.026, 0.05, [0, 0.05, -0.04], [Math.PI / 2, 0, 0], 22)
  // Lever with a black ball on the right.
  b.cyl('metal', CHROME, 0.006, 0.006, 0.012, [0.032, 0.05, 0], [0, 0, Math.PI / 2], 10)
  tube(b, 'metal', CHROME, [[0.036, 0.05, 0], [0.05, 0.065, 0.004], [0.062, 0.1, 0.008]], 0.0035, { seg: 16 })
  sphere(b, 'gloss', '#151515', 0.011, [0.064, 0.106, 0.008], 1, 16, 12)
  // Underside: dark cavity + bayonet lugs.
  b.cyl('matte', '#1a1a1b', 0.034, 0.034, 0.002, [0, 0.036, 0], 0, 28)
  for (const a of [0, Math.PI]) b.box('metal', CHROME, [0.008, 0.004, 0.006], [Math.cos(a) * 0.042, 0.002, Math.sin(a) * 0.042], -a)
}

function portafilter(b: GeoBuilder) {
  // Basket holder (chrome), ears, double spout, black handle toward +z. Rim at y = 0.
  lathe(b, 'metal', CHROME, [[0, -0.03], [0.026, -0.03], [0.034, -0.022], [0.036, -0.006], [0.038, 0], [0.034, 0], [0.032, -0.004], [0.0, -0.004]], [0, 0, 0], 0, 32)
  b.cyl('metal', '#bfc4c8', 0.031, 0.031, 0.0006, [0, -0.0035, 0], 0, 28)
  for (const a of [Math.PI / 2, -Math.PI / 2]) b.box('metal', CHROME, [0.014, 0.005, 0.008], [Math.cos(a) * 0.04, -0.0035, Math.sin(a) * 0.04], -a + Math.PI / 2)
  b.cyl('metal', CHROME, 0.008, 0.012, 0.012, [0, -0.036, 0], 0, 14)
  for (const s of [-1, 1]) b.cyl('metal', CHROME, 0.0035, 0.004, 0.016, [s * 0.009, -0.046, 0], [0, 0, s * 0.5], 10)
  b.cyl('metal', CHROME, 0.008, 0.01, 0.03, [0, -0.012, 0.045], [Math.PI / 2 - 0.12, 0, 0], 14)
  b.cyl('gloss', '#151515', 0.0115, 0.014, 0.095, [0, -0.02, 0.105], [Math.PI / 2 - 0.12, 0, 0], 18)
  b.cyl('gloss', '#151515', 0.014, 0.0125, 0.006, [0, -0.027, 0.154], [Math.PI / 2 - 0.12, 0, 0], 18)
}

function gaskets(b: GeoBuilder) {
  // Group gasket, shower screen, two O-rings, spaced like a parts diagram. Pivot = top ring.
  b.torus('satin', '#121213', 0.024, 0.003, [0, 0, 0], [Math.PI / 2, 0, 0], 32)
  b.cyl('metal', '#d6d9dc', 0.023, 0.023, 0.0012, [0, -0.01, 0], 0, 32)
  const r = rng(4)
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * 0.02
    b.cyl('matte', '#55585c', 0.0007, 0.0007, 0.0014, [Math.cos(a) * d, -0.0098, Math.sin(a) * d], 0, 6)
  }
  b.cyl('metal', '#a9aeb3', 0.003, 0.003, 0.002, [0, -0.0085, 0], 0, 10)
  b.torus('satin', '#121213', 0.02, 0.0022, [0, -0.019, 0], [Math.PI / 2, 0, 0], 28)
  b.torus('satin', '#121213', 0.012, 0.0018, [0, -0.026, 0], [Math.PI / 2, 0, 0], 24)
}

function controlBoard(b: GeoBuilder) {
  // Small PCB in XZ (components +y): two relays, triac, transformer-less PSU, terminal blocks.
  const t = pcb(b, { w: 0.08, d: 0.055, t: 0.0016, color: K.pcbGreen, seed: 12, traces: 80, keepOut: [[-0.01, -0.005, 0.045, 0.024]] })
  for (const x of [-0.022, 0.002]) {
    b.box('gloss', '#1f54c4', [0.019, 0.015, 0.016], [x, t + 0.0075, -0.005], 0, 0.0012)
    b.box('matte', '#eef0f2', [0.012, 0.0002, 0.008], [x, t + 0.0151, -0.005])
  }
  b.box('gloss', '#18191b', [0.01, 0.012, 0.004], [0.022, t + 0.006, -0.012])
  b.box('metal', '#b7bcc1', [0.01, 0.002, 0.012], [0.022, t + 0.012, -0.012])
  for (let i = 0; i < 3; i++) {
    b.box('gloss', '#1d7a3c', [0.016, 0.01, 0.009], [-0.024 + i * 0.019, t + 0.005, 0.021], 0, 0.0008)
    for (const s of [-1, 1]) b.cyl('metal', K.steel, 0.0018, 0.0018, 0.001, [-0.024 + i * 0.019 + s * 0.004, t + 0.0102, 0.021], 0, 8)
  }
  elcap(b, 0.004, 0.012, [0.03, t, 0.006], '#1e1e20', '#cdd5e6')
  b.box('gloss', '#e6c02c', [0.006, 0.01, 0.012], [0.03, t + 0.005, -0.016], 0, 0.001)
  chip(b, 0.008, 0.006, 0.0015, [0.012, t, 0.006], { pins: 4, pinSides: 2 })
  jst(b, 4, [-0.03, t, -0.022], Math.PI, '#f0ead9', ['#c3262b', '#141414', '#1d4fbf', '#e6c02c'], 0.018)
  smd(b, 5, -0.035, 0.035, -0.024, 0.024, t, 24, [[-0.01, -0.005, 0.045, 0.024]])
  b.box('glow', '#36e07a', [0.002, 0.0012, 0.002], [0.034, t + 0.0006, 0.02])
}

function grinder(b: GeoBuilder) {
  // Compact burr grinder: black body with stainless wrap, grounds bin, dial ring. Hopper + burr are children.
  b.box('satin', '#1a1b1d', [0.11, 0.18, 0.15], [0, 0.09, 0], 0, 0.012)
  b.box('metal', INOX, [0.114, 0.12, 0.1], [0, 0.11, -0.03], 0, 0.01)
  b.box('matte', '#0c0c0d', [0.07, 0.07, 0.02], [0, 0.065, 0.068], 0, 0.006)
  b.box('frosted', '#e6e9eb', [0.064, 0.05, 0.05], [0, 0.03, 0.065], 0, 0.006)
  sphere(b, 'satin', '#4a3020', 0.024, [0, 0.022, 0.065], [1.2, 0.5, 0.9], 10, 6)
  b.cyl('metal', K.steel, 0.008, 0.006, 0.014, [0, 0.085, 0.068], 0, 12)
  b.cyl('satin', '#141414', 0.006, 0.006, 0.006, [0.04, 0.15, 0.076], [Math.PI / 2, 0, 0], 12)
  b.cyl('glow', '#ffffff', 0.0018, 0.0018, 0.002, [0.04, 0.166, 0.076], [Math.PI / 2, 0, 0], 8)
  // Grind-adjust collar on top.
  b.cyl('metal', '#2a2c2f', 0.046, 0.046, 0.016, [0, 0.188, 0], 0, 32)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    b.box('metal', '#4a4e53', [0.003, 0.014, 0.003], [Math.cos(a) * 0.046, 0.188, Math.sin(a) * 0.046], -a)
  }
  b.box('gloss', '#d9a93f', [0.004, 0.006, 0.002], [0, 0.188, 0.047])
  for (const x of [-0.04, 0.04]) for (const z of [-0.06, 0.06]) b.cyl('matte', K.rubber, 0.007, 0.007, 0.004, [x, -0.002, z], 0, 10)
}

function burr(b: GeoBuilder) {
  // Conical steel burr on its spindle.
  lathe(b, 'metal', '#c3c8cd', [[0, 0], [0.022, 0], [0.024, 0.004], [0.016, 0.024], [0.006, 0.034], [0, 0.036]], [0, 0, 0], 0, 20)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    b.box('metal', '#8f9499', [0.002, 0.028, 0.003], [Math.cos(a) * 0.016, 0.015, Math.sin(a) * 0.016], [0, -a, 0.42])
  }
  b.cyl('metal', '#7d8287', 0.004, 0.004, 0.02, [0, -0.008, 0], 0, 10)
}

function hopper(b: GeoBuilder) {
  // Frosted bean hopper with beans and a black lid.
  lathe(b, 'frosted', '#e9edf0', [[0.035, 0], [0.04, 0.004], [0.058, 0.09], [0.06, 0.1], [0.056, 0.1], [0.054, 0.092], [0.034, 0.008], [0.03, 0.006]], [0, 0, 0], 0, 32)
  const r = rng(11)
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2
    const yy = 0.01 + r() * 0.05
    const rad = (0.03 + yy * 0.25) * Math.sqrt(r())
    sphere(b, 'satin', r() > 0.5 ? '#4a2c1a' : '#5c3820', 0.0055, [Math.cos(a) * rad, yy, Math.sin(a) * rad], [1, 0.65, 0.75], 6, 4)
  }
  lathe(b, 'satin', '#141414', [[0, 0.11], [0.062, 0.104], [0.062, 0.1], [0.055, 0.1], [0.055, 0.104], [0.02, 0.112], [0.015, 0.118], [0, 0.119]], [0, 0, 0], 0, 32)
}

export const COFFEE_MACHINE: ModelSpec = {
  id: 'coffee',
  // The espresso machine is the coffee desk's standing prop (assembled) when no other device is on show there.
  span: 0.35,
  parts: [
    { id: '_frame', rank: 7, build: frame },
    { id: 'housing', rank: 0, build: housing, xpos: [0, 0.25, -0.17] },
    { id: 'tank', rank: 1, build: tank, pos: [-0.055, BASE + 0.012, -0.075], xpos: [-0.07, BASE + 0.06, -0.28] },
    { id: 'boiler', rank: 2, build: boiler, pos: [0, 0.27, -0.01], xpos: [-0.01, 0.34, -0.03] },
    { id: 'pump', rank: 2, build: pump, pos: [0.06, BASE + 0.035, -0.035], xpos: [0.22, BASE + 0.035, -0.01], xrot: [0, 0.6, 0] },
    { id: 'controlBoard', rank: 3, build: controlBoard, pos: [W / 2 - 0.012, 0.18, -0.03], rot: [0, 0, Math.PI / 2], xpos: [0.215, 0.2, 0.02], xrot: [Math.PI / 2, 0, -0.5] },
    // Portafilter off first, then the gasket stack drops out of the group, then the group comes off.
    { id: 'groupHead', rank: 4, build: groupHead, pos: [GROUP.x, GROUP.y, GROUP.z], xpos: [GROUP.x, GROUP.y + 0.02, GROUP.z + 0.09] },
    { id: '_portafilter', rank: 2, parent: 'groupHead', build: portafilter, via: [[0, -0.035, 0.02]], xpos: [0, -0.06, 0.13] },
    { id: 'gaskets', rank: 3, build: gaskets, pos: [GROUP.x, GROUP.y + 0.026, GROUP.z], via: [[GROUP.x, GROUP.y - 0.012, GROUP.z]], xpos: [GROUP.x, GROUP.y - 0.025, GROUP.z + 0.1] },
    { id: 'grinder', rank: 1, build: grinder, pos: [GRINDER.x, 0, GRINDER.z], xpos: [GRINDER.x - 0.05, 0, GRINDER.z] },
    { id: '_burr', rank: 2, parent: 'grinder', build: burr, pos: [0, 0.178, 0], xpos: [0, 0.27, 0] },
    { id: '_hopper', rank: 1, parent: 'grinder', build: hopper, pos: [0, 0.196, 0], xpos: [0, 0.34, 0] },
  ],
}
