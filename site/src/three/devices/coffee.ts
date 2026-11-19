import type { GeoBuilder } from '../builder'
import { COFFEE } from '../Coffee'
import { C, rng } from '../materials'
import { chip, elcap, jst, K, knob, lathe, pcb, screw, slots, sphere, tube } from './kit'
import type { ModelSpec } from './types'

/**
 * Bean-to-cup espresso machine with a built-in grinder (brushed stainless), front at +z.
 * x: -0.165..0.165, z: -0.155..0.155 (+ drip tray), y: 0..0.4 (+ hopper).
 * Explodes: hopper + burr grinder up, cover up and back, tank and pump out the left,
 * control board out the right, copper boiler up, group head + portafilter forward with the gaskets.
 */
const W = 0.33
const D = 0.31
const H = 0.4
const SS = '#c6cacd'
const SS2 = '#b5babe'
const GH = { x: 0.03, y: 0.235, z: D / 2 + 0.032 } as const

function frame(b: GeoBuilder) {
  // Base, back panel, inner chassis rails.
  b.box('metal', SS2, [W, 0.014, D], [0, 0.007, 0], 0, 0.003)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('matte', '#151516', 0.012, 0.013, 0.008, [sx * 0.13, -0.004, sz * 0.12], 0, 12)
  b.box('metal', SS2, [W, H, 0.004], [0, H / 2, -D / 2 + 0.002])
  b.box('metal', '#9da2a6', [0.012, H - 0.02, 0.012], [-W / 2 + 0.01, H / 2, -D / 2 + 0.012])
  b.box('metal', '#9da2a6', [0.012, H - 0.02, 0.012], [W / 2 - 0.01, H / 2, -D / 2 + 0.012])
  // Front fascia with a recessed brew bay.
  const fz = D / 2 - 0.004
  b.box('metal', SS, [W, 0.17, 0.008], [0, H - 0.085, fz], 0, 0.002)
  b.box('metal', SS, [W, 0.06, 0.008], [0, 0.044, fz], 0, 0.002)
  for (const sx of [-1, 1]) b.box('metal', SS, [0.05, 0.13, 0.008], [sx * (W / 2 - 0.025), 0.14, fz])
  b.box('metal', '#8f9498', [W - 0.1, 0.13, 0.004], [0, 0.14, fz - 0.03])
  // Pressure gauge: chrome bezel, white dial, ticks, red needle, glass.
  b.group([-0.03, H - 0.075, fz + 0.005], 0, () => {
    b.torus('metal', K.chrome, 0.031, 0.0045, [0, 0, 0.002], 0, 32)
    b.cyl('satin', '#f4f2ec', 0.029, 0.029, 0.002, [0, 0, 0], [Math.PI / 2, 0, 0], 32)
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * 1.25 - (i / 16) * Math.PI * 1.5
      b.box('matte', i > 11 ? '#c8262b' : '#2b2b2b', [0.0007, i % 4 ? 0.003 : 0.005, 0.0004], [Math.cos(a) * 0.023, Math.sin(a) * 0.023, 0.0013], [0, 0, a - Math.PI / 2])
    }
    b.box('satin', '#5aa04a', [0.012, 0.004, 0.0004], [0.006, 0.02, 0.0013], [0, 0, -0.3])
    b.box('gloss', '#c8262b', [0.0012, 0.022, 0.0005], [0.004, 0.006, 0.0018], [0, 0, -0.55])
    b.cyl('metal', K.chrome, 0.003, 0.003, 0.002, [0, 0, 0.002], [Math.PI / 2, 0, 0], 12)
    b.cyl('glass', '#e8f2ff', 0.029, 0.029, 0.001, [0, 0, 0.004], [Math.PI / 2, 0, 0], 32)
  })
  // Buttons with LED rings, grind-size dial, steam knob.
  for (let i = 0; i < 4; i++) {
    const x = 0.04 + i * 0.03
    b.cyl('metal', K.chrome, 0.0085, 0.0085, 0.006, [x, H - 0.075, fz + 0.006], [Math.PI / 2, 0, 0], 20)
    b.torus('glow', i === 0 ? '#ffffff' : '#ffb347', 0.0092, 0.0008, [x, H - 0.075, fz + 0.0065], 0, 20)
  }
  knob(b, 0.017, 0.016, [-0.12, H - 0.075, fz + 0.004], { color: K.chrome })
  knob(b, 0.015, 0.02, [W / 2 + 0.002, 0.27, 0.06], { color: '#1a1a1b', rot: [0, Math.PI / 2, 0] })
  // Steam wand on a ball joint, grinder chute + portafilter cradle on the left of the bay.
  b.group([0.125, 0.27, fz + 0.01], 0, () => {
    sphere(b, 'metal', K.chrome, 0.009, [0, 0, 0])
    tube(b, 'metal', K.chrome, [[0, 0, 0], [0.01, -0.03, 0.03], [0.02, -0.11, 0.045], [0.022, -0.16, 0.048]], 0.0045, { radial: 10 })
    b.cyl('satin', '#1a1a1b', 0.008, 0.008, 0.05, [0.006, -0.012, 0.016], [0.7, 0, 0.15], 12)
    b.cyl('metal', K.chrome, 0.0055, 0.004, 0.012, [0.022, -0.167, 0.048], 0, 10)
  })
  b.box('satin', '#151516', [0.04, 0.02, 0.03], [-0.1, 0.19, fz + 0.012], 0, 0.004)
  b.box('metal', '#9da2a6', [0.006, 0.05, 0.02], [-0.1, 0.13, fz + 0.012])
  // Drip tray with grate and red float.
  b.box('metal', SS2, [0.27, 0.034, 0.12], [0, 0.031, D / 2 + 0.05], 0, 0.004)
  b.box('metal', K.chrome, [0.25, 0.003, 0.1], [0, 0.0495, D / 2 + 0.05], 0, 0.001)
  slots(b, 0, D / 2 + 0.05, 0.0512, 18, 4, 0.0075, 0.016, 0.0125, 0.022, '#3b3f43')
  b.box('gloss', C.red, [0.012, 0.01, 0.004], [0.1, 0.05, D / 2 + 0.112])
  // Inside (visible once the cover is off): silicone hoses, solenoid valve, wiring loom, earth straps.
  tube(b, 'frosted', '#eef1ee', [[-0.09, 0.12, -0.1], [-0.11, 0.1, -0.02], [-0.09, 0.075, 0.03]], 0.0045, { radial: 8 })
  tube(b, 'frosted', '#eef1ee', [[-0.05, 0.08, 0.02], [0.0, 0.12, 0.03], [0.03, 0.2, 0.0]], 0.004, { radial: 8 })
  b.group([0.06, 0.12, 0.06], 0, () => {
    b.cyl('gloss', '#141415', 0.014, 0.014, 0.028, [0, 0.016, 0], 0, 16)
    b.box('metal', K.brass, [0.03, 0.012, 0.018], [0, -0.004, 0])
    for (const s of [-1, 1]) b.box('metal', K.solder, [0.002, 0.008, 0.005], [s * 0.005, 0.034, 0])
  })
  const wires = ['#c8262b', '#1f54c4', '#e6c02c', '#3a8a3a', '#141414']
  wires.forEach((c, i) => tube(b, 'gloss', c, [[0.12, 0.05 + i * 0.004, -0.12], [0.08, 0.06 + i * 0.004, -0.13], [0.0, 0.07 + i * 0.003, -0.13], [-0.08, 0.06, -0.13]], 0.0016, { radial: 5 }))
}

