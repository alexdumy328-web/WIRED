import type { GeoBuilder } from './builder'
import { LAPTOP_SEAT } from './Bench'
import { blower, chip, choke, flex, jst, K, pcb, screw, slots, smd, tube } from './devices/kit'
import type { ModelSpec } from './devices/types'
import { C, rng } from './materials'

/**
 * 14" ultrabook on the second bench, exploded bottom-up:
 *   bottom cover + screws, battery, motherboard, cooling fan, DC jack, keyboard deck, display panel, lid.
 * Authored with depth along x (user at +x) and width along z; `frontYaw` turns the front to +z.
 * When no device is singled out it sits assembled, lid open, on its stand.
 */
const D = 0.235 // depth (x)
const Wd = 0.33 // width (z)
const OPEN = 1.85 // lid angle when open (rad)
const GAP = 0.075
const SHELL = '#5a5f65'
const DECK = '#767b81'

const SCREWS: [number, number][] = [
  [-0.105, -0.155],
  [-0.105, -0.05],
  [-0.105, 0.05],
  [-0.105, 0.155],
  [0.105, -0.155],
  [0.105, -0.05],
  [0.105, 0.05],
  [0.105, 0.155],
  [0.0, -0.155],
  [0.0, 0.155],
]

function bottom(b: GeoBuilder) {
  b.box('metal', SHELL, [D, 0.0014, Wd], [0, 0.0007, 0], 0, 0.0006)
  b.box('metal', SHELL, [0.003, 0.0105, Wd], [-D / 2 + 0.0015, 0.0052, 0], 0, 0.001)
  b.box('metal', SHELL, [0.003, 0.005, Wd], [D / 2 - 0.0015, 0.0025, 0], 0, 0.001)
  for (const s of [-1, 1]) b.box('metal', SHELL, [D, 0.008, 0.003], [0, 0.004, s * (Wd / 2 - 0.0015)], 0, 0.001)
  // Black mylar insulation under the battery, intake grille under the fan, exhaust slots in the back wall.
  b.box('matte', '#111213', [0.09, 0.0002, 0.27], [0.055, 0.0015, 0])
  slots(b, -0.083, 0.11, 0.00145, 8, 5, 0.0024, 0.0075, 0.0042, 0.0095)
  for (let i = 0; i < 12; i++) b.box('matte', '#0b0c0d', [0.0034, 0.0045, 0.0022], [-D / 2 + 0.0015, 0.006, 0.083 + i * 0.0048])
  // Speaker grilles at the front corners.
  for (const s of [-1, 1]) slots(b, 0.09, s * 0.135, 0.00145, 6, 3, 0.002, 0.002, 0.004, 0.004)
  // Brass screw bosses.
  for (const [x, z] of SCREWS) {
    b.cyl('metal', K.brass, 0.0021, 0.0021, 0.0042, [x, 0.0021, z], 0, 10)
    b.cyl('matte', '#151515', 0.0009, 0.0009, 0.0043, [x, 0.0022, z], 0, 8)
  }
  // Rubber feet strips underneath.
  for (const x of [-D / 2 + 0.025, D / 2 - 0.025]) b.box('matte', '#0f1011', [0.012, 0.0024, Wd - 0.07], [x, -0.0009, 0], 0, 0.001)
}

function screws(b: GeoBuilder) {
  for (const [x, z] of SCREWS) screw(b, [x, -0.0006, z], 0.0024, [Math.PI, 0, 0], 0.0045, '#2c2e31')
}

