import type { GeoBuilder, V3 } from '../builder'
import { axialFan, chip, choke, circlePath, extrude, harness, header, jst, K, pcb, polycap, roundRect, roundRectPath, screw, smd, tube } from './kit'
import type { ModelSpec } from './types'

/**
 * Black mid-tower ATX case with a tempered-glass left panel.
 * Authored front = +z, width along x (glass side at -x), floor at y = 0.
 * Exploded sideways out of the open (glass) side: glass first, then front fans,
 * GPU, PSU, and the motherboard carrying its RAM, cooler and M.2 stick.
 */
const W = 0.21
const H = 0.46
const D = 0.45
const X0 = -W / 2
const X1 = W / 2
const Z0 = -D / 2
const Z1 = D / 2
const BODY = '#2a2d32'
const INNER = '#3a3e44'
const SHROUD = 0.118 // PSU shroud top
const MB_T = 0.0016
/** Motherboard pivot: back face on the tray standoffs, board rotated so components face -x. */
const MB: V3 = [0.093, 0.285, -0.09]

function chassis(b: GeoBuilder) {
  // Right panel (cable tray side), bottom, top with filter mesh.
  b.box('satin', (n) => (n.x < -0.7 ? INNER : BODY), [0.0016, H - 0.008, D - 0.004], [X1 - 0.0008, H / 2, 0])
  b.box('satin', BODY, [W, 0.004, D], [0, 0.014, 0], 0, 0.0012)
  b.box('satin', BODY, [W, 0.006, D], [0, H - 0.003, 0], 0, 0.002)
  b.box('matte', '#0c0d0e', [0.15, 0.0004, 0.32], [-0.005, H + 0.0001, -0.03])
  for (let i = 0; i < 26; i++) b.box('satin', '#2a2d31', [0.15, 0.0006, 0.0012], [-0.005, H + 0.0003, -0.185 + i * 0.0124])
  // Front I/O on the top front edge: power button, LED, USB ports, audio.
  b.cyl('gloss', '#0e0f10', 0.007, 0.007, 0.002, [-0.05, H + 0.001, Z1 - 0.03], 0, 18)
  b.torus('glow', '#e8eef5', 0.007, 0.0006, [-0.05, H + 0.0021, Z1 - 0.03], [Math.PI / 2, 0, 0], 20)
  for (const x of [-0.02, -0.004]) b.box('matte', '#050506', [0.013, 0.0012, 0.005], [x, H + 0.0002, Z1 - 0.03])
  b.box('matte', '#050506', [0.009, 0.0012, 0.0035], [0.016, H + 0.0002, Z1 - 0.03])
  for (const x of [0.03, 0.04]) b.cyl('matte', '#050506', 0.0018, 0.0018, 0.0014, [x, H + 0.0002, Z1 - 0.03], 0, 10)
  // Feet.
  for (const x of [-0.075, 0.075]) for (const z of [-0.18, 0.18]) b.box('matte', K.rubber, [0.04, 0.012, 0.05], [x, 0.006, z], 0, 0.004)

  // Rear panel with cut-outs: I/O shield, exhaust fan, expansion slots, PSU.
  const rear = roundRect(W, H, 0.002, 0, H / 2)
  rear.holes.push(roundRectPath(0.046, 0.162, 0.001, 0.071, 0.358))
  rear.holes.push(circlePath(0.056, -0.03, 0.365))
  rear.holes.push(roundRectPath(0.112, 0.142, 0.001, 0.02, 0.193))
  rear.holes.push(roundRectPath(0.168, 0.102, 0.001, 0.0, 0.062))
  extrude(b, 'satin', BODY, rear, 0.0016, [0, 0, Z0 + 0.0008], 0, 0, 16)
  for (let i = 0; i < 7; i++) {
    const y = 0.13 + i * 0.0203
    b.box('metal', '#2b2e32', [0.11, 0.017, 0.0012], [0.02, y, Z0 + 0.0006])
    for (let k = 0; k < 6; k++) b.box('matte', '#060607', [0.012, 0.0024, 0.0014], [-0.02 + k * 0.016, y, Z0 + 0.0003])
    screw(b, [0.072, y, Z0 - 0.0008], 0.0022, [-Math.PI / 2, 0, 0], 0, '#2b2e32')
  }
  // Exhaust fan behind its grille.
  b.group([-0.03, 0.365, Z0 + 0.016], Math.PI, () => axialFan(b, 0.12, 0.025, { seed: 3 }))
  for (const r of [0.018, 0.032, 0.046]) b.torus('satin', BODY, r, 0.0011, [-0.03, 0.365, Z0 - 0.0006], 0, 32)

  // Front panel: bezel with mesh slats; fans sit right behind it.
  const front = roundRect(W, H, 0.006, 0, H / 2)
  front.holes.push(roundRectPath(W - 0.04, H - 0.07, 0.004, 0, H / 2 - 0.005))
  extrude(b, 'satin', BODY, front, 0.012, [0, 0, Z1 - 0.006], 0, 0.002, 12)
  for (let i = 0; i < 46; i++) b.box('satin', '#33363b', [W - 0.04, 0.0034, 0.004], [0, 0.044 + i * 0.0083, Z1 - 0.004])
  b.box('matte', '#08090a', [W - 0.04, H - 0.07, 0.0006], [0, H / 2 - 0.005, Z1 - 0.009])
  b.box('metal', '#9ea3a8', [0.03, 0.004, 0.0006], [0, 0.022, Z1 + 0.0001])

  // Open left side: thin frame the glass mounts to, thumbscrew posts.
  for (const y of [0.02, H - 0.012]) b.box('satin', BODY, [0.008, 0.012, D - 0.01], [X0 + 0.004, y, 0])
  for (const z of [Z0 + 0.006, Z1 - 0.012]) b.box('satin', BODY, [0.008, H - 0.02, 0.012], [X0 + 0.004, H / 2, z])

  // PSU shroud: top plate with cable cut-outs, front bulkhead.
  b.box('satin', INNER, [W - 0.012, 0.003, 0.39], [0, SHROUD, -0.03], 0, 0.001)
  b.box('satin', INNER, [W - 0.012, SHROUD - 0.016, 0.003], [0, (SHROUD + 0.016) / 2, 0.165])
  for (const z of [0.07, -0.05]) b.box('matte', '#060607', [0.03, 0.0035, 0.05], [0.07, SHROUD, z], 0, 0.001)
  b.box('metal', '#a7acb1', [0.003, 0.012, 0.07], [X0 + 0.0075, SHROUD - 0.012, -0.02])
  // Cable grommets beside the board, the board tray's standoffs.
  for (const y of [0.18, 0.28, 0.38]) b.box('matte', K.rubber, [0.008, 0.07, 0.024], [X1 - 0.005, y, 0.055], 0, 0.003)
  for (const [y, z] of [[0.14, -0.206], [0.43, -0.206], [0.14, 0.024], [0.43, 0.024], [0.28, -0.08]] as const) b.cyl('metal', K.brass, 0.003, 0.003, 0.0075, [X1 - 0.0055, y, z], [0, 0, Math.PI / 2], 8)
}

