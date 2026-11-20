import type { GeoBuilder } from '../builder'
import { chip, circlePath, elcap, extrude, jst, K, knob, lathe, pcb, roundRect, smd, tube } from './kit'
import type { ModelSpec } from './types'

/**
 * Front-loading washing machine (600 x 850 x 560 mm) on the pavement by the van, on its way
 * to / from a customer's home (sack truck behind it). Front at +z, floor at y = 0.
 * Explodes: door swings out, control board rises, drum slides out the front, heater and drain
 * pump come out underneath, motor (with belt) out the left side. The cabinet + tub stay.
 */
const W = 0.6
const H = 0.85
const D = 0.56
const WHITE = '#f1f2f1'
const PORT = { y: 0.46, r: 0.2 } as const

function cabinet(b: GeoBuilder) {
  // What stays on the floor: side + back panels, base frame and feet, the grey outer tub
  // with its counterweight, springs and dampers, inlet valve and hoses.
  for (const s of [-1, 1]) b.box('satin', WHITE, [0.008, H - 0.02, D], [s * (W / 2 - 0.004), (H - 0.02) / 2, 0], 0, 0.002)
  b.box('satin', '#e3e5e4', [W - 0.016, H - 0.03, 0.006], [0, (H - 0.03) / 2, -D / 2 + 0.003])
  b.box('metal', '#9da2a7', [W - 0.016, 0.012, D - 0.02], [0, 0.006, 0])
  for (const s of [-1, 1]) b.cyl('matte', '#2a2b2d', 0.02, 0.024, 0.02, [s * 0.25, -0.006, s * 0.2], 0, 14)
  // Tub: open at the front, a bearing hole at the back for the drum shaft.
  lathe(b, 'satin', '#8b9196', [[0.255, -0.2], [0.262, -0.18], [0.262, 0.14], [0.24, 0.17], [0.03, 0.17]], [0, PORT.y, -0.02], [-Math.PI / 2, 0, 0], 40)
  b.box('matte', '#9a9890', [0.36, 0.07, 0.07], [0, PORT.y + 0.27, 0.11], 0, 0.006)
  for (const s of [-1, 1]) {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      pts.push([s * 0.17 + Math.cos(t * Math.PI * 18) * 0.012, PORT.y + 0.23 + t * 0.12, -0.05 + Math.sin(t * Math.PI * 18) * 0.012])
    }
    tube(b, 'metal', '#b9bdc1', pts, 0.0022, { radial: 5, seg: 240 })
    b.cyl('satin', '#2b2d30', 0.016, 0.016, 0.16, [s * 0.19, 0.13, 0.0], [0, 0, s * 0.25], 12)
    b.cyl('metal', '#c9cdd1', 0.008, 0.008, 0.08, [s * 0.21, 0.21, 0.0], [0, 0, s * 0.25], 10)
  }
  b.box('gloss', '#e7e7e2', [0.06, 0.04, 0.03], [0.2, H - 0.06, -D / 2 + 0.02])
  tube(b, 'satin', '#9ea3a8', [[0.2, H - 0.06, -D / 2], [0.25, H - 0.2, -D / 2 - 0.03], [0.22, 0.05, -D / 2 - 0.05]], 0.009, { radial: 8 })
  tube(b, 'gloss', '#d6d8d9', [[-0.22, 0.12, -D / 2], [-0.24, 0.05, -D / 2 - 0.05], [-0.1, 0.01, -D / 2 - 0.12]], 0.004, { radial: 6 })
}

function worktop(b: GeoBuilder) {
  b.box('satin', WHITE, [W + 0.004, 0.02, D + 0.02], [0, H - 0.01, 0.005], 0, 0.004)
  b.box('satin', '#dfe1e0', [W - 0.06, 0.012, D - 0.06], [0, H - 0.026, 0.005])
}