function battery(b: GeoBuilder) {
  b.box('gloss', '#17181a', [0.085, 0.0068, 0.27], [0, 0.0034, 0], 0, 0.0016)
  for (const z of [-0.045, 0.045]) b.box('matte', '#0b0b0c', [0.086, 0.0002, 0.0016], [0, 0.0069, z])
  // Label, warnings, barcode.
  b.box('satin', '#e6e5df', [0.052, 0.0002, 0.082], [0.004, 0.00695, -0.07])
  for (let i = 0; i < 7; i++) b.box('matte', '#5b5e63', [0.032 - (i % 3) * 0.006, 0.0001, 0.0011], [-0.004, 0.00705, -0.1 + i * 0.0045])
  b.box('matte', C.yellow, [0.012, 0.0001, 0.012], [0.019, 0.00705, -0.05])
  b.box('matte', '#1b1b1b', [0.006, 0.00012, 0.006], [0.019, 0.00712, -0.05], Math.PI / 4)
  for (let i = 0; i < 16; i++) b.box('matte', '#202122', [0.012, 0.0001, 0.0004 + (i % 3) * 0.0003], [0.014, 0.00705, -0.1 + i * 0.0012])
  // Steel mounting tabs.
  for (const s of [-1, 1]) {
    b.box('metal', '#9aa0a5', [0.014, 0.0007, 0.014], [-0.03, 0.001, s * 0.142])
    b.cyl('matte', '#1a1a1a', 0.0018, 0.0018, 0.0009, [-0.03, 0.001, s * 0.144], 0, 10)
  }
  // Pack lead to its board connector.
  for (let i = 0; i < 6; i++) {
    const z = -0.03 + i * 0.0018
    tube(b, 'gloss', ['#c3262b', '#c3262b', '#141414', '#141414', '#e8e8e8', '#e6c02c'][i], [[-0.042, 0.004, z], [-0.05, 0.0045, z], [-0.056, 0.0035, z + 0.002]], 0.0006, { radial: 5 })
  }
  jst(b, 6, [-0.059, 0.001, -0.025], Math.PI / 2, '#f0ead9')
}

