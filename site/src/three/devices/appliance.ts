import type { GeoBuilder } from '../builder'
import { COFFEE } from '../Coffee'
import { chip, elcap, K, knob, lathe, pcb, screw, slots, tube } from './kit'
import type { ModelSpec } from './types'

/**
 * Countertop blender (small appliances), front at +z.
 * Base 170 x 190 mm, 160 mm tall; 1.5 l jar on top.
 * Explodes in a vertical stack: jar up top, the base shell lifts off the universal motor,
 * carbon brushes slide out sideways, dial switch forward, triac board out the side, cord stays.
 */
const BODY = '#1d1e21'
const SS = '#c4c8cc'
const HB = 0.16

function base(b: GeoBuilder) {
  lathe(b, 'satin', '#151618', [[0, 0.0], [0.118, 0.0], [0.12, 0.006], [0.118, 0.012], [0, 0.012]], [0, 0, 0], Math.PI / 4, 4)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('matte', '#0c0c0d', 0.011, 0.012, 0.008, [sx * 0.058, -0.003, sz * 0.058], 0, 12)
  slots(b, 0, -0.02, 0.0125, 10, 3, 0.004, 0.012, 0.008, 0.016, '#050506')
  // Motor mount bosses.
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) b.cyl('satin', '#26282b', 0.006, 0.006, 0.02, [Math.cos(a) * 0.045, 0.02, Math.sin(a) * 0.045], 0, 10)
}

function housing(b: GeoBuilder) {
  // Tapered square shell (open at the bottom) with a brushed band and a sloped control panel.
  lathe(b, 'gloss', BODY, [[0.122, 0.0], [0.121, 0.01], [0.11, HB - 0.02], [0.104, HB - 0.006], [0.098, HB]], [0, 0, 0], Math.PI / 4, 4)
  lathe(b, 'gloss', BODY, [[0.098, HB], [0.0, HB]], [0, 0, 0], Math.PI / 4, 4)
  lathe(b, 'metal', SS, [[0.112, HB - 0.03], [0.108, HB - 0.012]], [0, 0.0005, 0], Math.PI / 4, 4, [1.012, 1, 1.012])
  // Jar seat: rubber pad + drive socket.
  b.box('satin', '#101112', [0.1, 0.006, 0.1], [0, HB + 0.003, 0], 0, 0.008)
  b.cyl('metal', '#9da2a7', 0.016, 0.016, 0.008, [0, HB + 0.007, 0], 0, 8)
  // Control panel (silver) on the front face.
  b.box('metal', SS, [0.11, 0.07, 0.004], [0, 0.07, 0.08], [-0.07, 0, 0], 0.003)
  for (let i = 0; i < 3; i++) {
    b.cyl('gloss', '#141415', 0.006, 0.006, 0.004, [-0.035 + i * 0.035, 0.035, 0.085], [Math.PI / 2 - 0.07, 0, 0], 16)
    b.box('glow', ['#ffffff', '#ffb347', '#ffb347'][i], [0.004, 0.0015, 0.0006], [-0.035 + i * 0.035, 0.046, 0.0835])
  }
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.85 - (i / 6) * Math.PI * 0.7
    b.box('matte', '#2b2d30', [0.0012, 0.004, 0.0006], [Math.cos(a) * 0.028, 0.08 + Math.sin(a) * 0.028, 0.0837])
  }
  // Side vents.
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) b.box('matte', '#060607', [0.0008, 0.004, 0.03], [s * 0.117, 0.03 + i * 0.008, -0.02], [0, 0, -s * 0.07])
}