function frontPanel(b: GeoBuilder) {
  // Front panel with the porthole and the rubber bellows, control fascia, plinth.
  const front = roundRect(W, H - 0.2, 0.004)
  front.holes.push(circlePath(PORT.r + 0.012, 0, PORT.y - (H - 0.2) / 2 - 0.09))
  extrude(b, 'satin', WHITE, front, 0.012, [0, (H - 0.2) / 2 + 0.09, D / 2 - 0.006], 0, 0.002, 48)
  lathe(b, 'satin', '#9fa4a8', [[PORT.r + 0.014, 0.0], [PORT.r + 0.02, -0.02], [PORT.r - 0.004, -0.05], [PORT.r - 0.01, -0.07]], [0, PORT.y, D / 2 - 0.004], [Math.PI / 2, 0, 0], 48)
  // Control fascia: detergent drawer, program dial with markings, display, buttons.
  b.box('satin', '#e9ebea', [W, 0.11, 0.03], [0, H - 0.075, D / 2 - 0.012], 0, 0.004)
  b.box('satin', '#f6f7f6', [0.15, 0.075, 0.02], [-0.205, H - 0.075, D / 2 + 0.004], 0, 0.004)
  b.box('satin', '#d7d9d8', [0.07, 0.012, 0.004], [-0.205, H - 0.095, D / 2 + 0.014], 0, 0.004)
  knob(b, 0.03, 0.022, [-0.04, H - 0.075, D / 2 + 0.004], { color: K.chrome, skirt: '#c9ccd0' })
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * 1.1 - (i / 13) * Math.PI * 1.2
    b.box('matte', '#55595e', [0.004, 0.0012, 0.0006], [-0.04 + Math.cos(a) * 0.045, H - 0.075 + Math.sin(a) * 0.045, D / 2 + 0.0035], [0, 0, a])
  }
  b.box('gloss', '#0e1013', [0.1, 0.035, 0.002], [0.09, H - 0.07, D / 2 + 0.0035], 0, 0.002)
  for (let i = 0; i < 4; i++) b.box('glow', '#6fd0ff', [0.008, 0.016, 0.0004], [0.06 + i * 0.012, H - 0.068, D / 2 + 0.005])
  b.box('glow', '#ffb028', [0.006, 0.004, 0.0004], [0.122, H - 0.06, D / 2 + 0.005])
  for (let i = 0; i < 4; i++) {
    b.box('satin', '#dfe1e0', [0.022, 0.012, 0.006], [0.175 + (i % 2) * 0.05, H - 0.06 - Math.floor(i / 2) * 0.03, D / 2 + 0.004], 0, 0.003)
    b.box('glow', '#ffffff', [0.004, 0.002, 0.0004], [0.175 + (i % 2) * 0.05, H - 0.052 - Math.floor(i / 2) * 0.03, D / 2 + 0.0072])
  }
  // Plinth with the drain-filter flap.
  b.box('satin', '#e6e8e7', [W - 0.01, 0.085, 0.012], [0, 0.045, D / 2 - 0.006])
  b.box('satin', '#dadcdb', [0.11, 0.06, 0.004], [0.2, 0.045, D / 2 + 0.002], 0, 0.004)
}

function door(b: GeoBuilder) {
  // Pivot at the hinge (left edge of the porthole).
  b.group([PORT.r + 0.03, 0, 0], 0, () => {
    lathe(b, 'satin', '#f5f6f5', [[0.155, 0.0], [0.232, 0.0], [0.236, 0.02], [0.22, 0.035], [0.16, 0.04], [0.15, 0.03]], [0, 0, 0], [Math.PI / 2, 0, 0], 56)
    b.torus('metal', K.chrome, 0.2, 0.012, [0, 0, 0.032], 0, 56)
    lathe(b, 'glass', '#9fb3c4', [[0.16, 0.03], [0.15, 0.0], [0.13, -0.05], [0.08, -0.085], [0.0, -0.095]], [0, 0, 0], [Math.PI / 2, 0, 0], 40)
    lathe(b, 'frosted', '#c8d4dd', [[0.156, 0.03], [0.158, 0.035]], [0, 0, 0], [Math.PI / 2, 0, 0], 40)
    // Handle recess on the right, hinge block on the left.
    b.box('satin', '#d9dbda', [0.03, 0.08, 0.015], [0.215, 0, 0.03], 0, 0.006)
    b.box('satin', '#cfd2d1', [0.04, 0.09, 0.03], [-0.23, 0, 0.0], 0, 0.006)
    for (const y of [-0.03, 0.03]) b.cyl('metal', '#c3c7cb', 0.006, 0.006, 0.02, [-0.24, y, -0.01], 0, 10)
  })
}