function housing(b: GeoBuilder) {
  b.box('metal', SS, [W + 0.006, 0.004, D + 0.002], [0, H + 0.002, 0], 0, 0.0015)
  for (const sx of [-1, 1]) {
    b.box('metal', SS, [0.004, H - 0.02, D + 0.002], [sx * (W / 2 + 0.002), H / 2 + 0.01, 0], 0, 0.0012)
    slots(b, sx * (W / 2 + 0.0045), -0.09, 0.11, 1, 8, 0.0004, 0.004, 0, 0.009)
  }
  // Cup-warmer rail on top + hopper collar opening.
  for (let i = 0; i < 7; i++) b.box('metal', K.chrome, [0.14, 0.003, 0.004], [0.07, H + 0.0055, -0.06 + i * 0.022])
  b.torus('satin', '#1a1a1b', 0.055, 0.004, [-0.08, H + 0.005, -0.05], [Math.PI / 2, 0, 0], 28)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) screw(b, [sx * (W / 2 + 0.0045), 0.04 + (sz + 1) * 0.15, sz * 0.12], 0.0026, [0, 0, sx * Math.PI / 2])
}

function grinder(b: GeoBuilder) {
  // Smoked hopper with beans, black lid; burr carrier + motor below.
  lathe(b, 'glass', '#6e5a44', [[0.045, 0], [0.05, 0.01], [0.075, 0.12], [0.077, 0.125]], [0, H + 0.006, 0], 0, 36)
  lathe(b, 'satin', '#18191a', [[0.079, 0], [0.08, 0.006], [0.07, 0.016], [0.02, 0.022], [0.012, 0.03], [0, 0.03]], [0, H + 0.13, 0], 0, 36)
  const r = rng(5)
  for (let i = 0; i < 90; i++) {
    const h = r() * 0.075
    const rad = (0.04 + h * 0.3) * Math.sqrt(r())
    const a = r() * Math.PI * 2
    sphere(b, 'satin', ['#4a2b16', '#5a3519', '#3c2311'][i % 3], 0.0055, [Math.cos(a) * rad, H + 0.012 + h, Math.sin(a) * rad], [1, 0.62, 0.78], 7, 5)
  }
  b.cyl('satin', '#151516', 0.05, 0.05, 0.012, [0, H - 0.004, 0], 0, 28)
  b.group([0, H - 0.04, 0], 0, () => {
    lathe(b, 'metal', '#c2c6ca', [[0.028, 0], [0.034, 0.008], [0.034, 0.024], [0.02, 0.03], [0, 0.03]], [0, 0, 0], 0, 24)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      b.box('metal', '#9aa0a5', [0.002, 0.02, 0.012], [Math.cos(a) * 0.02, 0.016, Math.sin(a) * 0.02], -a + 0.4)
    }
  })
  b.cyl('gloss', '#1b1c1e', 0.03, 0.03, 0.07, [0, H - 0.08, 0], 0, 20)
  b.cyl('metal', K.copper, 0.026, 0.026, 0.04, [0, H - 0.075, 0], 0, 20)
  for (let i = 0; i < 5; i++) b.box('metal', '#8f949a', [0.065, 0.002, 0.012], [0, H - 0.115 + i * 0.002, 0], i * 0.6)
}

