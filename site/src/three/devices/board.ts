import type { GeoBuilder } from '../builder'
import { chip, choke, flex, jst, K, pcb, polycap, screw, smd, sphere } from './kit'
import type { ModelSpec } from './types'
import { rng } from '../materials'

/**
 * Console / laptop logic board on the green ESD mat at the microscope bench.
 * Board-level repair, so the explode is small and mostly vertical: the RF
 * shield lid, the HDMI port, polymer caps, power stages lift a few cm, and the
 * main BGA package tilts up to show its solder balls over the matching pad grid.
 * Front = +z (HDMI edge), board bottom at y = 0.
 */
const BW = 0.22
const BD = 0.14
const T = 0.0012
const BLUE = '#1d4f73'

/** Main SoC: centre and ball grid. */
const SOC = { x: -0.012, z: -0.004, s: 0.036, n: 17, pitch: 0.0019 }
const SHIELD = { x: -0.078, z: 0.036, w: 0.046, d: 0.04 }
const HDMI = { x: 0.028, z: BD / 2 - 0.006 }
const VRM_X = 0.07
const VRM_Z = [-0.048, -0.033, -0.018, -0.003, 0.012]
const CAPS: [number, number][] = [[0.098, -0.05], [0.098, -0.036], [0.098, -0.022], [0.098, -0.008]]
const CANS: [number, number][] = [[0.094, 0.012], [0.094, 0.026], [0.094, 0.04]]