function glass(b: GeoBuilder) {
  // Pivot at the panel's centre. Tempered glass with a black frit border.
  const h = H - 0.012
  const d = D - 0.012
  b.box('glass', '#a9c4d8', [0.004, h, d], [0, 0, 0], 0, 0.0015)
  const f = 0.016
  for (const s of [-1, 1]) {
    b.box('gloss', '#0b0c0d', [0.0042, f, d], [0, s * (h / 2 - f / 2), 0])
    b.box('gloss', '#0b0c0d', [0.0042, h - 2 * f, f], [0, 0, s * (d / 2 - f / 2)])
  }
  // Thumbscrews in the corners.
  for (const y of [-1, 1]) for (const z of [-1, 1]) b.cyl('metal', '#2a2c2f', 0.006, 0.006, 0.006, [-0.004, y * (h / 2 - 0.009), z * (d / 2 - 0.009)], [0, 0, Math.PI / 2], 14)
}

function psu(b: GeoBuilder) {
  // ATX PSU, pivot at its centre: 150 (x) x 86 (y) x 150 (z). Fan grille faces down (-y).
  const w = 0.15
  const h = 0.086
  const d = 0.15
  const band = 0.016
  b.box('satin', '#1a1b1e', [w, h - band, d], [0, band / 2, 0], 0, 0.004)
  for (const s of [-1, 1]) {
    b.box('satin', '#1a1b1e', [0.003, band, d], [s * (w / 2 - 0.0015), -h / 2 + band / 2, 0])
    b.box('satin', '#1a1b1e', [w, band, 0.003], [0, -h / 2 + band / 2, s * (d / 2 - 0.0015)])
  }
  // Fan + grille on the bottom.
  b.group([0, -h / 2 + 0.008, 0], [Math.PI / 2, 0, 0], () => axialFan(b, 0.12, 0.012, { frame: '#141517', blade: '#3a3d42' }))
  for (const r of [0.014, 0.026, 0.038, 0.05]) b.torus('metal', '#3a3d42', r, 0.0012, [0, -h / 2 - 0.0006, 0], [Math.PI / 2, 0, 0], 36)
  for (let i = 0; i < 4; i++) b.box('metal', '#3a3d42', [0.11, 0.0016, 0.0024], [0, -h / 2 - 0.0006, 0], (i * Math.PI) / 4)
  // Side label (silver sticker with lines) on +x, model badge on -x.
  b.box('satin', '#c9ccd0', [0.0005, 0.05, 0.09], [w / 2 + 0.0002, 0, 0])
  for (let i = 0; i < 6; i++) b.box('matte', '#55585d', [0.0003, 0.0022, 0.05 + (i % 2) * 0.02], [w / 2 + 0.0006, 0.017 - i * 0.007, -0.005])
  b.box('gloss', '#d9a93f', [0.0005, 0.012, 0.06], [-w / 2 - 0.0002, 0.012, 0.02])
  b.box('satin', '#e8eaec', [0.0006, 0.006, 0.04], [-w / 2 - 0.0002, -0.012, 0.02])
  // Rear: honeycomb vent, IEC inlet, rocker switch.
  for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) b.box('matte', '#050506', [0.0065, 0.0065, 0.0012], [-0.065 + i * 0.0085 + (j % 2) * 0.004, -0.028 + j * 0.0105, -d / 2 - 0.0002], [0, 0, Math.PI / 4])
  b.box('satin', '#0c0c0d', [0.028, 0.022, 0.004], [0.045, 0.012, -d / 2 - 0.001], 0, 0.001)
  for (const x of [0.037, 0.045, 0.053]) b.box('metal', K.steel, [0.0022, 0.0055, 0.002], [x, 0.012, -d / 2 - 0.003])
  b.box('gloss', '#101011', [0.012, 0.016, 0.006], [0.045, -0.022, -d / 2 - 0.002], 0, 0.0015)
  // Front: modular sockets.
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.box('gloss', '#0b0b0c', [0.024, 0.011, 0.004], [-0.05 + i * 0.03, -0.012 + j * 0.022, d / 2 + 0.001], 0, 0.001)
  // Sleeved cables: 24-pin and 8-pin leads coiled up out of the front sockets.
  const sleeve = ['#121314', '#121314', '#2a2c30', '#121314', '#121314', '#2a2c30']
  harness(b, [[0.03, 0.0, d / 2 + 0.004], [0.032, -0.004, d / 2 + 0.04], [0.04, 0.012, d / 2 + 0.075], [0.05, 0.03, d / 2 + 0.06], [0.052, 0.034, d / 2 + 0.03]], sleeve, 0.0022, '#26282b')
  b.box('gloss', '#0d0d0e', [0.052, 0.012, 0.012], [0.052, 0.034, d / 2 + 0.02], 0, 0.001)
  harness(b, [[-0.05, 0.0, d / 2 + 0.004], [-0.052, -0.006, d / 2 + 0.035], [-0.055, 0.008, d / 2 + 0.06], [-0.055, 0.025, d / 2 + 0.045]], sleeve.slice(0, 4), 0.0018, '#26282b')
  b.box('gloss', '#0d0d0e', [0.018, 0.012, 0.01], [-0.055, 0.027, d / 2 + 0.036], 0, 0.001)
  for (const [x, y] of [[-0.06, 0.03], [0.06, 0.03], [-0.06, -0.03], [0.06, -0.03]] as const) screw(b, [x, y, -d / 2 - 0.0005], 0.0025, [-Math.PI / 2, 0, 0], 0, '#2b2e32')
}

