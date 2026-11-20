import type { GeoBuilder } from '../builder'
import { LAPTOP_SEAT } from '../Bench'
import { C } from '../materials'
import { blower, chip, choke, flex, jst, K, pcb, screw, slots, smd, sphere, tube } from './kit'
import type { ModelSpec } from './types'

/**
 * Laptop cooling service: a laptop lying upside down on its stand, bottom cover off.
 * Width along x (0.33), depth along z (0.235, front edge at +z), lid closed underneath.
 * Explodes: screws + bottom cover lift away, SSD and RAM pop out, fan lifts, heatsink lifts
 * and the CPU die shows its fresh grey thermal paste.
 */
const W = 0.33
const D = 0.235
const FLOOR = 0.0165 // inner floor of the upturned keyboard deck
const BOARD_Y = FLOOR + 0.0015
const CPU = { x: -0.045, z: -0.045 } as const
const SHELL = '#5a5f65'

function chassis(b: GeoBuilder) {
  // Lid (A cover) at the bottom, closed display + keyboard deck, upturned C-cover tray.
  b.box('metal', SHELL, [W, 0.005, D], [0, 0.0025, 0], 0, 0.0015)
  b.box('gloss', '#0d0e10', [W - 0.004, 0.004, D - 0.004], [0, 0.007, 0])
  b.box('metal', '#767b81', [W, 0.0075, D], [0, 0.0125, 0], 0, 0.0012)
  for (const s of [-1, 1]) b.cyl('metal', '#2a2c2f', 0.0045, 0.0045, 0.05, [s * 0.11, 0.009, -D / 2], [0, 0, Math.PI / 2], 12)
  b.box('metal', '#6a6f75', [W - 0.004, 0.001, D - 0.004], [0, FLOOR, 0])
  for (const s of [-1, 1]) b.box('metal', '#767b81', [0.003, 0.012, D], [s * (W / 2 - 0.0015), FLOOR + 0.006, 0])
  b.box('metal', '#767b81', [W, 0.012, 0.003], [0, FLOOR + 0.006, D / 2 - 0.0015])
  b.box('metal', '#767b81', [W, 0.012, 0.003], [0, FLOOR + 0.006, -D / 2 + 0.0015])
  // Battery across the front, with label + lead.
  b.box('gloss', '#17181a', [0.27, 0.0065, 0.085], [0, FLOOR + 0.0035, 0.065], 0, 0.0015)
  for (const x of [-0.045, 0.045]) b.box('matte', '#0b0b0c', [0.0016, 0.0002, 0.086], [x, FLOOR + 0.0068, 0.065])
  b.box('satin', '#e6e5df', [0.08, 0.0002, 0.05], [-0.07, FLOOR + 0.0069, 0.07])
  for (let i = 0; i < 6; i++) b.box('matte', '#5b5e63', [0.05 - (i % 3) * 0.01, 0.0001, 0.0011], [-0.075, FLOOR + 0.0071, 0.055 + i * 0.005])
  for (let i = 0; i < 5; i++) tube(b, 'gloss', ['#c3262b', '#c3262b', '#141414', '#141414', '#e8e8e8'][i], [[0.02 + i * 0.002, FLOOR + 0.004, 0.022], [0.022 + i * 0.002, FLOOR + 0.005, 0.012], [0.024 + i * 0.002, BOARD_Y + 0.002, 0.004]], 0.0006, { radial: 4 })
  // Speakers in the front corners.
  for (const s of [-1, 1]) {
    b.box('gloss', '#141516', [0.035, 0.007, 0.02], [s * 0.145, FLOOR + 0.0035, 0.095], 0, 0.002)
    slots(b, s * 0.145, 0.095, FLOOR + 0.0072, 6, 3, 0.002, 0.002, 0.004, 0.004, '#2a2c30')
  }
  // Motherboard across the back half.
  b.group([0, BOARD_Y, -0.05], 0, () => {
    const t = pcb(b, { w: 0.3, d: 0.12, color: C.pcbGreen, seed: 23, traces: 520, keepOut: [[CPU.x, CPU.z + 0.05, 0.04, 0.04]] })
    // CPU package (die top gets the paste), PCH, VRM.
    b.box('satin', '#255c3a', [0.034, 0.0012, 0.03], [CPU.x, t + 0.0006, CPU.z + 0.05])
    b.box('gloss', '#1a1d24', [0.022, 0.0008, 0.011], [CPU.x, t + 0.0016, CPU.z + 0.047])
    b.box('gloss', '#1a1d24', [0.008, 0.0008, 0.008], [CPU.x, t + 0.0016, CPU.z + 0.06])
    smd(b, 4, CPU.x - 0.016, CPU.x + 0.016, CPU.z + 0.037, CPU.z + 0.063, t + 0.0012, 18, [[CPU.x, CPU.z + 0.05, 0.024, 0.026]])
    for (let i = 0; i < 6; i++) choke(b, 0.0065, [-0.1 + i * 0.009, t, 0.035])
    // Empty SODIMM socket + M.2 socket (their modules are parts), WiFi card, CMOS cell, ports.
    b.box('satin', '#1b1c1e', [0.07, 0.005, 0.006], [0.03, t + 0.0025, 0.012])
    for (const s of [-1, 1]) b.box('metal', '#c9ccd0', [0.003, 0.004, 0.03], [0.03 + s * 0.037, t + 0.002, 0.03])
    b.box('satin', '#1b1c1e', [0.024, 0.0035, 0.006], [-0.105, t + 0.00175, 0.042])
    b.group([0.0, t, -0.03], 0, () => {
      b.box('satin', K.pcbBlue, [0.022, 0.0008, 0.03], [0, 0.0004, 0])
      b.box('metal', '#c8ccd0', [0.016, 0.0012, 0.018], [0, 0.0014, 0.003])
      for (const s of [-1, 1]) {
        b.cyl('metal', K.gold, 0.0017, 0.0017, 0.0016, [s * 0.006, 0.0016, -0.011], 0, 10)
        tube(b, 'gloss', s > 0 ? '#2a2a2b' : '#d3d6d8', [[s * 0.006, 0.0024, -0.011], [s * 0.03, 0.003, -0.03], [s * 0.12, 0.003, -0.04], [s * 0.14, 0.003, 0.04]], 0.0007, { radial: 4, seg: 50 })
      }
    })
    b.cyl('gloss', '#e5b43a', 0.0105, 0.0105, 0.0032, [0.12, t + 0.0016, 0.035], 0, 22)
    for (const s of [-1, 1]) b.box('metal', '#c3c7cb', [0.008, 0.0032, 0.009], [s * 0.147, t + 0.0016, -0.03], 0, 0.0014)
    for (let i = 0; i < 6; i++) chip(b, 0.006 + (i % 3) * 0.002, 0.006, 0.0009, [0.05 + (i % 3) * 0.02, t, -0.03 + Math.floor(i / 3) * 0.022])
    jst(b, 4, [0.07, t, 0.03], 0, '#f0ead9')
    flex(b, [[-0.13, t + 0.001, 0.04], [-0.13, t + 0.001, 0.062], [-0.12, FLOOR + 0.0025, 0.07]], 0.014)
    smd(b, 24, -0.145, 0.145, -0.055, 0.055, t, 300, [[CPU.x, CPU.z + 0.05, 0.04, 0.034], [0.03, 0.02, 0.075, 0.035], [0, -0.03, 0.03, 0.035]])
  })
}

