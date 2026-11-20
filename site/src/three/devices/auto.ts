import { ExtrudeGeometry, Path, Shape } from 'three'
import type { GeoBuilder } from '../builder'
import { bolt, chip, elcap, extrude, extrudeGeo, harness, K, lathe, pcb, screw, smd, sphere, tube } from './kit'
import type { ModelSpec } from './types'

/**
 * Mobile car electrics: parts laid out on a service trolley on the pavement next to the van.
 * Local origin = trolley top. Front (+z) faces the camera.
 * Headlight unit (housing, lens, LED projector module), ECU (lid opens to show its board),
 * dashcam, a short wiring harness and the OBD-II port.
 */
const TOP = 0.8

function trolley(b: GeoBuilder) {
  const blk = '#1b1c1f'
  const W = 0.68
  const D = 0.44
  for (const y of [-0.012, -0.5]) {
    b.box('satin', blk, [W, 0.012, D], [0, y, 0], 0, 0.004)
    for (const s of [-1, 1]) {
      b.box('satin', blk, [W, 0.03, 0.01], [0, y + 0.02, s * (D / 2 - 0.005)])
      b.box('satin', blk, [0.01, 0.03, D], [s * (W / 2 - 0.005), y + 0.02, 0])
    }
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.box('satin', blk, [0.025, TOP - 0.06, 0.025], [sx * (W / 2 - 0.02), -TOP / 2 + 0.03, sz * (D / 2 - 0.02)])
      b.box('metal', '#9da2a7', [0.04, 0.012, 0.04], [sx * (W / 2 - 0.03), -TOP + 0.075, sz * (D / 2 - 0.03)])
      b.cyl('matte', '#0e0e0f', 0.035, 0.035, 0.026, [sx * (W / 2 - 0.03), -TOP + 0.035, sz * (D / 2 - 0.03)], [Math.PI / 2, 0, 0], 16)
      b.cyl('metal', '#b9bdc1', 0.012, 0.012, 0.03, [sx * (W / 2 - 0.03), -TOP + 0.035, sz * (D / 2 - 0.03)], [Math.PI / 2, 0, 0], 10)
    }
  tube(b, 'metal', '#c3c7cb', [[-W / 2 - 0.0, 0.0, -0.15], [-W / 2 - 0.06, 0.06, -0.15], [-W / 2 - 0.06, 0.06, 0.15], [-W / 2, 0.0, 0.15]], 0.011, { radial: 10, seg: 40 })
  // Rubber work mat, a multimeter and a crimp tool on the lower shelf.
  b.box('matte', '#2a2c2f', [W - 0.04, 0.004, D - 0.04], [0, -0.004, 0])
  b.box('gloss', '#f0b71c', [0.09, 0.03, 0.16], [0.12, -0.479, 0.05], 0.3, 0.01)
  b.box('glow', '#b9d6a6', [0.06, 0.003, 0.05], [0.12, -0.463, 0.08], 0.3)
  b.box('gloss', '#c8262b', [0.2, 0.018, 0.03], [-0.15, -0.485, -0.05], -0.2, 0.008)
}

function headlightShell(): Shape {
  // Side profile of a modern swept headlight housing (x across, y up).
  const s = new Shape()
  s.moveTo(-0.17, -0.06)
  s.lineTo(0.15, -0.065)
  s.quadraticCurveTo(0.185, -0.06, 0.18, -0.02)
  s.lineTo(0.16, 0.05)
  s.quadraticCurveTo(0.14, 0.075, 0.1, 0.075)
  s.lineTo(-0.12, 0.06)
  s.quadraticCurveTo(-0.175, 0.05, -0.18, 0.0)
  s.closePath()
  return s
}