function heatsink(b: GeoBuilder, size: V3, pos: V3, grooves: 'x' | 'z') {
  const [w, h, d] = size
  b.box('metal', '#2e3135', [w, h, d], [pos[0], pos[1] + h / 2, pos[2]], 0, 0.0015)
  const n = Math.floor((grooves === 'x' ? w : d) / 0.004)
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * 0.004
    if (grooves === 'x') b.box('matte', '#0c0d0e', [0.0012, 0.0006, d * 0.86], [pos[0] + t, pos[1] + h + 0.0001, pos[2]])
    else b.box('matte', '#0c0d0e', [w * 0.86, 0.0006, 0.0012], [pos[0], pos[1] + h + 0.0001, pos[2] + t])
  }
  b.box('metal', '#a8adb2', [w * 0.9, 0.0004, Math.min(d, 0.004)], [pos[0], pos[1] + h + 0.0003, pos[2] + d / 2 - 0.003])
}

function motherboard(b: GeoBuilder) {
  // Board in local XZ, components on +y. Local x = up (world y), local z = world z.
  const keep: [number, number, number, number][] = [
    [0.075, -0.035, 0.06, 0.06],
    [0.07, 0.052, 0.14, 0.04],
    [0.02, -0.03, 0.03, 0.085],
    [0.128, -0.05, 0.03, 0.11],
    [0.065, -0.09, 0.1, 0.03],
    [-0.015, -0.05, 0.012, 0.095],
    [-0.095, -0.05, 0.012, 0.095],
  ]
  const t = pcb(b, { w: 0.305, d: 0.244, color: K.pcbGreen, seed: 71, keepOut: keep, traces: 560 })
  // LGA socket: steel load plate, lever, CPU heat spreader.
  b.box('metal', '#b9bec3', [0.052, 0.004, 0.046], [0.075, t + 0.002, -0.035], 0, 0.001)
  b.box('metal', '#d7dadd', [0.04, 0.0045, 0.034], [0.075, t + 0.0025, -0.035], 0, 0.002)
  b.cyl('metal', '#b9bec3', 0.0008, 0.0008, 0.05, [0.105, t + 0.003, -0.035], [Math.PI / 2, 0, 0], 6)
  // VRM: chokes, power stages and two heatsinks in an L.
  for (let i = 0; i < 9; i++) {
    choke(b, 0.0075, [0.11, t, -0.1 + i * 0.0095])
    chip(b, 0.005, 0.005, 0.0009, [0.099, t, -0.1 + i * 0.0095])
  }
  for (let i = 0; i < 6; i++) choke(b, 0.0075, [0.055 + i * 0.0095, t, -0.077])
  heatsink(b, [0.022, 0.03, 0.1], [0.131, t, -0.05], 'z')
  heatsink(b, [0.09, 0.03, 0.02], [0.07, t, -0.093], 'x')
  for (let i = 0; i < 5; i++) polycap(b, 0.003, 0.008, [0.116, t, 0.006 + i * 0.0068], '#1b1b1d')
  // Rear I/O cover + integrated I/O shield and ports.
  b.box('satin', '#2a2d31', [0.115, 0.034, 0.02], [0.09, t + 0.017, -0.112], 0, 0.003)
  b.box('metal', '#d9a93f', [0.07, 0.0005, 0.003], [0.09, t + 0.0342, -0.108])
  b.box('metal', '#8f9499', [0.155, 0.044, 0.0012], [0.075, t + 0.022, -0.1325])
  for (const [x, w, c] of [[0.135, 0.016, '#2b6ad9'], [0.112, 0.016, '#2b6ad9'], [0.09, 0.018, '#18191b'], [0.066, 0.014, '#c9cdd1'], [0.035, 0.022, '#e0d4b0'], [0.012, 0.014, '#18191b']] as const)
    b.box('satin', c, [w, 0.014, 0.012], [x, t + 0.012, -0.126], 0, 0.001)
  // DIMM slots (4), latches.
  for (let i = 0; i < 4; i++) {
    const z = 0.035 + i * 0.0105
    b.box('satin', i % 2 ? '#2f3236' : '#121315', [0.135, 0.006, 0.0062], [0.07, t + 0.003, z], 0, 0.0008)
    for (const s of [-1, 1]) b.box('satin', '#7d8288', [0.006, 0.009, 0.0064], [0.07 + s * 0.07, t + 0.0045, z], 0, 0.001)
  }
  // 24-pin ATX, 8-pin EPS, fan headers, front panel and USB headers, SATA.
  b.box('gloss', '#101112', [0.052, 0.012, 0.01], [0.04, t + 0.006, 0.112], 0, 0.001)
  for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) b.box('matte', '#000', [0.003, 0.0004, 0.003], [0.0175 + i * 0.0041, t + 0.0121, 0.11 + j * 0.0042])
  b.box('gloss', '#101112', [0.008, 0.012, 0.02], [0.146, t + 0.006, -0.112], 0, 0.001)
  jst(b, 4, [0.148, t, 0.02], 0, '#f0ead9')
  jst(b, 4, [-0.148, t, 0.06], 0, '#f0ead9')
  header(b, 9, 2, [-0.144, t, -0.01], Math.PI / 2)
  header(b, 10, 2, [-0.144, t, 0.035], Math.PI / 2)
  for (let i = 0; i < 4; i++) b.box('gloss', '#18191b', [0.008, 0.008, 0.012], [-0.09 + (i % 2) * 0.01, t + 0.004 + Math.floor(i / 2) * 0.008, 0.112], 0, 0.0008)
  // PCIe slots: reinforced x16 (top), x1, x16. M.2 socket + standoff.
  for (const [x, len, armour] of [[-0.015, 0.089, true], [-0.055, 0.025, false], [-0.095, 0.089, true]] as const) {
    b.box(armour ? 'metal' : 'satin', armour ? '#a9aeb3' : '#151617', [0.0075, 0.011, len], [x, t + 0.0055, -0.095 + len / 2], 0, 0.0008)
    b.box('matte', '#050505', [0.0018, 0.0004, len - 0.004], [x, t + 0.0111, -0.095 + len / 2])
  }
  b.box('gloss', '#151617', [0.022, 0.0045, 0.006], [0.02, t + 0.00225, -0.072], 0, 0.0006)
  b.cyl('metal', K.brass, 0.0022, 0.0022, 0.003, [0.02, t + 0.0015, 0.01], 0, 10)
  // Chipset heatsink, audio corner, CMOS battery, BIOS, controllers.
  heatsink(b, [0.044, 0.01, 0.044], [-0.055, t, 0.06], 'x')
  b.box('metal', '#d9a93f', [0.02, 0.0004, 0.02], [-0.055, t + 0.0104, 0.06], Math.PI / 4)
  for (let i = 0; i < 6; i++) polycap(b, 0.0028, 0.008, [-0.13 + (i % 3) * 0.008, t, -0.105 + Math.floor(i / 3) * 0.008], '#d9a93f')
  chip(b, 0.007, 0.007, 0.0009, [-0.115, t, -0.075], { pins: 6 })
  b.cyl('metal', '#cfd3d6', 0.01, 0.01, 0.0032, [-0.125, t + 0.0016, 0.0], 0, 22)
  chip(b, 0.005, 0.005, 0.0012, [-0.07, t, 0.0], { pins: 4, pinSides: 2 })
  chip(b, 0.012, 0.012, 0.0012, [-0.12, t, 0.09], { pins: 8 })
  chip(b, 0.009, 0.009, 0.001, [0.0, t, 0.09])
  smd(b, 72, -0.145, 0.145, -0.115, 0.115, t, 260, keep)
  // Mounting screws.
  for (const [x, z] of [[0.146, -0.116], [0.146, 0.0], [0.146, 0.116], [0.0, -0.116], [0.0, 0.116], [-0.146, -0.116], [-0.146, 0.116], [-0.04, 0.0]] as const) screw(b, [x, t, z], 0.003)
}