function board(b: GeoBuilder) {
  const keep: [number, number, number, number][] = [
    [-0.01, -0.03, 0.03, 0.05],
    [-0.01, 0.025, 0.024, 0.024],
    [0.03, 0.07, 0.026, 0.084],
    [0.03, -0.095, 0.014, 0.075],
  ]
  const t = pcb(b, { w: 0.115, d: 0.3, color: C.pcbGreen, seed: 42, keepOut: keep, traces: 520 })
  // CPU: green substrate, mirror-black die, tiny caps around.
  b.box('satin', '#255c3a', [0.026, 0.0012, 0.046], [-0.01, t + 0.0006, -0.03])
  b.box('gloss', '#1a1d24', [0.012, 0.0007, 0.031], [-0.01, t + 0.0015, -0.032])
  b.box('gloss', '#1a1d24', [0.008, 0.0007, 0.008], [-0.01, t + 0.0015, -0.008])
  smd(b, 3, -0.022, 0.002, -0.052, -0.008, t + 0.0012, 26, [[-0.01, -0.025, 0.014, 0.05]])
  // PCH
  b.box('satin', '#255c3a', [0.02, 0.0011, 0.02], [-0.01, t + 0.00055, 0.025])
  b.box('gloss', '#1a1d24', [0.0085, 0.0006, 0.0085], [-0.01, t + 0.0014, 0.025])
  // Soldered LPDDR packages.
  for (let i = 0; i < 4; i++) chip(b, 0.009, 0.013, 0.0011, [0.03, t, -0.122 + i * 0.016], { dot: true })
  // VRM: chokes and power stages.
  for (let i = 0; i < 5; i++) {
    choke(b, 0.0062, [-0.042, t, -0.105 + i * 0.0085])
    chip(b, 0.004, 0.005, 0.0008, [-0.032, t, -0.105 + i * 0.0085])
  }
  // M.2 2280 SSD with two NAND packages, controller, DRAM, label.
  b.group([0.03, t + 0.0022, 0.07], 0, () => {
    b.box('satin', '#151719', [0.022, 0.0008, 0.08], [0, 0, 0])
    for (let i = 0; i < 9; i++) b.box('metal', K.gold, [0.0012, 0.00085, 0.0035], [-0.009 + i * 0.0022, 0, -0.0385])
    chip(b, 0.011, 0.012, 0.0011, [0, 0.0004, -0.024], { dot: false })
    chip(b, 0.012, 0.014, 0.0012, [0, 0.0004, -0.004])
    chip(b, 0.012, 0.014, 0.0012, [0, 0.0004, 0.016])
    b.box('satin', '#2a2c2f', [0.018, 0.0001, 0.05], [0, 0.0018, 0.004])
    b.box('matte', '#c9ccd0', [0.008, 0.00012, 0.004], [-0.004, 0.0019, -0.012])
    screw(b, [0, 0.0004, 0.0395], 0.0022)
  })
  b.box('gloss', '#1a1a1b', [0.024, 0.0035, 0.005], [0.03, t + 0.0018, 0.029])
  // Connectors: battery, eDP, keyboard + touchpad ZIFs, fan, USB-C pair, USB-A.
  b.box('satin', '#f0ead9', [0.006, 0.004, 0.014], [0.052, t + 0.002, -0.022], 0, 0.0005)
  b.box('metal', '#babec3', [0.004, 0.0016, 0.015], [-0.048, t + 0.0008, -0.09])
  for (const z of [0.11, 0.045]) {
    b.box('gloss', '#e8d9b0', [0.004, 0.0013, 0.02], [0.046, t + 0.00065, z])
    b.box('gloss', '#141414', [0.0016, 0.0016, 0.02], [0.0485, t + 0.0012, z])
  }
  jst(b, 4, [-0.03, t, 0.095], 0, '#f0ead9')
  for (const x of [-0.04, -0.024]) {
    b.box('metal', '#c3c7cb', [0.009, 0.0032, 0.008], [x, t + 0.0016, -0.147], 0, 0.0014)
    b.box('matte', '#0c0c0c', [0.007, 0.0016, 0.0005], [x, t + 0.0016, -0.1512])
  }
  b.box('metal', '#c3c7cb', [0.014, 0.0055, 0.014], [-0.03, t + 0.00275, 0.145])
  b.box('gloss', '#2557c4', [0.011, 0.0011, 0.012], [-0.03, t + 0.0026, 0.146])
  // Coin cell in yellow kapton, BIOS flash, assorted controllers, decoupling everywhere.
  b.cyl('gloss', '#e5b43a', 0.0105, 0.0105, 0.0032, [0.034, t + 0.0016, 0.024], 0, 22)
  chip(b, 0.005, 0.0045, 0.0013, [0.004, t, 0.06], { pins: 4, pinSides: 2 })
  const r = rng(9)
  for (let i = 0; i < 9; i++) {
    const s = 0.004 + r() * 0.005
    chip(b, s, s, 0.0008, [-0.045 + r() * 0.06, t, 0.06 + r() * 0.07])
  }
  smd(b, 11, -0.054, 0.054, -0.145, 0.145, t, 240, keep)
  for (const [x, z] of [[-0.05, -0.12], [0.05, 0.13], [-0.05, 0.12], [0.05, -0.135]] as const) b.box('metal', K.gold, [0.006, 0.0002, 0.006], [x, t + 0.0001, z])
}