function bottom(b: GeoBuilder) {
  // D cover, upside down: outer face (feet, vents, screw holes) on top.
  b.box('metal', SHELL, [W, 0.0014, D], [0, 0, 0], 0, 0.0006)
  for (const s of [-1, 1]) b.box('metal', SHELL, [0.003, 0.009, D], [s * (W / 2 - 0.0015), -0.0045, 0])
  b.box('metal', SHELL, [W, 0.009, 0.003], [0, -0.0045, -D / 2 + 0.0015])
  b.box('metal', SHELL, [W, 0.005, 0.003], [0, -0.0025, D / 2 - 0.0015])
  for (const z of [-D / 2 + 0.025, D / 2 - 0.025]) b.box('matte', '#0f1011', [W - 0.07, 0.0024, 0.012], [0, 0.0016, z], 0, 0.001)
  slots(b, 0.09, -0.06, 0.0008, 5, 8, 0.0075, 0.0024, 0.0095, 0.0042)
  for (let i = 0; i < 14; i++) b.box('matte', '#0b0c0d', [0.0022, 0.0005, 0.03], [-0.03 + i * 0.0045, 0.0008, 0.06])
  b.box('satin', '#d9dadb', [0.05, 0.0002, 0.03], [-0.08, 0.0008, 0.0])
  for (let i = 0; i < 5; i++) b.box('matte', '#6a6d72', [0.035, 0.0001, 0.0012], [-0.083, 0.0009, -0.01 + i * 0.005])
}