function board(b: GeoBuilder) {
  const keep: [number, number, number, number][] = [
    [SOC.x, SOC.z, SOC.s + 0.004, SOC.s + 0.004],
    [SHIELD.x, SHIELD.z, SHIELD.w + 0.004, SHIELD.d + 0.004],
    [HDMI.x, HDMI.z, 0.02, 0.016],
    [VRM_X + 0.012, -0.02, 0.04, 0.07],
  ]
  pcb(b, { w: BW, d: BD, t: T, color: BLUE, seed: 23, keepOut: keep, traces: 520 })
  const y = T
  // BGA landing: gold pad grid + silkscreen corner marks.
  const half = ((SOC.n - 1) / 2) * SOC.pitch
  for (let i = 0; i < SOC.n; i++)
    for (let j = 0; j < SOC.n; j++) b.cyl('metal', K.gold, 0.00052, 0.00052, 0.00008, [SOC.x - half + i * SOC.pitch, y + 0.00004, SOC.z - half + j * SOC.pitch], 0, 8)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = SOC.x + sx * (SOC.s / 2 + 0.0015)
      const cz = SOC.z + sz * (SOC.s / 2 + 0.0015)
      b.box('matte', K.silk, [0.005, 0.00005, 0.0004], [cx - sx * 0.0025, y + 0.00003, cz])
      b.box('matte', K.silk, [0.0004, 0.00005, 0.005], [cx, y + 0.00003, cz - sz * 0.0025])
    }
  // GDDR packages around the SoC.
  for (const [x, z] of [[-0.06, -0.034], [-0.06, -0.012], [0.03, -0.044], [0.03, 0.024]] as const) {
    b.box('satin', '#2a3a2f', [0.0135, 0.0008, 0.0115], [x, y + 0.0004, z])
    chip(b, 0.0128, 0.011, 0.0009, [x, y + 0.0008, z])
  }
  // Decoupling MLCC fields around the SoC.
  smd(b, 31, SOC.x - 0.026, SOC.x + 0.026, SOC.z - 0.026, SOC.z + 0.026, y, 90, [[SOC.x, SOC.z, SOC.s + 0.002, SOC.s + 0.002]])
  // VRM: chokes stay; pads where the power stages and caps sit.
  for (const z of VRM_Z) {
    choke(b, 0.0095, [VRM_X + 0.014, y, z])
    for (const dx of [-0.0018, 0.0018]) b.box('metal', K.gold, [0.0016, 0.00008, 0.0052], [VRM_X + dx, y + 0.00004, z])
  }
  for (const [x, z] of CAPS) for (const dz of [-0.0022, 0.0022]) b.box('metal', K.solder, [0.0068, 0.00008, 0.0016], [x, y + 0.00004, z + dz])
  for (const [x, z] of CANS) b.cyl('metal', K.solder, 0.0032, 0.0032, 0.00008, [x, y + 0.00004, z], 0, 14)
  // RF shield fence (the lid lifts off it) and what it guards: Wi-Fi/BT chip, crystal, front-end.
  const { x: sx, z: sz, w: sw, d: sd } = SHIELD
  for (const s of [-1, 1]) {
    b.box('metal', '#c8ccd0', [sw, 0.0022, 0.0004], [sx, y + 0.0011, sz + s * (sd / 2)])
    b.box('metal', '#c8ccd0', [0.0004, 0.0022, sd], [sx + s * (sw / 2), y + 0.0011, sz])
  }
  chip(b, 0.012, 0.012, 0.0009, [sx - 0.008, y, sz - 0.004], { pins: 0 })
  chip(b, 0.006, 0.005, 0.0008, [sx + 0.012, y, sz + 0.008])
  b.box('metal', '#d8dade', [0.0032, 0.0008, 0.0025], [sx + 0.012, y + 0.0004, sz - 0.01])
  smd(b, 41, sx - sw / 2 + 0.003, sx + sw / 2 - 0.003, sz - sd / 2 + 0.003, sz + sd / 2 - 0.003, y, 30, [[sx - 0.008, sz - 0.004, 0.014, 0.014]])
  // Antenna leads (u.FL) leaving the shield.
  for (const dz of [-0.012, 0.0]) {
    b.cyl('metal', '#d8dade', 0.0014, 0.0014, 0.0012, [sx - sw / 2 - 0.004, y + 0.0006, sz + dz], 0, 10)
  }
  // HDMI footprint: row of gold pads + shell tabs.
  for (let i = 0; i < 19; i++) b.box('metal', K.gold, [0.0004, 0.00008, 0.0016], [HDMI.x - 0.0055 + i * 0.0006, y + 0.00004, HDMI.z - 0.0085])
  for (const s of [-1, 1]) b.box('metal', K.solder, [0.0018, 0.00008, 0.004], [HDMI.x + s * 0.0085, y + 0.00004, HDMI.z - 0.002])
  // Neighbouring ports that stay put: USB-C, USB-A, Ethernet-ish block.
  b.box('metal', '#c3c7cb', [0.0092, 0.0032, 0.0075], [0.058, y + 0.0016, BD / 2 - 0.0035], 0, 0.0014)
  b.box('matte', '#0b0b0c', [0.0072, 0.0014, 0.0004], [0.058, y + 0.0016, BD / 2 + 0.0002])
  b.box('metal', '#c3c7cb', [0.0135, 0.0058, 0.012], [0.001, y + 0.0029, BD / 2 - 0.005], 0, 0.0006)
  b.box('gloss', '#2557c4', [0.011, 0.0012, 0.011], [0.001, y + 0.0032, BD / 2 - 0.0045])
  // Misc: ZIF connectors, fan + battery headers, controller chips, coin cell, flex tail.
  for (const [x, z, w] of [[-0.095, -0.04, 0.018], [0.06, -0.06, 0.022]] as const) {
    b.box('gloss', '#e8d9b0', [w, 0.0012, 0.004], [x, y + 0.0006, z])
    b.box('gloss', '#141414', [w, 0.0015, 0.0015], [x, y + 0.0013, z + 0.0016])
  }
  flex(b, [[-0.095, y + 0.0014, -0.042], [-0.095, y + 0.0016, -0.058], [-0.1, y + 0.0065, -0.075]], 0.016)
  jst(b, 4, [0.09, y, -0.066], 0, '#f0ead9', ['#c3262b', '#141414', '#1d4fbf', '#e6c02c'], 0.012)
  jst(b, 2, [-0.1, y, 0.0], Math.PI / 2, '#f0ead9')
  chip(b, 0.008, 0.008, 0.0009, [-0.035, y, 0.038], { pins: 7 })
  chip(b, 0.005, 0.004, 0.0012, [0.004, y, 0.04], { pins: 4, pinSides: 2 })
  chip(b, 0.007, 0.007, 0.0008, [0.045, y, 0.05])
  b.cyl('metal', '#cfd3d6', 0.0062, 0.0062, 0.0022, [-0.03, y + 0.0011, 0.058], 0, 20)
  const r = rng(7)
  for (let i = 0; i < 10; i++) {
    const s = 0.0025 + r() * 0.003
    chip(b, s, s, 0.0006, [-0.1 + r() * 0.05, y, -0.065 + r() * 0.04])
  }
  smd(b, 17, -BW / 2 + 0.004, BW / 2 - 0.004, -BD / 2 + 0.004, BD / 2 - 0.004, y, 420, keep)
  for (const [x, z] of [[-0.104, -0.064], [0.104, -0.064], [-0.104, 0.064], [0.104, 0.064]] as const) screw(b, [x, y + 0.0002, z], 0.0028, 0, 0, '#2a2c2e')
}