function headlight(b: GeoBuilder) {
  const shape = headlightShell()
  // Black housing: hollow shell (walls + back), so the LED module can come out the front once the lens is off.
  const pts = shape.getPoints(24)
  const walls = new Shape(pts)
  walls.holes.push(new Path(pts.map((p) => p.clone().multiplyScalar(0.93)).reverse()))
  b.add('satin', extrudeGeo(walls, 0.16), '#141517', [0, 0, -0.085])
  b.add('satin', extrudeGeo(shape, 0.006), '#141517', [0, 0, -0.162])
  // Inner bezel face with the projector opening (left) and the high-beam reflector (right), chrome trim.
  const face = headlightShell()
  face.holes.push(new Path().absarc(-0.09, 0.005, 0.052, 0, Math.PI * 2, true))
  face.holes.push(new Path().absarc(0.06, 0.005, 0.04, 0, Math.PI * 2, true))
  b.add('satin', extrudeGeo(face, 0.006), '#202226', [0, 0, -0.002])
  b.add('metal', extrudeOutline(shape), '#bfc4c9', [0, 0, 0.0005])
  b.torus('metal', K.chrome, 0.052, 0.0025, [-0.09, 0.005, 0.001], 0, 40)
  lathe(b, 'metal', K.chrome, [[0.0, -0.03], [0.012, -0.028], [0.03, -0.015], [0.04, 0.0]], [0.06, 0.005, 0.0], [Math.PI / 2, 0, 0], 28)
  tube(b, 'glow', '#f4f8ff', [[-0.16, -0.035, 0.004], [-0.02, -0.045, 0.004], [0.12, -0.04, 0.004], [0.165, -0.015, 0.004]], 0.0035, { radial: 6, seg: 40 })
  b.box('glow', '#ffb028', [0.05, 0.008, 0.002], [0.13, 0.04, 0.003], [0, 0, -0.2])
  // Mounting tabs, adjuster screws, back cap + connector socket.
  for (const [x, y] of [[-0.175, 0.04], [0.17, 0.05], [0.0, -0.068]] as const) {
    b.box('satin', '#141517', [0.03, 0.012, 0.02], [x, y, -0.06], 0, 0.003)
    bolt(b, [x, y + 0.006, -0.06], 0.0045)
  }
  b.cyl('satin', '#1d1f22', 0.045, 0.045, 0.01, [-0.09, 0.005, -0.17], [Math.PI / 2, 0, 0], 24)
  b.box('gloss', '#101112', [0.03, 0.018, 0.022], [0.06, -0.02, -0.17], 0, 0.002)
  for (let i = 0; i < 8; i++) b.box('satin', '#26282b', [0.004, 0.06, 0.003], [-0.12 + i * 0.008, 0.005, -0.166])
}

function extrudeOutline(shape: Shape) {
  const pts = shape.getPoints(24)
  const outer = new Shape(pts)
  outer.holes.push(new Path(pts.map((p) => p.clone().multiplyScalar(0.93)).reverse()))
  return extrudeGeo(outer, 0.004)
}

function lens(b: GeoBuilder) {
  // Clear polycarbonate outer lens, domed, with a thin black seal bead.
  const s = headlightShell()
  const g = new ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.004, bevelSegments: 4, curveSegments: 24 })
  // Sits just proud of the DRL guide and the chrome trim, so it lifts straight off.
  b.add('glass', g, '#dfe9f2', [0, 0, 0.022])
  b.add('satin', extrudeOutline(s), '#0f1011', [0, 0, 0.008])
}

function ledModule(b: GeoBuilder) {
  // Projector: glass lens + ring, shroud, LED board (aluminium core, yellow phosphor), finned heatsink, fan, lead.
  sphere(b, 'glass', '#eaf3ff', 0.026, [0, 0, 0.03], [1, 1, 0.55], 20, 12)
  b.torus('metal', '#c9cdd1', 0.026, 0.003, [0, 0, 0.03], 0, 28)
  lathe(b, 'satin', '#1d1f22', [[0.026, 0.03], [0.028, 0.0], [0.022, -0.02]], [0, 0, 0], [Math.PI / 2, 0, 0], 24)
  b.box('metal', '#d6d9dc', [0.034, 0.034, 0.002], [0, 0, -0.022])
  for (let i = 0; i < 4; i++) b.box('glow', '#ffe28a', [0.004, 0.004, 0.001], [-0.0075 + i * 0.005, 0, -0.0205])
  b.box('metal', '#2a2c30', [0.06, 0.06, 0.006], [0, 0, -0.027])
  for (let i = 0; i < 11; i++) b.box('metal', '#2a2c30', [0.0016, 0.06, 0.035], [-0.027 + i * 0.0054, 0, -0.048])
  b.cyl('satin', '#141516', 0.022, 0.022, 0.008, [0, 0, -0.07], [Math.PI / 2, 0, 0], 20)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    b.box('satin', '#26282b', [0.016, 0.006, 0.001], [Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.075], [0, 0.5, a])
  }
  tube(b, 'gloss', '#141414', [[0.03, -0.02, -0.03], [0.05, -0.03, -0.05], [0.06, -0.04, -0.08]], 0.002, { radial: 6 })
  b.box('gloss', '#101112', [0.012, 0.01, 0.016], [0.062, -0.042, -0.088], 0, 0.001)
}