function fan(b: GeoBuilder) {
  b.group([-0.075, 0, 0.11], 0, () => blower(b, 0.031, 0.0065, 0.04))
  // Fin stack at the blower outlet.
  for (let i = 0; i < 26; i++) b.box('metal', K.copper, [0.008, 0.006, 0.00035], [-0.109, 0.0034, 0.081 + i * 0.0023])
  b.box('metal', K.copper, [0.0085, 0.0004, 0.062], [-0.109, 0.0066, 0.11])
  // Flattened copper heat pipes from CPU + PCH to the fins, cold plate, spring bracket.
  const pipe = (pts: [number, number, number][]) => tube(b, 'metal', K.copper, pts, 0.0028, { scale: [1, 0.42, 1], radial: 10, seg: 40 })
  pipe([[-0.06, 0.006, -0.05], [-0.064, 0.006, -0.01], [-0.07, 0.006, 0.04], [-0.094, 0.006, 0.075], [-0.108, 0.006, 0.09], [-0.109, 0.006, 0.14]])
  pipe([[-0.07, 0.007, -0.04], [-0.074, 0.007, 0.0], [-0.08, 0.007, 0.035], [-0.1, 0.007, 0.07], [-0.111, 0.007, 0.1]])
  b.box('metal', '#c6773f', [0.02, 0.0012, 0.034], [-0.065, 0.0004, -0.032], 0, 0.0004)
  b.box('metal', '#c6773f', [0.012, 0.0012, 0.012], [-0.065, 0.0004, 0.025], 0, 0.0004)
  for (const a of [0.5, -0.5]) b.box('metal', '#a8adb2', [0.05, 0.0006, 0.004], [-0.065, 0.0022, -0.032], a)
  for (const [x, z] of [[-0.084, -0.054], [-0.046, -0.054], [-0.084, -0.01], [-0.046, -0.01]] as const) {
    b.cyl('metal', '#a8adb2', 0.003, 0.003, 0.0006, [x, 0.0022, z], 0, 12)
    screw(b, [x, 0.0024, z], 0.0021, 0, 0, '#2a2c2e')
  }
  // Fan lead.
  tube(b, 'gloss', '#c3262b', [[-0.05, 0.004, 0.105], [-0.04, 0.003, 0.1], [-0.033, 0.002, 0.096]], 0.0005, { radial: 5 })
  tube(b, 'gloss', '#141414', [[-0.05, 0.004, 0.107], [-0.04, 0.003, 0.102], [-0.033, 0.002, 0.098]], 0.0005, { radial: 5 })
}

function dcJack(b: GeoBuilder) {
  b.box('gloss', '#18191b', [0.012, 0.0075, 0.014], [0, 0.00375, 0], 0, 0.001)
  b.cyl('metal', '#c3c7cb', 0.0028, 0.0028, 0.001, [0, 0.0042, -0.0072], [Math.PI / 2, 0, 0], 16)
  b.cyl('matte', '#050505', 0.0021, 0.0021, 0.0012, [0, 0.0042, -0.0074], [Math.PI / 2, 0, 0], 16)
  b.cyl('metal', K.gold, 0.0006, 0.0006, 0.0014, [0, 0.0042, -0.0074], [Math.PI / 2, 0, 0], 6)
  for (const s of [-1, 1]) b.box('metal', '#a9aeb3', [0.002, 0.0008, 0.006], [s * 0.0068, 0.0006, 0.002])
  for (const [i, c] of [[0, '#c3262b'], [1, '#141414']] as const)
    tube(b, 'gloss', c, [[-0.002 + i * 0.002, 0.004, 0.007], [-0.002 + i * 0.002, 0.004, 0.02], [0.01 + i * 0.002, 0.003, 0.03], [0.03 + i * 0.002, 0.0025, 0.032]], 0.0007, { radial: 5 })
  jst(b, 2, [0.034, 0, 0.032], Math.PI / 2, '#f0ead9')
}