function ram(b: GeoBuilder) {
  // Two DIMMs (slots 2 and 4), standing on local y, heat spreaders with a light bar.
  for (const z of [0.0455, 0.0665]) {
    b.box('satin', K.pcbGreen, [0.133, 0.031, 0.0012], [0, 0.0155, z])
    for (let i = 0; i < 16; i++) b.box('metal', K.gold, [0.0035, 0.004, 0.00125], [-0.064 + i * 0.0084, 0.002, z])
    for (const s of [-1, 1]) b.box('metal', '#3d4146', [0.13, 0.032, 0.0012], [0, 0.019, z + s * 0.0014], 0, 0.0005)
    b.box('metal', '#9ca1a6', [0.13, 0.002, 0.004], [0, 0.0355, z])
    b.box('glow', '#f2f6ff', [0.124, 0.0035, 0.0034], [0, 0.0383, z])
    b.box('gloss', '#d9a93f', [0.03, 0.006, 0.0002], [0.03, 0.02, z - 0.0021])
  }
}

function cooler(b: GeoBuilder) {
  // Pivot on top of the CPU. Local x = up the board, y = away from it, z = airflow (front +z).
  b.box('metal', K.copper, [0.04, 0.008, 0.038], [0, 0.004, 0], 0, 0.0008)
  b.box('metal', '#c7ccd1', [0.05, 0.006, 0.03], [0, 0.011, 0], 0, 0.001)
  b.box('metal', '#9aa0a5', [0.09, 0.002, 0.012], [0, 0.004, 0])
  // Four copper heat pipes in U shapes, rising from the base through the fin stack.
  const pipes: [number, number][] = [[0.024, -0.009], [0.04, -0.003], [0.032, 0.003], [0.048, 0.009]]
  for (const [xo, z] of pipes)
    tube(b, 'metal', K.copper, [[-xo, 0.158, z], [-xo, 0.05, z], [-xo * 0.6, 0.02, z], [-0.006, 0.006, z], [0.006, 0.006, z], [xo * 0.6, 0.02, z], [xo, 0.05, z], [xo, 0.158, z]], 0.003, { seg: 70, radial: 8 })
  // Aluminium fin stack + top cover.
  for (let i = 0; i < 46; i++) b.box('metal', '#c3c8cd', [0.124, 0.0004, 0.05], [0, 0.052 + i * 0.0022, 0])
  b.box('satin', '#17181b', [0.126, 0.004, 0.052], [0, 0.155, 0], 0, 0.0012)
  b.box('metal', '#a9aeb3', [0.05, 0.0005, 0.008], [0, 0.1573, 0.012])
  for (const [xo, z] of pipes) for (const s of [-1, 1]) b.cyl('metal', '#b9bec3', 0.0031, 0.0031, 0.003, [s * xo, 0.158, z], 0, 10)
  // Front fan with wire clips, lead to the CPU_FAN header.
  b.group([0, 0.1, 0.0375], 0, () => axialFan(b, 0.12, 0.025, { ring: '#e8eef5', seed: 5 }))
  for (const s of [-1, 1]) b.box('metal', '#9aa0a5', [0.002, 0.11, 0.002], [s * 0.05, 0.1, 0.05])
  tube(b, 'gloss', '#111', [[0.055, 0.045, 0.04], [0.07, 0.02, 0.04], [0.073, 0.005, 0.055]], 0.0012, { radial: 5 })
}