function ecu(b: GeoBuilder) {
  // Die-cast base with ears, the control board inside, two keyed connectors on the front edge.
  const al = '#bfc3c7'
  b.box('metal', al, [0.16, 0.012, 0.13], [0, 0.006, 0], 0, 0.002)
  for (const s of [-1, 1]) {
    b.box('metal', al, [0.004, 0.024, 0.13], [s * 0.078, 0.012, 0], 0, 0.001)
    b.box('metal', al, [0.022, 0.004, 0.026], [s * 0.09, 0.002, -0.04])
    b.cyl('matte', '#2b2d30', 0.004, 0.004, 0.005, [s * 0.094, 0.002, -0.04], 0, 10)
  }
  b.box('metal', al, [0.16, 0.024, 0.004], [0, 0.012, -0.063])
  b.group([0, 0.013, -0.005], 0, () => {
    const t = pcb(b, { w: 0.148, d: 0.11, color: K.pcbGreen, seed: 91, traces: 260 })
    chip(b, 0.022, 0.022, 0.0016, [-0.02, t, -0.01], { pins: 12 })
    chip(b, 0.012, 0.01, 0.0012, [0.025, t, -0.025], { pins: 6 })
    for (let i = 0; i < 4; i++) chip(b, 0.008, 0.012, 0.002, [0.04 + (i % 2) * 0.012, t, 0.0 + Math.floor(i / 2) * 0.018], { pins: 3, pinSides: 2 })
    for (let i = 0; i < 3; i++) elcap(b, 0.005, 0.011, [-0.055 + i * 0.012, t, 0.03], '#1e2a6e')
    b.box('metal', '#d6d9dc', [0.008, 0.002, 0.004], [0.0, t + 0.001, 0.03], 0, 0.001)
    smd(b, 92, -0.07, 0.07, -0.05, 0.045, t, 120, [[-0.02, -0.01, 0.03, 0.03]])
  })
  for (const [x, w] of [[-0.035, 0.07], [0.042, 0.05]] as const) {
    b.box('gloss', '#141517', [w, 0.026, 0.02], [x, 0.018, 0.07], 0, 0.002)
    for (let i = 0; i < Math.round(w / 0.004); i++) for (let j = 0; j < 3; j++) b.box('matte', '#050506', [0.0016, 0.0016, 0.001], [x - w / 2 + 0.004 + i * 0.004, 0.01 + j * 0.006, 0.0805])
    b.box('satin', '#2b2d30', [w * 0.8, 0.004, 0.006], [x, 0.033, 0.078])
  }
}

function ecuLid(b: GeoBuilder) {
  const al = '#c9cdd1'
  b.box('metal', al, [0.162, 0.004, 0.132], [0, 0, 0], 0, 0.0015)
  for (let i = 0; i < 10; i++) b.box('metal', '#b3b8bd', [0.14, 0.004, 0.003], [0, 0.003, -0.054 + i * 0.012])
  b.box('satin', '#f1f0ea', [0.06, 0.0004, 0.035], [0.03, 0.0052, 0.02])
  for (let i = 0; i < 6; i++) b.box('matte', '#55585d', [0.04 - (i % 2) * 0.01, 0.0002, 0.0018], [0.025, 0.0056, 0.008 + i * 0.004])
  for (let i = 0; i < 12; i++) b.box('matte', '#121212', [0.0006, 0.0002, 0.008], [0.004 + i * 0.0011, 0.0056, 0.03])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) screw(b, [sx * 0.074, 0.002, sz * 0.058], 0.003, 0, 0, '#2c2e31')
}