function drum(b: GeoBuilder) {
  // Stainless drum along z: perforated shell, front lip, three lifters, rear spider + shaft + big pulley.
  const r = 0.225
  const len = 0.3
  lathe(b, 'metal', '#c9cdd1', [[0.17, len / 2 + 0.01], [0.19, len / 2], [r, len / 2 - 0.02], [r, -len / 2 + 0.01], [r - 0.01, -len / 2], [0.0, -len / 2]], [0, 0, 0], [Math.PI / 2, 0, 0], 56)
  for (let i = 0; i < 40; i++)
    for (let j = 0; j < 7; j++) {
      const a = (i / 40) * Math.PI * 2 + (j % 2) * 0.08
      b.box('matte', '#3d4145', [0.006, 0.006, 0.002], [Math.cos(a) * (r + 0.0005), Math.sin(a) * (r + 0.0005), -len / 2 + 0.04 + j * 0.035], [0, 0, a + Math.PI / 2])
    }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    b.box('satin', '#b9bec2', [0.05, 0.025, len - 0.04], [Math.cos(a) * (r - 0.02), Math.sin(a) * (r - 0.02), 0], [0, 0, a + Math.PI / 2], 0.008)
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    b.box('metal', '#8e9398', [0.03, r * 1.8 * 0.5, 0.02], [Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, -len / 2 - 0.012], [0, 0, a - Math.PI / 2], 0.006)
  }
  b.cyl('metal', '#8e9398', 0.04, 0.04, 0.03, [0, 0, -len / 2 - 0.015], [Math.PI / 2, 0, 0], 20)
  b.cyl('metal', '#c3c7cb', 0.012, 0.012, 0.075, [0, 0, -len / 2 - 0.06], [Math.PI / 2, 0, 0], 12)
}

/** Motor axis along z (parallel to the drum), pulley at the back. */
function motor(b: GeoBuilder) {
  b.cyl('satin', '#2c2e31', 0.05, 0.05, 0.15, [0, 0, 0], [Math.PI / 2, 0, 0], 24)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    b.box('metal', K.copper, [0.003, 0.008, 0.03], [Math.cos(a) * 0.044, Math.sin(a) * 0.044, 0.05], [0, 0, a])
  }
  for (const s of [-1, 1]) b.cyl('metal', '#8e9398', 0.052, 0.052, 0.012, [0, 0, s * 0.075], [Math.PI / 2, 0, 0], 24)
  for (const s of [-1, 1]) b.box('satin', '#1b1c1e', [0.02, 0.025, 0.02], [s * 0.055, 0.0, 0.02], 0, 0.003)
  b.cyl('metal', '#c3c7cb', 0.006, 0.006, 0.05, [0, 0, -0.1], [Math.PI / 2, 0, 0], 10)
  b.cyl('metal', '#a9aeb3', 0.016, 0.016, 0.02, [0, 0, -0.115], [Math.PI / 2, 0, 0], 16)
  for (let i = 0; i < 5; i++) b.torus('metal', '#8e9398', 0.016, 0.0012, [0, 0, -0.107 - i * 0.004], 0, 16)
  b.box('satin', '#2b2d30', [0.06, 0.03, 0.04], [0, -0.05, 0.04], 0, 0.004)
  jst(b, 6, [0, 0.03, 0.075], 0, '#f0ead9', ['#c8262b', '#1f54c4', '#ececec', '#3a8a3a', '#e6c02c', '#141414'], 0.04)
}