function ssd(b: GeoBuilder) {
  // M.2 2280, lying on local y = 0, connector toward -z.
  b.box('satin', '#151719', [0.022, 0.0008, 0.08], [0, 0.0004, 0])
  for (let i = 0; i < 9; i++) b.box('metal', K.gold, [0.0012, 0.0009, 0.0035], [-0.009 + i * 0.0022, 0.0004, -0.0385])
  chip(b, 0.011, 0.012, 0.0011, [0, 0.0008, -0.024], { dot: false })
  chip(b, 0.012, 0.014, 0.0012, [0, 0.0008, -0.004])
  chip(b, 0.012, 0.014, 0.0012, [0, 0.0008, 0.016])
  b.box('satin', '#d9a93f', [0.018, 0.0002, 0.034], [0, 0.0023, 0.006])
  b.box('matte', '#1b1c1e', [0.012, 0.0002, 0.006], [0, 0.0025, 0.0])
  b.cyl('metal', K.gold, 0.0018, 0.0018, 0.0009, [0, 0.0004, 0.04], 0, 12)
}

function gpu(b: GeoBuilder) {
  // Pivot at the PCB centre. PCB horizontal, fingers toward +x (the board), fans facing -y.
  const L = 0.285
  const Wd = 0.13
  b.box('satin', (n) => (Math.abs(n.y) > 0.7 ? '#1b1d20' : '#0f3a28'), [Wd, 0.0016, L], [0, 0, 0])
  for (let i = 0; i < 34; i++) b.box('metal', K.gold, [0.004, 0.0017, 0.0018], [Wd / 2 + 0.002, 0, -0.107 + i * 0.0025])
  b.box('satin', '#0f3a28', [0.004, 0.0016, 0.089], [Wd / 2 + 0.002, 0, -0.065])
  // Backplate on top: brushed dark alu with a cut-out and badge.
  b.box('metal', '#2c2f33', [Wd - 0.004, 0.003, L - 0.004], [0, 0.0028, 0], 0, 0.001)
  b.box('metal', '#5a5e63', [0.06, 0.0005, 0.12], [-0.012, 0.0045, 0.05], 0, 0.0002)
  b.box('gloss', '#d9a93f', [0.012, 0.0006, 0.05], [-0.04, 0.0045, -0.06])
  // Shroud + heatsink fins showing between shroud and PCB.
  const sh = 0.042
  for (let i = 0; i < 70; i++) b.box('metal', '#aeb3b8', [0.12, 0.022, 0.0004], [-0.002, -0.012, -0.135 + i * 0.0039])
  for (let i = 0; i < 3; i++) tube(b, 'metal', K.copper, [[-0.05, -0.012, -0.12 + i * 0.012], [0.05, -0.012, -0.11 + i * 0.012], [0.05, -0.012, 0.11 - i * 0.012], [-0.05, -0.012, 0.12 - i * 0.012]], 0.003, { seg: 60 })
  const shroud = roundRect(Wd + 0.004, L + 0.004, 0.012)
  shroud.holes.push(circlePath(0.047, 0, -0.066), circlePath(0.047, 0, 0.066))
  extrude(b, 'satin', '#202327', shroud, 0.012, [0, -sh + 0.006, 0], [Math.PI / 2, 0, 0], 0.002, 24)
  for (const s of [-1, 1]) b.box('satin', '#2a2d31', [0.004, 0.03, L - 0.01], [s * (Wd / 2 + 0.001), -0.017, 0], 0, 0.0015)
  b.box('glow', '#e8eef5', [0.0015, 0.004, 0.17], [-Wd / 2 - 0.0016, -0.022, 0.02])
  b.box('metal', '#b9bec3', [0.0012, 0.006, 0.04], [-Wd / 2 - 0.0012, -0.022, -0.1])
  for (const z of [-0.066, 0.066]) b.group([0, -sh + 0.012, z], [Math.PI / 2, 0, 0], () => axialFan(b, 0.096, 0.012, { frame: '#202327', blades: 11, ring: '#d9a93f' }))
  // Power connectors on the outer edge; PCIe bracket with display outputs at the rear.
  for (const z of [0.07, 0.092]) b.box('gloss', '#0c0d0e', [0.008, 0.012, 0.02], [-Wd / 2 + 0.004, 0.0075, z], 0, 0.001)
  b.box('metal', '#b9bec3', [0.12, 0.045, 0.0012], [0.006, -0.018, -L / 2 - 0.0012])
  b.box('metal', '#b9bec3', [0.012, 0.0012, 0.012], [0.06, 0.004, -L / 2 + 0.004])
  for (let i = 0; i < 4; i++) b.box('matte', '#060607', [0.016, 0.008, 0.002], [-0.04 + i * 0.022, -0.012, -L / 2 - 0.0018], 0, 0.0008)
  for (let i = 0; i < 9; i++) b.box('matte', '#060607', [0.008, 0.002, 0.002], [-0.04 + i * 0.009, -0.032, -L / 2 - 0.0018])
}