function dashcam(b: GeoBuilder) {
  b.box('gloss', '#141516', [0.07, 0.04, 0.032], [0, 0.02, 0], 0, 0.006)
  b.cyl('satin', '#0c0c0d', 0.014, 0.016, 0.012, [0.012, 0.02, 0.021], [Math.PI / 2, 0, 0], 24)
  b.cyl('glass', '#3a4a6a', 0.0095, 0.0095, 0.004, [0.012, 0.02, 0.0275], [Math.PI / 2, 0, 0], 24)
  sphere(b, 'gloss', '#101522', 0.007, [0.012, 0.02, 0.025], [1, 1, 0.4], 14, 8)
  b.torus('metal', '#c9cdd1', 0.0145, 0.0012, [0.012, 0.02, 0.0272], 0, 24)
  b.box('glow', '#7fc6ff', [0.032, 0.022, 0.0006], [-0.012, 0.02, -0.0163])
  b.box('glow', '#e85b4a', [0.003, 0.003, 0.0006], [-0.03, 0.033, 0.0163])
  for (let i = 0; i < 3; i++) b.cyl('gloss', '#2b2d30', 0.0025, 0.0025, 0.002, [-0.025 + i * 0.008, 0.042, -0.006], 0, 10)
  // Ball-joint mount with adhesive pad, microSD in its slot.
  sphere(b, 'satin', '#1b1c1e', 0.006, [0, 0.046, 0])
  b.box('satin', '#1b1c1e', [0.035, 0.006, 0.02], [0, 0.053, 0], 0, 0.002)
  b.box('matte', '#d9d9d9', [0.034, 0.002, 0.02], [0, 0.057, 0])
  b.box('satin', '#2a64c8', [0.0005, 0.011, 0.015], [0.0352, 0.02, 0])
}

function wiring(b: GeoBuilder) {
  const cols = ['#c8262b', '#141414', '#e6c02c', '#1f54c4', '#3a8a3a', '#ececec', '#8a4bd1']
  const pts: [number, number, number][] = [
    [0.105, 0.012, -0.0],
    [0.09, 0.01, 0.06],
    [0.03, 0.008, 0.1],
    [-0.04, 0.008, 0.11],
    [-0.08, 0.009, 0.15],
  ]
  harness(b, pts, cols, 0.0013)
  // Corrugated loom over the middle section.
  const loom: [number, number, number][] = [
    [0.087, 0.01, 0.065],
    [0.05, 0.009, 0.092],
    [0.0, 0.008, 0.105],
  ]
  tube(b, 'satin', '#151618', loom, 0.0045, { radial: 10, seg: 30 })
  for (let i = 0; i < 18; i++) {
    const t = i / 17
    const p = [0.087 + (0.0 - 0.087) * t, 0.0085, 0.065 + (0.105 - 0.065) * t + Math.sin(t * Math.PI) * 0.012] as const
    b.torus('satin', '#0e0f10', 0.0047, 0.0009, [p[0], p[1], p[2]], [0, Math.atan2(0.087, 0.04) + Math.PI / 2, 0], 10)
  }
  // Connector at the ECU end + terminal pins.
  b.box('gloss', '#151617', [0.024, 0.014, 0.016], [0.108, 0.01, -0.012], 0, 0.002)
  for (let i = 0; i < 6; i++) b.box('metal', K.solder, [0.0012, 0.0012, 0.006], [0.098 + i * 0.004, 0.01, -0.022])
}