function bga(b: GeoBuilder) {
  // Pivot at the package centre, bottom of the substrate. Balls hang below y = 0.
  const half = ((SOC.n - 1) / 2) * SOC.pitch
  b.box('satin', (n) => (n.y < -0.7 ? '#244a33' : '#2d5a3e'), [SOC.s, 0.0011, SOC.s], [0, 0.00055, 0], 0, 0.0002)
  b.box('gloss', '#0f1116', [0.019, 0.0007, 0.015], [0, 0.0014, 0], 0, 0.0002)
  b.box('gloss', '#32363f', [0.0185, 0.00005, 0.0145], [0, 0.00176, 0])
  // Die-side caps and the gold triangle (pin 1).
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) b.box('satin', '#b49067', [0.0012, 0.0005, 0.0006], [-0.0105 + i * 0.003, 0.0013, s * 0.0118])
  b.box('metal', K.gold, [0.0026, 0.00005, 0.0026], [-SOC.s / 2 + 0.0022, 0.00113, -SOC.s / 2 + 0.0022], Math.PI / 4)
  for (let i = 0; i < SOC.n; i++) for (let j = 0; j < SOC.n; j++) sphere(b, 'metal', K.solder, 0.00056, [-half + i * SOC.pitch, -0.00036, -half + j * SOC.pitch], [1, 0.85, 1], 7, 4)
}

function capacitors(b: GeoBuilder) {
  // Rectangular polymer (POSCAP) caps on the VRM pads, cans beside them, MLCCs at the SoC.
  for (const [x, z] of CAPS) {
    b.box('satin', '#151516', [0.0068, 0.0028, 0.0042], [x, 0.0014, z], 0, 0.0004)
    b.box('satin', '#6b4a2a', [0.0012, 0.00006, 0.0036], [x - 0.0024, 0.0028, z])
    for (const s of [-1, 1]) b.box('metal', K.solder, [0.0068, 0.0003, 0.0012], [x, 0.00015, z + s * 0.0018])
  }
  for (const [x, z] of CANS) polycap(b, 0.003, 0.0062, [x, 0, z], '#6b2fb3')
  for (let i = 0; i < 6; i++) {
    const x = SOC.x + SOC.s / 2 + 0.003
    const z = SOC.z - 0.012 + i * 0.0048
    b.box('satin', '#b49067', [0.0016, 0.0009, 0.0032], [x, 0.00045, z])
    for (const s of [-1, 1]) b.box('metal', K.solder, [0.0016, 0.00092, 0.0005], [x, 0.00046, z + s * 0.0015])
  }
}

function mosfets(b: GeoBuilder) {
  // DrMOS power stages (5 x 6 mm), exposed copper pad visible from below.
  for (const z of VRM_Z) {
    chip(b, 0.005, 0.006, 0.0009, [VRM_X, 0, z], { pins: 0 })
    b.box('metal', K.copper, [0.0028, 0.00012, 0.0042], [VRM_X - 0.0004, 0.00012, z])
    for (let i = 0; i < 4; i++) b.box('metal', K.solder, [0.0006, 0.00025, 0.0004], [VRM_X + 0.0026, 0.00012, z - 0.0018 + i * 0.0012])
  }
}