function frontFans(b: GeoBuilder) {
  // Three 120 mm intakes stacked behind the mesh, blowing toward -z, white rings facing the glass side.
  for (const y of [-0.13, 0, 0.13]) b.group([0, y, 0], Math.PI, () => axialFan(b, 0.12, 0.025, { ring: '#e8eef5', seed: 9 }))
  tube(b, 'gloss', '#111', [[0.05, -0.17, -0.012], [0.06, -0.175, -0.03], [0.07, -0.18, -0.06]], 0.0012, { radial: 5 })
}

/** World pose of a point given in motherboard-local coordinates (board rotated +90° about z). */
const onBoard = (lx: number, ly: number, lz: number): V3 => [MB[0] - ly, MB[1] + lx, MB[2] + lz]

export const PC: ModelSpec = {
  id: 'pc',
  // The glass side is what the camera should see: turn it to +z (case front ends up on +x).
  frontYaw: Math.PI / 2,
  span: 0.3,
  parts: [
    { id: '_chassis', rank: 6, build: chassis },
    // Glass comes off first and goes round the back, out of the way of everything leaving through the open side.
    { id: 'sidePanel', rank: 0, build: glass, pos: [X0 - 0.002, H / 2, 0], via: [{ pos: [X0 - 0.07, H / 2, 0], rot: [0, 0, 0] }], xpos: [X0 - 0.04, H / 2 + 0.03, -0.62], xrot: [0, -0.35, 0] },
    // Front fans: back off the bezel, out through the open side, round to the front.
    {
      id: 'fans',
      rank: 1,
      build: frontFans,
      pos: [0, 0.215, Z1 - 0.025],
      via: [
        { pos: [0, 0.225, Z1 - 0.036], rot: [0, 0, 0] },
        { pos: [X0 - 0.08, 0.225, Z1 - 0.036], rot: [0, 0, 0] },
        { pos: [X0 - 0.15, 0.24, Z1 + 0.06], rot: [0, 0, 0] },
      ],
      xpos: [-0.25, 0.27, Z1 + 0.24],
      xrot: [0, -0.75, 0],
    },
    {
      id: 'gpu',
      rank: 2,
      build: gpu,
      pos: [0.016, onBoard(-0.015, 0, 0)[1], -0.218 + 0.1425],
      via: [{ pos: [X0 - 0.09, onBoard(-0.015, 0, 0)[1], -0.218 + 0.1425], rot: [0, 0, 0] }],
      xpos: [-0.3, 0.06, 0.2],
      xrot: [0, 0.45, -Math.PI / 2],
    },
    // PSU: slides out through its opening in the rear panel, then stands up behind the case.
    {
      id: 'psu',
      rank: 2,
      build: psu,
      pos: [0.0, 0.016 + 0.043 + 0.002, Z0 + 0.0035 + 0.075],
      via: [{ pos: [0.0, 0.061, -0.4], rot: [0, 0, 0] }],
      xpos: [-0.1, 0.09, -0.36],
      xrot: [0, 0.45, -Math.PI / 2],
    },
    // Board: off the standoffs and the I/O out of the rear panel, straight out the side, then turn a little to the camera.
    {
      id: 'motherboard',
      rank: 3,
      build: motherboard,
      pos: MB,
      rot: [0, 0, Math.PI / 2],
      via: [
        { pos: [MB[0] - 0.012, MB[1], MB[2] + 0.035], rot: [0, 0, Math.PI / 2] },
        { pos: [X0 - 0.12, MB[1] + 0.02, MB[2] + 0.035], rot: [0, 0, Math.PI / 2] },
      ],
      xpos: [X0 - 0.27, MB[1] + 0.13, MB[2] + 0.02],
      xrot: [0, 0.35, Math.PI / 2],
    },
    { id: 'ram', rank: 6, parent: 'motherboard', build: ram, pos: [0.07, MB_T + 0.0025, 0], xpos: [0.07, MB_T + 0.07, 0.075] },
    { id: 'cpuCooler', rank: 6, parent: 'motherboard', build: cooler, pos: [0.075, MB_T + 0.0095, -0.035], xpos: [0.085, MB_T + 0.13, -0.03], xrot: [-0.45, 0, 0] },
    { id: 'ssd', rank: 6, parent: 'motherboard', build: ssd, pos: [0.02, MB_T + 0.003, -0.03], xpos: [0.02, MB_T + 0.045, -0.03] },
  ],
}