function jar(b: GeoBuilder) {
  // Octagonal jar, collar, blade assembly, handle, lid with fill cap, graduations.
  b.group([0, HB + 0.006, 0], Math.PI / 8, () => {
    lathe(b, 'satin', '#141517', [[0.0, 0], [0.06, 0], [0.066, 0.006], [0.066, 0.032], [0.058, 0.036], [0, 0.036]], [0, 0, 0], 0, 8)
    lathe(b, 'glass', '#d9e6ee', [[0.052, 0.034], [0.06, 0.06], [0.083, 0.25], [0.086, 0.258]], [0, 0, 0], 0, 8)
    lathe(b, 'satin', '#141517', [[0.0, 0.25], [0.088, 0.25], [0.088, 0.268], [0.03, 0.27], [0.0, 0.272]], [0, 0, 0], 0, 8)
    lathe(b, 'frosted', '#c9d3da', [[0.0, 0.268], [0.026, 0.268], [0.026, 0.282], [0.0, 0.284]], [0, 0, 0], 0, 16)
  })
  // Blades (4, alternately pitched) on the hub nut.
  b.cyl('metal', '#a9aeb3', 0.008, 0.008, 0.012, [0, HB + 0.046, 0], 0, 6)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    b.box('metal', K.chrome, [0.042, 0.0014, 0.009], [Math.cos(a) * 0.022, HB + 0.052 + (i % 2) * 0.005, Math.sin(a) * 0.022], [i % 2 ? 0.45 : -0.35, -a, i % 2 ? 0.25 : -0.2])
  }
  // Handle on the right.
  tube(b, 'gloss', '#141517', [[0.072, HB + 0.07, 0], [0.12, HB + 0.09, 0], [0.13, HB + 0.18, 0], [0.11, HB + 0.24, 0], [0.084, HB + 0.25, 0]], 0.011, { radial: 10, seg: 40 })
  for (let i = 0; i < 6; i++) b.box('matte', '#f4f7f9', [0.014 - (i % 2) * 0.006, 0.0012, 0.0005], [-0.035, HB + 0.09 + i * 0.026, 0.074 + i * 0.0026])
}

function motor(b: GeoBuilder) {
  // Universal motor: laminated stator with copper field coils, wound armature, commutator, cooling fan, coupling.
  for (let i = 0; i < 22; i++) b.box('metal', i % 2 ? '#7d8288' : '#6d7278', [0.084, 0.0018, 0.07], [0, 0.04 + i * 0.002, 0], 0, 0.004)
  for (const s of [-1, 1]) {
    b.box('metal', K.copper, [0.016, 0.05, 0.05], [s * 0.034, 0.061, 0], 0, 0.008)
    b.box('satin', '#e6c25a', [0.017, 0.012, 0.052], [s * 0.034, 0.061, 0])
  }
  b.cyl('metal', K.copper, 0.024, 0.024, 0.05, [0, 0.062, 0], 0, 24)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    b.box('metal', '#5f646a', [0.003, 0.05, 0.004], [Math.cos(a) * 0.024, 0.062, Math.sin(a) * 0.024], -a)
  }
  // Commutator segments above the armature.
  b.cyl('metal', K.copper, 0.012, 0.012, 0.016, [0, 0.1, 0], 0, 24)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    b.box('matte', '#2a1c12', [0.0008, 0.016, 0.002], [Math.cos(a) * 0.012, 0.1, Math.sin(a) * 0.012], -a)
  }
  b.cyl('metal', '#c9cdd1', 0.004, 0.004, 0.17, [0, 0.085, 0], 0, 10)
  // End bells (brackets) and the cooling fan underneath.
  for (const y of [0.032, 0.115]) b.box('satin', '#2a2c30', [0.11, 0.004, 0.022], [0, y, 0], 0, 0.002)
  b.cyl('satin', '#e9e9e4', 0.04, 0.04, 0.004, [0, 0.018, 0], 0, 24)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    b.box('satin', '#e9e9e4', [0.034, 0.012, 0.0015], [Math.cos(a) * 0.022, 0.024, Math.sin(a) * 0.022], -a + 0.5)
  }
  b.cyl('metal', '#a9aeb3', 0.014, 0.014, 0.008, [0, HB + 0.002 - 0.012, 0], 0, 8)
}

function brush(b: GeoBuilder, s: number) {
  // Brass holder, carbon block, spring, braided pigtail. Points toward the commutator.
  b.group([0, 0, 0], [0, 0, s > 0 ? 0 : Math.PI], () => {
    b.box('metal', K.brass, [0.022, 0.012, 0.012], [0.006, 0, 0], 0, 0.001)
    b.box('satin', '#202022', [0.016, 0.0085, 0.0085], [-0.006, 0, 0])
    for (let i = 0; i < 6; i++) b.torus('metal', '#c9cdd1', 0.0032, 0.0006, [0.006 + i * 0.0022, 0, 0], [0, Math.PI / 2, 0], 10)
    tube(b, 'metal', '#b7795a', [[0.012, 0.004, 0], [0.02, 0.012, 0.004], [0.026, 0.008, 0.012]], 0.0012, { radial: 5 })
    b.box('metal', K.solder, [0.006, 0.0006, 0.008], [0.028, 0.008, 0.014])
  })
}

function brushes(b: GeoBuilder) {
  brush(b, 1)
}

function brush2(b: GeoBuilder) {
  brush(b, -1)
}