const SCREWS: [number, number][] = [
  [-0.155, -0.105],
  [-0.05, -0.105],
  [0.05, -0.105],
  [0.155, -0.105],
  [-0.155, 0.105],
  [-0.05, 0.105],
  [0.05, 0.105],
  [0.155, 0.105],
  [0, -0.105],
  [0, 0.105],
]

function screws(b: GeoBuilder) {
  for (const [x, z] of SCREWS) screw(b, [x, 0.0002, z], 0.0024, 0, 0.0045, '#2c2e31')
}

function fan(b: GeoBuilder) {
  b.group([0, 0, 0], Math.PI / 2, () => blower(b, 0.033, 0.0068, 0.04))
  tube(b, 'gloss', '#c3262b', [[-0.02, 0.003, 0.025], [-0.03, 0.002, 0.04], [-0.04, 0.0, 0.05]], 0.0005, { radial: 4 })
  tube(b, 'gloss', '#141414', [[-0.018, 0.003, 0.025], [-0.028, 0.002, 0.04], [-0.038, 0.0, 0.05]], 0.0005, { radial: 4 })
  for (const [x, z] of [[0.03, 0.02], [-0.03, -0.03]] as const) screw(b, [x, 0.007, z], 0.002, 0, 0, '#2a2c2e')
}

function heatsink(b: GeoBuilder) {
  // Copper cold plate over the die (paste residue underneath), two flattened heat pipes, fin stack at the rear vent.
  b.box('metal', '#c6773f', [0.03, 0.0014, 0.024], [0, 0.0007, 0], 0, 0.0004)
  b.box('satin', '#8e9196', [0.02, 0.0002, 0.01], [0, -0.0001, -0.002])
  for (const a of [0.55, -0.55]) b.box('metal', '#a8adb2', [0.062, 0.0006, 0.005], [0, 0.0022, 0], a)
  for (const [x, z] of [[-0.026, -0.018], [0.026, -0.018], [-0.026, 0.018], [0.026, 0.018]] as const) {
    b.cyl('metal', '#a8adb2', 0.0032, 0.0032, 0.0006, [x, 0.0022, z], 0, 12)
    screw(b, [x, 0.0024, z], 0.0021, 0, 0.004, '#2a2c2e')
  }
  const pipe = (pts: [number, number, number][]) => tube(b, 'metal', K.copper, pts, 0.003, { scale: [1, 0.42, 1], radial: 10, seg: 40 })
  pipe([[-0.004, 0.005, 0.0], [0.04, 0.005, -0.01], [0.1, 0.005, -0.04], [0.135, 0.005, -0.06], [0.175, 0.005, -0.065]])
  pipe([[0.004, 0.006, 0.008], [0.05, 0.006, -0.004], [0.11, 0.006, -0.032], [0.15, 0.006, -0.052], [0.18, 0.006, -0.058]])
  for (let i = 0; i < 28; i++) b.box('metal', K.copper, [0.0004, 0.007, 0.01], [0.122 + i * 0.0021, 0.0035, -0.066])
  b.box('metal', K.copper, [0.062, 0.0004, 0.011], [0.15, 0.0072, -0.066])
}

function paste(b: GeoBuilder) {
  sphere(b, 'satin', '#9a9da1', 0.006, [0, 0, 0], [1.25, 0.28, 0.75], 14, 8)
  sphere(b, 'satin', '#a4a7ab', 0.003, [0.004, 0.0012, -0.002], [1.4, 0.5, 1], 10, 6)
  sphere(b, 'satin', '#8f9297', 0.0025, [-0.006, 0.0008, 0.002], [1.6, 0.4, 1], 10, 6)
}