function tank(b: GeoBuilder) {
  b.box('glass', '#bcd8ea', [0.2, 0.27, 0.075], [0, 0.135, 0], 0, 0.006)
  b.box('frosted', '#cfe7f5', [0.19, 0.18, 0.066], [0, 0.092, 0], 0, 0.004)
  b.box('satin', '#1a1a1b', [0.205, 0.012, 0.08], [0, 0.272, 0], 0, 0.004)
  b.box('satin', '#1a1a1b', [0.06, 0.012, 0.02], [0, 0.29, 0.0], 0, 0.004)
  b.cyl('satin', '#ffffff', 0.016, 0.016, 0.07, [0.05, 0.06, 0], 0, 16)
  b.cyl('satin', '#151516', 0.017, 0.017, 0.012, [0.05, 0.1, 0], 0, 16)
  for (let i = 0; i < 6; i++) b.box('matte', '#2b2e31', [0.012, 0.0008, 0.0006], [-0.085, 0.04 + i * 0.03, 0.038])
  b.cyl('metal', K.chrome, 0.009, 0.009, 0.012, [-0.06, -0.004, 0], 0, 12)
}

function boiler(b: GeoBuilder) {
  // Horizontal copper boiler with domed ends, brass fittings, element terminals, thermostats.
  lathe(b, 'metal', K.copper, [[0, -0.07], [0.02, -0.068], [0.034, -0.062], [0.042, -0.05], [0.044, -0.04], [0.044, 0.04], [0.042, 0.05], [0.034, 0.062], [0.02, 0.068], [0, 0.07]], [0, 0, 0], [0, 0, Math.PI / 2], 28)
  for (const s of [-1, 1]) b.torus('metal', '#a8652f', 0.0445, 0.002, [s * 0.045, 0, 0], [0, Math.PI / 2, 0], 28)
  for (const [x, z] of [[-0.03, 0], [0.0, 0], [0.03, 0]] as const) {
    b.cyl('metal', K.brass, 0.008, 0.008, 0.012, [x, 0.047, z], 0, 6)
    b.cyl('metal', K.brass, 0.005, 0.005, 0.02, [x, 0.058, z], 0, 12)
  }
  b.cyl('metal', K.brass, 0.014, 0.014, 0.01, [0.072, 0, 0], [0, 0, Math.PI / 2], 6)
  for (const s of [-1, 1]) {
    b.box('metal', K.solder, [0.012, 0.003, 0.006], [0.081, s * 0.007, 0])
    tube(b, 'gloss', s > 0 ? '#c8262b' : '#141414', [[0.086, s * 0.007, 0], [0.1, s * 0.012, 0.01], [0.11, s * 0.02, 0.03]], 0.0016, { radial: 5 })
  }
  for (const z of [-0.025, 0.025]) {
    b.cyl('metal', '#d0d3d6', 0.009, 0.009, 0.006, [-0.02, 0.0, 0.044 + 0.003], [Math.PI / 2, 0, 0], 16)
    b.box('metal', K.solder, [0.003, 0.002, 0.006], [-0.02 + z * 0.2, 0.0, 0.052])
  }
  // Pipe to the group head.
  tube(b, 'metal', K.copper, [[0.0, -0.035, 0.03], [0.0, -0.05, 0.08], [0.0, -0.035, 0.12]], 0.0035, { radial: 8 })
}