function keyboard(b: GeoBuilder) {
  b.box('metal', DECK, [D, 0.0016, Wd], [0, 0.0008, 0], 0, 0.0007)
  b.box('matte', '#1a1b1d', [0.112, 0.0002, 0.292], [-0.04, 0.0017, 0])
  const kw = 0.0165
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 15; col++) {
      const fn = row === 0
      const space = row === 5 && col === 5
      if (row === 5 && col > 5 && col <= 9) continue
      const zw = space ? kw * 5 + 0.0028 * 4 : kw
      const x = -0.088 + row * 0.019 - (fn ? 0.004 : 0)
      const z = -0.135 + col * 0.0193 + (space ? kw * 2 + 0.0056 : 0)
      const xw = fn ? 0.008 : kw
      b.box('gloss', '#141516', [xw, 0.0013, zw], [x, 0.0024, z])
      b.box('satin', '#1e1f22', [xw - 0.0014, 0.0004, zw - 0.0014], [x, 0.0032, z])
      if (!space) b.box('satin', '#9a9ea3', [Math.min(0.0025, xw * 0.3), 0.00005, 0.0025], [x - (fn ? 0 : 0.003), 0.00345, z - 0.003])
    }
  // Touchpad, fingerprint power key, speaker grilles, status LED.
  b.box('satin', '#8e9399', [0.07, 0.0004, 0.115], [0.072, 0.0017, 0], 0, 0.0002)
  b.box('metal', '#5f6469', [0.0715, 0.0002, 0.1165], [0.072, 0.00155, 0])
  b.box('gloss', '#0d0e0f', [0.008, 0.0013, 0.012], [-0.096, 0.0024, 0.142])
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) for (let j = 0; j < 26; j++) b.box('matte', '#26282b', [0.0011, 0.0002, 0.0011], [-0.09 + j * 0.0042, 0.00168, s * (0.152 + i * 0.0032)])
  b.box('glow', '#f2f6ff', [0.0012, 0.0005, 0.003], [D / 2 - 0.004, 0.0012, 0.12])
  // Underside: keyboard backplate and its amber flex tail.
  b.box('metal', '#2b2d30', [0.108, 0.0006, 0.285], [-0.04, -0.0003, 0])
  flex(b, [[0.018, -0.0006, 0.105], [0.035, -0.0018, 0.11], [0.042, -0.0045, 0.11]], 0.016)
  flex(b, [[0.06, -0.0003, 0.04], [0.06, -0.003, 0.045]], 0.01)
}

function lid(b: GeoBuilder) {
  b.box('metal', SHELL, [D, 0.0045, Wd], [D / 2, 0.004, 0], 0, 0.0015)
  for (const s of [-1, 1]) b.cyl('metal', '#2a2c2f', 0.0045, 0.0045, 0.05, [0.001, 0, s * 0.11], [Math.PI / 2, 0, 0], 12)
  b.box('matte', '#202124', [0.004, 0.003, Wd - 0.08], [0.002, 0.0016, 0])
  // Inside the lid (seen once the panel lifts off): antennas, webcam module, their leads.
  for (const s of [-1, 1]) {
    b.box('matte', '#121314', [0.03, 0.0004, 0.012], [D - 0.022, 0.0016, s * 0.06])
    b.box('metal', K.copper, [0.02, 0.0002, 0.006], [D - 0.022, 0.0013, s * 0.06])
    tube(b, 'gloss', s > 0 ? '#2a2a2b' : '#cfd2d4', [[D - 0.035, 0.0013, s * 0.06], [D * 0.5, 0.0013, s * 0.075], [0.02, 0.0013, s * 0.07]], 0.0005, { radial: 4 })
  }
  b.box('satin', C.pcbGreen, [0.006, 0.0008, 0.04], [D - 0.006, 0.0013, 0])
  b.cyl('gloss', '#090909', 0.0018, 0.0018, 0.0016, [D - 0.006, 0.0006, 0], 0, 14)
}