/**
 * Belt drive behind the tub: the big drum pulley and the poly-V belt down to the motor pulley.
 * Local origin = drum pulley centre; the belt runs in the z = 0 plane.
 */
function drive(b: GeoBuilder, motorAt: readonly [number, number]) {
  lathe(b, 'metal', '#a9aeb3', [[0.02, -0.011], [0.14, -0.011], [0.14, 0.009], [0.13, 0.011], [0.13, -0.007], [0.02, -0.007]], [0, 0, 0], [Math.PI / 2, 0, 0], 48)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.box('metal', '#a9aeb3', [0.12, 0.012, 0.004], [Math.cos(a) * 0.075, Math.sin(a) * 0.075, -0.009], [0, 0, a])
  }
  b.cyl('metal', '#8e9398', 0.022, 0.022, 0.024, [0, 0, 0], [Math.PI / 2, 0, 0], 16)
  // Belt: around the top of the big pulley, down both sides to the small one.
  const [mx, my] = motorAt
  const pts: [number, number, number][] = []
  const R = 0.141
  const r = 0.017
  const ang = Math.atan2(my, mx)
  // Big pulley: everything except the stretch facing the motor; small pulley: the far half. Counter-clockwise.
  for (let i = 0; i <= 28; i++) {
    const a = ang + 0.35 + (i / 28) * (Math.PI * 2 - 0.7)
    pts.push([Math.cos(a) * R, Math.sin(a) * R, 0])
  }
  for (let i = 1; i < 8; i++) {
    const a = ang - Math.PI / 2 + (i / 8) * Math.PI
    pts.push([mx + Math.cos(a) * r, my + Math.sin(a) * r, 0])
  }
  tube(b, 'satin', '#161617', pts, 0.004, { radial: 6, seg: 160, closed: true })
}

function pump(b: GeoBuilder) {
  // Drain pump: grey volute, black synchronous motor block, white filter cap facing front, hose spigot.
  b.cyl('satin', '#a7abaf', 0.04, 0.04, 0.05, [0, 0, 0], [Math.PI / 2, 0, 0], 24)
  b.cyl('satin', '#f1f2f1', 0.034, 0.034, 0.03, [0, 0, 0.038], [Math.PI / 2, 0, 0], 24)
  for (let i = 0; i < 6; i++) b.box('satin', '#d8dad9', [0.006, 0.03, 0.02], [Math.cos(i) * 0.03, Math.sin(i) * 0.03, 0.052], [0, 0, i])
  b.box('satin', '#d8dad9', [0.05, 0.012, 0.012], [0, 0, 0.058], 0, 0.004)
  b.box('gloss', '#18191b', [0.05, 0.05, 0.045], [0, 0, -0.045], 0, 0.004)
  b.box('metal', K.copper, [0.035, 0.035, 0.012], [0, 0, -0.072])
  for (const s of [-1, 1]) b.box('metal', K.solder, [0.004, 0.012, 0.002], [s * 0.012, 0.03, -0.045])
  b.cyl('satin', '#a7abaf', 0.016, 0.016, 0.05, [0, 0.045, 0], 0, 16)
  for (let i = 0; i < 8; i++) b.torus('satin', '#8e9398', 0.017, 0.002, [0, 0.03 + i * 0.006, 0], [Math.PI / 2, 0, 0], 16)
}