function switchPart(b: GeoBuilder) {
  // Big chrome speed dial + the rotary switch module behind the panel.
  knob(b, 0.019, 0.016, [0, 0, 0.004], { color: K.chrome, skirt: '#141516', rot: [-0.07, 0, 0] })
  b.box('satin', '#151618', [0.03, 0.026, 0.02], [0, 0, -0.012], 0, 0.002)
  b.cyl('metal', '#c9cdd1', 0.003, 0.003, 0.012, [0, 0, -0.0], [Math.PI / 2, 0, 0], 10)
  for (let i = 0; i < 4; i++) b.box('metal', K.solder, [0.004, 0.0008, 0.008], [-0.009 + i * 0.006, -0.008, -0.026])
}

function controlBoard(b: GeoBuilder) {
  b.group([0, 0, 0], [Math.PI / 2, 0, 0], () => {
    const t = pcb(b, { w: 0.07, d: 0.05, color: '#1f6a47', seed: 61, traces: 70 })
    b.box('metal', '#a8adb2', [0.022, 0.016, 0.003], [-0.018, t + 0.008, -0.012])
    chip(b, 0.01, 0.0045, 0.014, [-0.018, t, -0.008], { dot: false })
    elcap(b, 0.006, 0.014, [0.016, t, 0.008])
    b.box('satin', '#2d6bd4', [0.012, 0.01, 0.008], [0.018, t + 0.005, -0.014], 0, 0.001)
    chip(b, 0.008, 0.008, 0.001, [-0.01, t, 0.012], { pins: 4 })
    for (let i = 0; i < 3; i++) b.box('satin', '#2a7d3a', [0.008, 0.009, 0.009], [-0.022 + i * 0.01, t + 0.0045, 0.019])
  })
  screw(b, [0.03, 0.02, 0.003], 0.0025, [Math.PI / 2, 0, 0])
}

function cable(b: GeoBuilder) {
  // Strain relief out the back, cord curling on the desk, Schuko plug.
  b.cyl('satin', '#141517', 0.007, 0.005, 0.03, [0, 0.012, -0.11], [Math.PI / 2, 0, 0], 10)
  tube(
    b,
    'gloss',
    '#151618',
    [
      [0, 0.012, -0.125],
      [0.02, 0.006, -0.17],
      [0.09, 0.004, -0.2],
      [0.15, 0.004, -0.15],
      [0.13, 0.004, -0.08],
      [0.17, 0.004, -0.03],
      [0.2, 0.004, -0.06],
    ],
    0.0035,
    { radial: 8, seg: 80 },
  )
  b.group([0.21, 0.018, -0.075], [0, 0.6, Math.PI / 2], () => {
    lathe(b, 'satin', '#1a1b1d', [[0, 0], [0.019, 0.0], [0.02, 0.012], [0.017, 0.03], [0.006, 0.04], [0.004, 0.05], [0, 0.05]], [0, 0, 0], 0, 20)
    for (const s of [-1, 1]) b.cyl('metal', K.chrome, 0.0024, 0.0024, 0.019, [s * 0.0095, -0.009, 0], 0, 10)
    for (const s of [-1, 1]) b.box('metal', K.chrome, [0.002, 0.008, 0.004], [0, 0.003, s * 0.02])
  })
}

export const BLENDER: ModelSpec = {
  id: 'appliance',
  replaces: ['coffee'],
  place: { pos: [COFFEE.x - 0.02, COFFEE.top, COFFEE.z + 0.02], yaw: Math.PI / 2 },
  view: { az: -28, el: 18 },
  parts: [
    { id: '_base', rank: 6, build: base },
    { id: 'cable', rank: 5, build: cable, xpos: [0, 0, -0.03] },
    { id: 'motor', rank: 4, build: motor, xpos: [0, 0.03, 0] },
    { id: 'brushes', rank: 3, build: brushes, pos: [0.024, 0.1, 0], xpos: [0.14, 0.12, 0.03] },
    { id: '_brush2', rank: 3, parent: 'brushes', build: brush2, pos: [-0.048, 0, 0], xpos: [-0.25, 0, 0] },
    { id: 'controlBoard', rank: 3, build: controlBoard, pos: [0, 0.035, 0.07], xpos: [0.17, 0.03, 0.15], xrot: [0, -0.5, 0] },
    { id: 'switch', rank: 2, build: switchPart, pos: [0, 0.08, 0.084], xpos: [0.06, 0.09, 0.22] },
    { id: 'housing', rank: 1, build: housing, xpos: [0, 0.2, -0.02] },
    { id: '_jar', rank: 0, build: jar, xpos: [-0.27, 0.06, -0.08] },
  ],
}