function ssd(b: GeoBuilder) {
  // M.2 2280 NVMe, length along x.
  b.box('satin', '#151719', [0.08, 0.0008, 0.022], [0, 0.0004, 0])
  for (let i = 0; i < 9; i++) b.box('metal', K.gold, [0.0035, 0.00085, 0.0012], [-0.0385, 0.0004, -0.009 + i * 0.0022])
  chip(b, 0.012, 0.011, 0.0011, [-0.024, 0.0008, 0], { dot: false })
  chip(b, 0.014, 0.012, 0.0012, [-0.004, 0.0008, 0])
  chip(b, 0.014, 0.012, 0.0012, [0.016, 0.0008, 0])
  b.box('satin', '#2a2c2f', [0.05, 0.0001, 0.018], [0.004, 0.0022, 0])
  b.box('metal', K.copper, [0.03, 0.0001, 0.012], [0.004, 0.0023, 0])
  b.box('matte', '#c9ccd0', [0.008, 0.00012, 0.006], [-0.015, 0.0024, 0])
}

function ram(b: GeoBuilder) {
  // DDR4 SODIMM (67.6 x 30 mm), notch, gold fingers along the socket edge (-z).
  b.box('satin', '#1b5c3a', [0.0676, 0.001, 0.03], [0, 0.0005, 0])
  for (let i = 0; i < 34; i++) b.box('metal', K.gold, [0.0012, 0.00105, 0.004], [-0.032 + i * 0.00195, 0.0005, -0.013])
  for (let i = 0; i < 4; i++) chip(b, 0.011, 0.009, 0.0011, [-0.024 + i * 0.016, 0.001, 0.003])
  b.box('satin', '#f2f2ee', [0.02, 0.0002, 0.008], [0.01, 0.0022, 0.0105])
  smd(b, 51, -0.03, 0.03, -0.01, 0.012, 0.001, 16)
}

export const IT: ModelSpec = {
  id: 'it',
  replaces: ['laptop'],
  place: { pos: [LAPTOP_SEAT[0], LAPTOP_SEAT[1], LAPTOP_SEAT[2]], yaw: Math.PI / 2 },
  view: { az: -28, el: 34 },
  span: 0.35,
  parts: [
    { id: '_chassis', rank: 6, build: chassis },
    { id: 'paste', rank: 4, appear: true, build: paste, pos: [CPU.x, BOARD_Y + 0.0016 + 0.0024, CPU.z], xpos: [CPU.x, BOARD_Y + 0.0016 + 0.0024, CPU.z] },
    { id: 'heatsink', rank: 3, build: heatsink, pos: [CPU.x, BOARD_Y + 0.0045, CPU.z], xpos: [CPU.x - 0.03, BOARD_Y + 0.11, CPU.z + 0.0] },
    { id: 'fan', rank: 2, build: fan, pos: [0.115, BOARD_Y + 0.002, -0.07], xpos: [0.2, BOARD_Y + 0.08, -0.05] },
    { id: 'ram', rank: 1, build: ram, pos: [0.03, BOARD_Y + 0.0055, -0.02], xpos: [0.06, BOARD_Y + 0.07, 0.09], xrot: [0.45, 0, 0] },
    { id: 'ssd', rank: 1, build: ssd, pos: [-0.105, BOARD_Y + 0.0045, -0.05], rot: [0, Math.PI / 2, 0], xpos: [-0.21, BOARD_Y + 0.06, -0.02], xrot: [0, Math.PI / 2, 0.3] },
    { id: 'bottom', rank: 0, build: bottom, pos: [0, 0.0278, 0], via: [{ pos: [0, 0.11, 0], rot: [0, 0, 0] }, { pos: [0, 0.16, -0.26], rot: [0.6, 0, 0] }], xpos: [0, 0.125, -0.29], xrot: [1.15, 0, 0] },
    { id: '_screws', rank: 0, parent: 'bottom', build: screws, pos: [0, 0.0008, 0], xpos: [0, 0.035, 0] },
  ],
}