function obdPort(b: GeoBuilder) {
  // OBD-II (J1962) female: D-shaped shroud, 2 x 8 contacts, mounting clips.
  const s = new Shape()
  s.moveTo(-0.021, 0.008)
  s.lineTo(0.021, 0.008)
  s.lineTo(0.017, -0.008)
  s.lineTo(-0.017, -0.008)
  s.closePath()
  const hole = new Shape()
  hole.moveTo(-0.018, 0.006)
  hole.lineTo(-0.0155, -0.006)
  hole.lineTo(0.0155, -0.006)
  hole.lineTo(0.018, 0.006)
  hole.closePath()
  s.holes.push(hole)
  extrude(b, 'satin', '#151618', s, 0.02, [0, 0.01, 0], 0, 0.0008)
  b.box('satin', '#1a1b1d', [0.034, 0.012, 0.004], [0, 0.01, -0.008])
  for (let r2 = 0; r2 < 2; r2++)
    for (let i = 0; i < 8; i++) {
      b.box('satin', '#2b2d30', [0.0032, 0.0036, 0.006], [-0.0133 + i * 0.0038, 0.0128 - r2 * 0.0056, -0.003])
      b.box('metal', K.gold, [0.0012, 0.0012, 0.004], [-0.0133 + i * 0.0038, 0.0128 - r2 * 0.0056, -0.0005])
    }
  for (const sx of [-1, 1]) b.box('satin', '#1a1b1d', [0.006, 0.014, 0.012], [sx * 0.026, 0.01, -0.002], [0, 0, sx * 0.1])
  // Rear: wires out of the back shell.
  b.box('satin', '#151618', [0.032, 0.014, 0.014], [0, 0.01, -0.017], 0, 0.002)
}

function dongle(b: GeoBuilder) {
  // Bluetooth OBD diagnostic dongle plugged into the port.
  b.box('gloss', '#1f54c4', [0.044, 0.022, 0.03], [0, 0.011, 0.0], 0, 0.006)
  b.box('satin', '#141516', [0.034, 0.012, 0.012], [0, 0.011, -0.02], 0, 0.002)
  b.box('glow', '#7cf0a0', [0.004, 0.0006, 0.004], [-0.01, 0.0223, 0.006])
  b.box('glow', '#ffb028', [0.004, 0.0006, 0.004], [0.0, 0.0223, 0.006])
  b.box('matte', '#e9edf5', [0.022, 0.0003, 0.008], [0.0, 0.0223, -0.006])
}

export const AUTO: ModelSpec = {
  id: 'auto',
  place: { pos: [5.0, TOP, 2.66], yaw: 0.7 },
  view: { az: 6, el: 30 },
  shopBase: trolley,
  parts: [
    { id: 'headlight', rank: 0, build: headlight, pos: [-0.13, 0.075, -0.06], rot: [-0.25, 0.2, 0], xpos: [-0.16, 0.25, -0.1], xrot: [-0.1, 0.25, 0] },
    // Lens off first (forward, then up out of the way), then the projector slides out the front opening.
    { id: '_lens', rank: 0, parent: 'headlight', build: lens, via: [[0, 0, 0.07]], xpos: [0, 0.2, 0.13] },
    { id: 'ledModule', rank: 1, parent: 'headlight', build: ledModule, pos: [-0.09, 0.005, -0.068], via: [[-0.09, 0.005, 0.1]], xpos: [-0.13, 0.04, 0.15], xrot: [0.3, 0.4, 0] },
    { id: 'ecu', rank: 1, build: ecu, pos: [0.17, 0.0, -0.09], rot: [0, -0.3, 0], xpos: [0.2, 0.08, -0.08], xrot: [0, -0.4, 0] },
    { id: '_ecuLid', rank: 1, parent: 'ecu', build: ecuLid, pos: [0, 0.026, 0], xpos: [0, 0.1, -0.05], xrot: [0.55, 0, 0] },
    { id: 'wiring', rank: 2, build: wiring, xpos: [0, 0.035, 0.0] },
    { id: 'dashcam', rank: 1, build: dashcam, pos: [0.2, 0.0, 0.12], rot: [0, -0.5, 0], xpos: [0.23, 0.17, 0.14], xrot: [0.2, -0.3, 0] },
    { id: 'obdPort', rank: 1, build: obdPort, pos: [-0.08, 0.0, 0.16], rot: [0, 0.3, 0], xpos: [-0.11, 0.07, 0.2], xrot: [0.6, 0.3, 0] },
    { id: '_dongle', rank: 0, parent: 'obdPort', build: dongle, pos: [0, 0.0, 0.03], xpos: [0, 0.03, 0.08], xrot: [0.3, 0, 0] },
  ],
}