function screen(b: GeoBuilder) {
  // Panel frame: screen side faces -y.
  b.box('metal', '#aeb3b8', [D - 0.008, 0.0026, Wd - 0.008], [0, 0.0005, 0], 0, 0.0005)
  b.box('gloss', '#0c0d0f', [D - 0.006, 0.0008, Wd - 0.006], [0, -0.0013, 0], 0, 0.0003)
  const y = -0.00176
  b.box('glow', '#1d4a7d', [D - 0.03, 0.0001, Wd - 0.02], [0.004, y, 0])
  b.box('glow', '#2d6aa5', [0.09, 0.0001, 0.2], [0.04, y - 0.00003, 0.03])
  // App window: title bar, sidebar, text lines, gold accent card.
  b.box('glow', '#e9eef4', [0.12, 0.0001, 0.17], [0.012, y - 0.00006, -0.035])
  b.box('glow', '#b7c4d2', [0.012, 0.0001, 0.17], [0.066, y - 0.00009, -0.035])
  b.box('glow', '#d5dde6', [0.106, 0.0001, 0.035], [0.006, y - 0.00009, -0.104])
  for (let i = 0; i < 7; i++) b.box('glow', '#7d8a98', [0.0028, 0.0001, 0.07 + (i % 3) * 0.02], [0.045 - i * 0.009, y - 0.00009, -0.01])
  b.box('glow', '#d9a93f', [0.03, 0.0001, 0.05], [-0.03, y - 0.00009, 0.015])
  // Taskbar + icons.
  b.box('glow', '#0f1a29', [0.008, 0.0001, Wd - 0.02], [-0.0985, y - 0.00006, 0])
  for (let i = 0; i < 7; i++) b.box('glow', ['#5ab0ff', '#f2f2f2', '#ffcc4d', '#7be08f'][i % 4], [0.004, 0.0001, 0.004], [-0.0985, y - 0.00009, -0.03 + i * 0.009])
  // Webcam in the top bezel, eDP flex and the T-con board on the back.
  b.cyl('gloss', '#000000', 0.0013, 0.0013, 0.0004, [D / 2 - 0.006, -0.0018, 0], 0, 12)
  b.box('satin', C.pcbGreen, [0.012, 0.0008, 0.24], [-0.1, 0.0022, 0])
  for (let i = 0; i < 4; i++) b.box('gloss', '#121314', [0.006, 0.0008, 0.012], [-0.1, 0.0029, -0.08 + i * 0.05])
  flex(b, [[-0.096, 0.0025, 0.05], [-0.112, 0.0035, 0.05], [-0.118, 0.006, 0.05]], 0.011)
}

export const LAPTOP: ModelSpec = {
  id: 'laptop',
  frontYaw: -Math.PI / 2,
  idle: true,
  place: { pos: [LAPTOP_SEAT[0], LAPTOP_SEAT[1], LAPTOP_SEAT[2]], yaw: Math.PI / 2 },
  view: { az: -32, el: 24 },
  parts: [
    { id: 'bottom', rank: 6, build: bottom },
    { id: '_screws', rank: 5, build: screws, xpos: [0, -0.05, 0] },
    { id: 'battery', rank: 5, build: battery, pos: [0.055, 0.0015, 0], xpos: [0.03, 0.0015 + GAP, 0] },
    { id: 'board', rank: 4, build: board, pos: [-0.055, 0.0027, 0], xpos: [-0.08, 0.0027 + GAP * 2, 0] },
    { id: 'fan', rank: 3, build: fan, pos: [0, 0.0045, 0], xpos: [-0.03, 0.0045 + GAP * 2.75, 0] },
    { id: 'dcJack', rank: 3, build: dcJack, pos: [-0.09, 0.0015, -0.152], xpos: [-0.07, 0.0015 + GAP * 2, -0.25] },
    { id: 'keyboard', rank: 2, build: keyboard, pos: [0, 0.0115, 0], xpos: [-0.105, 0.0115 + GAP * 3.6, 0] },
    {
      id: 'lid',
      rank: 0,
      build: lid,
      pos: [-D / 2, 0.0205, 0],
      rot: [0, 0, OPEN],
      xpos: [-D / 2 - 0.16, 0.0205 + GAP * 5.4 + 0.05, 0],
      xrot: [0, 0, -0.22],
    },
    { id: 'screen', rank: 1, parent: 'lid', build: screen, pos: [D / 2, -0.0035, 0], xpos: [D / 2, -0.0035 - GAP * 1.05, 0], xrot: [Math.PI, 0, 0] },
  ],
}