function heater(b: GeoBuilder) {
  // Tubular hairpin element on a flange, terminals + NTC sensor at the front.
  const pts: [number, number, number][] = [
    [-0.03, 0, 0],
    [-0.03, 0, -0.22],
    [-0.02, 0, -0.245],
    [0.0, 0, -0.25],
    [0.02, 0, -0.245],
    [0.03, 0, -0.22],
    [0.03, 0, 0],
  ]
  tube(b, 'metal', '#9a8f83', pts, 0.0045, { radial: 10, seg: 90 })
  b.box('metal', '#c3c7cb', [0.09, 0.035, 0.006], [0, 0, 0.004], 0, 0.004)
  b.cyl('satin', '#202124', 0.022, 0.022, 0.012, [0, 0, 0.012], [Math.PI / 2, 0, 0], 16)
  for (const s of [-1, 1]) {
    b.cyl('metal', '#c3c7cb', 0.003, 0.003, 0.02, [s * 0.03, 0, 0.02], [Math.PI / 2, 0, 0], 8)
    b.box('metal', K.solder, [0.006, 0.0008, 0.012], [s * 0.03, 0, 0.034])
  }
  b.cyl('gloss', '#141414', 0.004, 0.004, 0.04, [0, 0.01, 0.025], [Math.PI / 2, 0, 0], 8)
  b.box('satin', '#2a64c8', [0.008, 0.008, 0.01], [0, 0.01, 0.048], 0, 0.002)
  b.cyl('metal', '#9da2a7', 0.006, 0.006, 0.01, [0, 0, 0.024], [Math.PI / 2, 0, 0], 6)
}

function controlBoard(b: GeoBuilder) {
  const t = pcb(b, { w: 0.26, d: 0.11, color: K.pcbGreen, seed: 71, traces: 380 })
  for (let i = 0; i < 4; i++) b.box('gloss', i % 2 ? '#1f54c4' : '#151617', [0.022, 0.018, 0.016], [-0.1 + i * 0.026, t + 0.009, -0.035], 0, 0.0015)
  for (let i = 0; i < 2; i++) elcap(b, 0.009, 0.022, [0.06 + i * 0.022, t, -0.03])
  for (let i = 0; i < 4; i++) elcap(b, 0.004, 0.009, [-0.02 + i * 0.01, t, 0.03], '#151617', '#9da2a7')
  b.box('satin', '#e6c02c', [0.022, 0.02, 0.02], [0.11, t + 0.01, 0.0], 0, 0.002)
  b.box('satin', '#2b2d30', [0.024, 0.004, 0.022], [0.11, t + 0.002, 0.0])
  chip(b, 0.016, 0.016, 0.0014, [0.0, t, -0.01], { pins: 12 })
  chip(b, 0.006, 0.005, 0.0012, [0.025, t, 0.02], { pins: 4, pinSides: 2 })
  b.box('metal', '#9aa0a5', [0.026, 0.02, 0.004], [-0.06, t + 0.01, 0.035])
  chip(b, 0.01, 0.004, 0.013, [-0.06, t, 0.031], { dot: false })
  for (let i = 0; i < 5; i++) jst(b, 4 + (i % 3), [-0.11 + i * 0.045, t, 0.048], 0, '#efe9d8', ['#c8262b', '#1f54c4', '#ececec', '#3a8a3a', '#e6c02c', '#141414'], 0.03)
  smd(b, 72, -0.125, 0.125, -0.05, 0.05, t, 140, [[0, -0.01, 0.022, 0.022]])
  // Program encoder on a small daughter board at the front edge.
  b.cyl('satin', '#1b1c1e', 0.012, 0.012, 0.014, [-0.04, t + 0.007, -0.055], [Math.PI / 2, 0, 0], 16)
  b.cyl('metal', '#c3c7cb', 0.003, 0.003, 0.03, [-0.04, t + 0.007, -0.07], [Math.PI / 2, 0, 0], 10)
}