function pump(b: GeoBuilder) {
  b.group([0, 0, 0], [0, 0, Math.PI / 2], () => {
    b.cyl('gloss', '#151516', 0.021, 0.021, 0.055, [0, 0, 0], 0, 20)
    b.cyl('satin', '#e6e6e0', 0.016, 0.016, 0.02, [0, 0.037, 0], 0, 18)
    b.cyl('satin', '#e6e6e0', 0.012, 0.012, 0.014, [0, -0.034, 0], 0, 18)
    b.cyl('metal', K.brass, 0.006, 0.006, 0.014, [0, 0.052, 0], 0, 6)
    b.cyl('metal', K.brass, 0.005, 0.005, 0.01, [0, -0.045, 0], 0, 12)
    for (const s of [-1, 1]) b.box('metal', K.solder, [0.004, 0.006, 0.002], [s * 0.006, 0.0, 0.022])
    b.box('satin', '#d8d8d8', [0.03, 0.04, 0.0005], [0, 0.0, 0.0212])
  })
  for (const s of [-1, 1]) b.cyl('matte', '#0f0f10', 0.012, 0.012, 0.012, [s * 0.025, -0.022, 0], 0, 12)
}

function groupHead(b: GeoBuilder) {
  // Chrome group head collar + portafilter locked in, black handle toward the user, twin spouts.
  lathe(b, 'metal', K.chrome, [[0.0, 0.04], [0.036, 0.04], [0.04, 0.03], [0.04, 0.012], [0.035, 0.0], [0.0, 0.0]], [0, 0, 0], 0, 32)
  for (const a of [0.4, 2.5, 4.6]) b.box('metal', K.chrome, [0.012, 0.006, 0.008], [Math.cos(a) * 0.04, 0.004, Math.sin(a) * 0.04], -a)
  lathe(b, 'metal', '#d8dbde', [[0.0, -0.032], [0.026, -0.03], [0.037, -0.012], [0.038, -0.002], [0.0, -0.002]], [0, 0, 0], 0, 32)
  b.cyl('metal', '#d8dbde', 0.009, 0.009, 0.03, [0.0, -0.016, 0.04], [Math.PI / 2 - 0.15, 0, 0], 14)
  b.cyl('gloss', '#151516', 0.012, 0.015, 0.11, [0.0, -0.025, 0.105], [Math.PI / 2 - 0.15, 0, 0], 16)
  b.cyl('metal', K.chrome, 0.012, 0.012, 0.006, [0.0, -0.033, 0.162], [Math.PI / 2 - 0.15, 0, 0], 16)
  for (const s of [-1, 1]) b.cyl('metal', '#d8dbde', 0.004, 0.003, 0.014, [s * 0.006, -0.04, 0.0], 0, 10)
}