function connector(b: GeoBuilder) {
  // HDMI type-A receptacle, mouth toward +z, pins and shell legs below.
  const w = 0.0152
  const h = 0.0062
  const d = 0.012
  b.box('metal', '#c9cdd1', [w, h, d], [0, h / 2, 0], 0, 0.0006)
  b.box('matte', '#0a0a0b', [w - 0.0016, h - 0.0018, 0.0008], [0, h / 2 + 0.0002, d / 2 + 0.0001])
  b.box('gloss', '#141516', [w - 0.005, 0.0016, 0.0008], [0, h / 2 + 0.0004, d / 2 + 0.0004])
  for (const s of [-1, 1]) {
    b.box('metal', '#b7bcc1', [0.0012, 0.003, 0.003], [s * (w / 2 + 0.0004), -0.0008, 0.002])
    b.box('metal', '#b7bcc1', [0.0012, 0.0012, 0.004], [s * (w / 2 - 0.0008), h + 0.0003, d / 2 - 0.002])
  }
  for (let i = 0; i < 19; i++) b.box('metal', K.gold, [0.00025, 0.0012, 0.0016], [-0.0055 + i * 0.0006, 0.0, -d / 2 - 0.0005])
}

function shield(b: GeoBuilder) {
  // Tin-plated RF shield lid: flat top with a dimple pattern, folded skirt.
  const { w, d } = SHIELD
  b.box('metal', '#d0d4d8', [w + 0.0012, 0.0003, d + 0.0012], [0, 0, 0])
  for (const s of [-1, 1]) {
    b.box('metal', '#c3c7cb', [w + 0.0012, 0.0016, 0.0003], [0, -0.0008, s * (d / 2 + 0.0006)])
    b.box('metal', '#c3c7cb', [0.0003, 0.0016, d + 0.0012], [s * (w / 2 + 0.0006), -0.0008, 0])
  }
  for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) b.cyl('metal', '#a9aeb3', 0.0006, 0.0006, 0.0001, [-w / 2 + 0.004 + i * 0.0048, 0.0002, -d / 2 + 0.004 + j * 0.0053], 0, 8)
  b.box('matte', '#2b2d30', [0.012, 0.00006, 0.006], [w / 2 - 0.01, 0.00018, -d / 2 + 0.006])
}

export const BOARD: ModelSpec = {
  id: 'board',
  // Lies on the ESD mat in front of the oscilloscope; the vintage deck takes this spot when it is on show.
  idle: true,
  place: { pos: [0.5, 0.904, -1.62], yaw: Math.PI / 2 },
  view: { az: 20, el: 42, fov: 30 },
  parts: [
    { id: 'pcb', rank: 4, build: board },
    { id: 'shield', rank: 0, build: shield, pos: [SHIELD.x, T + 0.0024, SHIELD.z], xpos: [SHIELD.x - 0.01, T + 0.04, SHIELD.z + 0.004], xrot: [0.18, 0, 0.1] },
    { id: 'connector', rank: 1, build: connector, pos: [HDMI.x, T + 0.0002, HDMI.z], xpos: [HDMI.x, T + 0.026, HDMI.z + 0.018], xrot: [-0.25, 0, 0] },
    { id: 'capacitors', rank: 2, build: capacitors, pos: [0, T, 0], xpos: [0, T + 0.018, 0] },
    { id: 'mosfets', rank: 2, build: mosfets, pos: [0, T, 0], xpos: [0, T + 0.03, 0] },
    { id: 'bga', rank: 3, build: bga, pos: [SOC.x, T + 0.00068, SOC.z], xpos: [SOC.x, T + 0.034, SOC.z + 0.006], xrot: [-0.75, 0, 0] },
  ],
}