function sackTruck(b: GeoBuilder) {
  // Hand truck standing beside the machine (we come to your home).
  b.group([-W / 2 - 0.34, 0, 0.3], [-0.16, 0, 0], () => {
    for (const s of [-1, 1]) {
      b.cyl('metal', '#3a3d42', 0.014, 0.014, 1.15, [s * 0.2, 0.58, 0], 0, 10)
      b.cyl('matte', '#121213', 0.11, 0.11, 0.05, [s * 0.26, 0.11, -0.07], [0, 0, Math.PI / 2], 20)
      b.cyl('metal', '#b9bdc1', 0.05, 0.05, 0.052, [s * 0.26, 0.11, -0.07], [0, 0, Math.PI / 2], 14)
    }
    for (const y of [0.35, 0.7, 1.0]) b.cyl('metal', '#3a3d42', 0.01, 0.01, 0.4, [0, y, 0], [0, 0, Math.PI / 2], 8)
    tube(b, 'metal', '#3a3d42', [[-0.2, 1.15, 0], [-0.16, 1.24, -0.02], [0.16, 1.24, -0.02], [0.2, 1.15, 0]], 0.014, { radial: 8, seg: 30 })
    b.box('metal', '#4a4e53', [0.44, 0.008, 0.22], [0, 0.004, 0.11], 0, 0.003)
    b.box('gloss', '#f0b71c', [0.42, 0.04, 0.004], [0, 0.6, 0.016])
  })
}

const MOTOR = [-0.06, 0.11, -0.13] as const
const PULLEY = [0, PORT.y, -0.245] as const

/**
 * Exploded along the drum axis, like a service-manual drawing: door, front panel and drum line
 * up in front of the cabinet, the worktop lifts straight up with the control board under it,
 * and the drain pump, motor and heater lie in a row on the floor beside the stack.
 * The belt drive stays on the back of the tub (it lights up with the motor).
 */
export const WASHER: ModelSpec = {
  id: 'largeAppliance',
  // Right end of the pavement, facing the street: the parts line up toward the kerb and the
  // camera looks from the open right-hand side, where the floor row lies.
  place: { pos: [5.15, 0, 2.0], yaw: 0 },
  view: { az: 48, el: 22 },
  stageAz: 42,
  span: 0.3,
  shopBase: sackTruck,
  parts: [
    { id: 'cabinet', rank: 6, build: cabinet },
    { id: '_drive', rank: 6, group: 'motor', build: (b) => drive(b, [MOTOR[0] - PULLEY[0], MOTOR[1] - PULLEY[1]]), pos: PULLEY },
    { id: '_top', rank: 0, parent: 'cabinet', build: worktop, xpos: [0, 0.42, 0] },
    { id: 'door', rank: 0, build: door, pos: [-PORT.r - 0.03, PORT.y, D / 2 + 0.006], xpos: [-PORT.r - 0.03, PORT.y, D / 2 + 1.2] },
    { id: '_front', rank: 1, parent: 'cabinet', build: frontPanel, xpos: [0, 0, 0.9] },
    { id: 'controlBoard', rank: 2, build: controlBoard, pos: [0.0, H - 0.08, 0.16], via: [[0.0, H + 0.1, 0.16]], xpos: [0, H + 0.22, 0.34], xrot: [0.55, 0, 0] },
    { id: 'drum', rank: 3, build: drum, pos: [0, PORT.y, -0.02], xpos: [0, PORT.y, 0.62] },
    { id: 'heater', rank: 4, build: heater, pos: [0, 0.2, 0.15], via: [[0, 0.2, 0.45]], xpos: [0.56, 0.08, 1.0] },
    { id: 'pump', rank: 4, build: pump, pos: [0.2, 0.05, 0.19], via: [[0.2, 0.06, 0.42], [0.56, 0.06, 0.42]], xpos: [0.56, 0.06, 0.18] },
    { id: 'motor', rank: 5, build: motor, pos: MOTOR, via: [[MOTOR[0], MOTOR[1], 0.42]], xpos: [0.56, 0.1, 0.56] },
  ],
}