function gaskets(b: GeoBuilder) {
  // Group gasket (black rubber), shower screen (perforated), red silicone o-ring.
  b.torus('satin', '#121213', 0.032, 0.0035, [0, 0.012, 0], [Math.PI / 2, 0, 0], 32)
  b.cyl('metal', '#d6d9dc', 0.029, 0.029, 0.0015, [0, 0.0, 0], 0, 32)
  for (let i = 0; i < 4; i++)
    for (let k = 0; k < 6 + i * 6; k++) {
      const a = (k / (6 + i * 6)) * Math.PI * 2
      const rr = 0.004 + i * 0.006
      b.cyl('matte', '#55595d', 0.0009, 0.0009, 0.0017, [Math.cos(a) * rr, 0.0, Math.sin(a) * rr], 0, 6)
    }
  b.torus('gloss', '#c8262b', 0.022, 0.0022, [0, -0.012, 0], [Math.PI / 2, 0, 0], 28)
}

function controlBoard(b: GeoBuilder) {
  // Mounted on the right inner wall, component side facing -x.
  b.group([0, 0, 0], [0, 0, Math.PI / 2], () => {
    const t = pcb(b, { w: 0.13, d: 0.09, color: K.pcbGreen, seed: 13, traces: 160 })
    for (let i = 0; i < 3; i++) b.box('gloss', '#1f54c4', [0.02, 0.016, 0.015], [-0.04 + i * 0.025, t + 0.008, -0.025], 0, 0.0015)
    b.box('metal', '#9aa0a5', [0.022, 0.018, 0.004], [0.04, t + 0.009, -0.03])
    chip(b, 0.01, 0.003, 0.012, [0.04, t, -0.025], { dot: false })
    elcap(b, 0.007, 0.018, [0.045, t, 0.012])
    elcap(b, 0.004, 0.01, [0.03, t, 0.025])
    b.box('satin', '#e6c02c', [0.022, 0.018, 0.018], [0.0, t + 0.009, 0.015], 0, 0.002)
    b.box('satin', '#2b2d30', [0.024, 0.002, 0.02], [0.0, t + 0.001, 0.015])
    chip(b, 0.012, 0.012, 0.0012, [-0.035, t, 0.02], { pins: 8 })
    for (let i = 0; i < 3; i++) b.box('satin', '#2a7d3a', [0.012, 0.01, 0.01], [-0.05 + i * 0.013, t + 0.005, 0.04])
    jst(b, 6, [-0.01, t, 0.04], 0, '#efe9d8', ['#c8262b', '#141414', '#1f54c4', '#e6c02c', '#3a8a3a', '#ffffff'], 0.03)
  })
}

export const COFFEE_MACHINE: ModelSpec = {
  id: 'coffee',
  idle: true,
  place: { pos: [COFFEE.x - 0.02, COFFEE.top, COFFEE.z + 0.05], yaw: Math.PI / 2 },
  view: { az: -30, el: 20 },
  parts: [
    { id: '_frame', rank: 6, build: frame },
    { id: 'housing', rank: 1, build: housing, xpos: [0, 0.34, -0.3] },
    { id: 'grinder', rank: 0, build: grinder, pos: [-0.08, 0, -0.05], xpos: [-0.1, 0.5, -0.02] },
    { id: 'tank', rank: 2, build: tank, pos: [0.0, 0.016, -D / 2 + 0.045], xpos: [-0.38, 0.11, -0.04] },
    { id: 'boiler', rank: 3, build: boiler, pos: [0.04, 0.29, -0.01], xpos: [0.12, 0.6, 0.02] },
    { id: 'pump', rank: 4, build: pump, pos: [-0.095, 0.05, -0.035], xpos: [-0.34, 0.0, 0.14] },
    { id: 'controlBoard', rank: 3, build: controlBoard, pos: [W / 2 - 0.022, 0.21, 0.02], xpos: [W / 2 + 0.24, 0.22, 0.03] },
    { id: 'groupHead', rank: 2, build: groupHead, pos: [GH.x, GH.y, GH.z], xpos: [GH.x + 0.04, GH.y - 0.02, GH.z + 0.24] },
    { id: 'gaskets', rank: 4, build: gaskets, pos: [GH.x, GH.y + 0.012, GH.z], xpos: [GH.x + 0.03, GH.y - 0.1, GH.z + 0.12], xrot: [0.65, 0, 0] },
  ],
}
