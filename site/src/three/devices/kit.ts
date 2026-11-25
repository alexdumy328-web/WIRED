import {
  CatmullRomCurve3,
  Color,
  Euler,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  Quaternion,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type ColorRepresentation,
} from 'three'
import type { Bucket, GeoBuilder, Paint, Rot, V3 } from '../builder'
import { C, rng } from '../materials'

/**
 * Detail kit for the exploded devices: screws, PCBs with traces, chips,
 * capacitors, fans, fins, cables. Everything goes through the GeoBuilder, so
 * a part with hundreds of pieces still costs one draw call per material.
 */

export const K = {
  black: '#141517',
  plastic: '#1d1f22',
  rubber: '#121213',
  steel: '#c9cdd1',
  chrome: '#e4e7ea',
  alu: '#b7bcc1',
  darkAlu: '#4a4e53',
  copper: C.copper,
  brass: '#c9a64a',
  gold: C.gold,
  solder: '#cfd3d6',
  kapton: '#c8862a',
  pcbGreen: C.pcbGreen,
  pcbBlue: C.pcbBlue,
  phenolic: '#8a5a2b',
  silk: '#eef0ea',
  white: '#eceeef',
} as const

const _c = new Color()
export function shade(c: ColorRepresentation, k: number): string {
  _c.set(c)
  if (k >= 1) _c.lerp(new Color('#ffffff'), Math.min(1, k - 1))
  else _c.multiplyScalar(k)
  return `#${_c.getHexString()}`
}

/** Tube along a smooth curve through `pts`. */
export function tube(b: GeoBuilder, bucket: Bucket, paint: Paint, pts: V3[], r: number, o: { seg?: number; radial?: number; closed?: boolean; scale?: V3; pos?: V3 } = {}) {
  const curve = new CatmullRomCurve3(
    pts.map((p) => new Vector3(p[0], p[1], p[2])),
    o.closed ?? false,
    'catmullrom',
    0.5,
  )
  b.add(bucket, new TubeGeometry(curve, o.seg ?? Math.max(8, pts.length * 10), r, o.radial ?? 7, o.closed ?? false), paint, o.pos ?? [0, 0, 0], 0, o.scale ?? 1)
}

/** Surface of revolution around local Y. Profile = [radius, y] pairs. */
export function lathe(b: GeoBuilder, bucket: Bucket, paint: Paint, profile: [number, number][], pos: V3 = [0, 0, 0], rot: Rot = 0, seg = 32, scale: number | V3 = 1) {
  b.add(bucket, new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(0, r), y)), seg), paint, pos, rot, scale)
}

export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0): Shape {
  const s = new Shape()
  const x = cx - w / 2
  const y = cy - h / 2
  const rr = Math.min(r, w / 2, h / 2)
  s.moveTo(x + rr, y)
  s.lineTo(x + w - rr, y)
  s.quadraticCurveTo(x + w, y, x + w, y + rr)
  s.lineTo(x + w, y + h - rr)
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  s.lineTo(x + rr, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - rr)
  s.lineTo(x, y + rr)
  s.quadraticCurveTo(x, y, x + rr, y)
  return s
}

export function circlePath(r: number, cx = 0, cy = 0, ccw = true): Path {
  const p = new Path()
  p.absarc(cx, cy, r, 0, Math.PI * 2, !ccw)
  return p
}

export function roundRectPath(w: number, h: number, r: number, cx = 0, cy = 0): Path {
  const s = roundRect(w, h, r, cx, cy)
  const p = new Path(s.getPoints(4).reverse())
  return p
}

/** Extrude a 2D shape (XY plane) along +Z, centred on its depth. */
export function extrude(b: GeoBuilder, bucket: Bucket, paint: Paint, shape: Shape, depth: number, pos: V3 = [0, 0, 0], rot: Rot = 0, bevel = 0, curveSegments = 10) {
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  })
  g.translate(0, 0, -(depth - bevel * 2) / 2)
  b.add(bucket, g, paint, pos, rot)
}

export function sphere(b: GeoBuilder, bucket: Bucket, paint: Paint, r: number, pos: V3, scale: number | V3 = 1, ws = 10, hs = 7) {
  b.add(bucket, new SphereGeometry(r, ws, hs), paint, pos, 0, scale)
}

/** Pan-head Phillips screw, head on +y. `shank` > 0 adds the thread below. */
export function screw(b: GeoBuilder, pos: V3, r = 0.0028, rot: Rot = 0, shank = 0, color: string = K.steel) {
  b.group(pos, rot, () => {
    lathe(b, 'metal', color, [[0, 0], [r, 0], [r, r * 0.35], [r * 0.75, r * 0.62], [0, r * 0.7]], [0, 0, 0], 0, 12)
    b.box('matte', '#2a2c2e', [r * 1.25, r * 0.18, r * 0.26], [0, r * 0.66, 0])
    b.box('matte', '#2a2c2e', [r * 0.26, r * 0.18, r * 1.25], [0, r * 0.66, 0])
    if (shank > 0) {
      b.cyl('metal', shade(color, 0.85), r * 0.45, r * 0.38, shank, [0, -shank / 2, 0], 0, 8)
      for (let i = 1; i < shank / (r * 0.45); i++) b.cyl('metal', shade(color, 0.75), r * 0.52, r * 0.52, r * 0.12, [0, -i * r * 0.45, 0], 0, 8)
    }
  })
}

/** Hex socket / Torx bolt head (car + appliance parts). */
export function bolt(b: GeoBuilder, pos: V3, r = 0.004, rot: Rot = 0, color: string = K.steel) {
  b.group(pos, rot, () => {
    b.cyl('metal', color, r, r, r * 0.8, [0, r * 0.4, 0], 0, 6)
    b.cyl('metal', shade(color, 0.92), r * 1.25, r * 1.25, r * 0.2, [0, r * 0.1, 0], 0, 14)
    b.cyl('matte', '#26282a', r * 0.42, r * 0.42, r * 0.1, [0, r * 0.82, 0], 0, 6)
  })
}

export type PcbOpts = {
  w: number
  d: number
  t?: number
  color?: string
  seed?: number
  traces?: number
  vias?: number
  silk?: number
  holes?: boolean
  /** Rects [x, z, w, d] the traces should avoid (component footprints). */
  keepOut?: [number, number, number, number][]
  edge?: string
}

/** Board lying in XZ, bottom at y = 0, top at y = t. Traces, vias, silkscreen, plated holes. */
export function pcb(b: GeoBuilder, o: PcbOpts): number {
  const t = o.t ?? 0.0016
  const col = o.color ?? K.pcbGreen
  const r = rng(o.seed ?? 1)
  const edge = o.edge ?? shade(col, 0.6)
  b.box('satin', (n) => (Math.abs(n.y) > 0.7 ? col : edge), [o.w, t, o.d], [0, t / 2, 0])
  const y = t + 0.00004
  const tr = shade(col, 1.07)
  const inKeep = (x: number, z: number) => (o.keepOut ?? []).some(([kx, kz, kw, kd]) => Math.abs(x - kx) < kw / 2 && Math.abs(z - kz) < kd / 2)
  const hw = o.w / 2 - 0.003
  const hd = o.d / 2 - 0.003
  const nTr = o.traces ?? Math.round((o.w * o.d) / 0.00004)
  for (let i = 0; i < nTr; i++) {
    let x = (r() * 2 - 1) * hw
    let z = (r() * 2 - 1) * hd
    const wdt = 0.00035 + r() * 0.0006
    const legs = 2 + Math.floor(r() * 3)
    let horiz = r() > 0.5
    for (let k = 0; k < legs; k++) {
      const len = 0.004 + r() * Math.min(o.w, o.d) * 0.28
      const nx = horiz ? Math.max(-hw, Math.min(hw, x + (r() > 0.5 ? len : -len))) : x
      const nz = horiz ? z : Math.max(-hd, Math.min(hd, z + (r() > 0.5 ? len : -len)))
      if (inKeep((x + nx) / 2, (z + nz) / 2)) break
      const lx = Math.abs(nx - x) + wdt
      const lz = Math.abs(nz - z) + wdt
      b.box('satin', tr, [lx, 0.00006, lz], [(x + nx) / 2, y, (z + nz) / 2])
      x = nx
      z = nz
      horiz = !horiz
    }
    if (r() > 0.55) b.cyl('metal', K.gold, 0.0007, 0.0007, 0.00008, [x, y + 0.00002, z], 0, 8)
  }
  const nV = o.vias ?? Math.round(nTr * 0.6)
  for (let i = 0; i < nV; i++) {
    const x = (r() * 2 - 1) * hw
    const z = (r() * 2 - 1) * hd
    if (inKeep(x, z)) continue
    b.cyl('metal', r() > 0.3 ? K.gold : K.solder, 0.00055, 0.00055, 0.00008, [x, y, z], 0, 6)
  }
  // Silkscreen: component outlines and reference designator dashes.
  const nS = o.silk ?? Math.round(nTr * 0.25)
  for (let i = 0; i < nS; i++) {
    const x = (r() * 2 - 1) * hw
    const z = (r() * 2 - 1) * hd
    if (inKeep(x, z)) continue
    if (r() > 0.5) {
      const sw = 0.003 + r() * 0.006
      const sd = 0.002 + r() * 0.005
      for (const [a, c, ww, dd] of [
        [0, -sd / 2, sw, 0.0003],
        [0, sd / 2, sw, 0.0003],
        [-sw / 2, 0, 0.0003, sd],
        [sw / 2, 0, 0.0003, sd],
      ] as const)
        b.box('matte', K.silk, [ww, 0.00005, dd], [x + a, y + 0.00002, z + c])
    } else {
      for (let k = 0; k < 3; k++) b.box('matte', K.silk, [0.0009, 0.00005, 0.0004 + r() * 0.0006], [x + k * 0.0013, y + 0.00002, z])
    }
  }
  if (o.holes !== false)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const hx = sx * (o.w / 2 - 0.006)
        const hz = sz * (o.d / 2 - 0.006)
        b.cyl('metal', K.gold, 0.0032, 0.0032, t + 0.0002, [hx, t / 2, hz], 0, 16)
        b.cyl('matte', '#0c0c0d', 0.0016, 0.0016, t + 0.0004, [hx, t / 2, hz], 0, 12)
      }
  return t
}

/** Black IC package with gull-wing pins; `pins` per side (0 = QFN/BGA look). Sits on y = 0. */
export function chip(b: GeoBuilder, w: number, d: number, h: number, pos: V3, o: { pins?: number; pinSides?: 2 | 4; rot?: number; body?: string; dot?: boolean } = {}) {
  b.group(pos, o.rot ?? 0, () => {
    b.box('gloss', o.body ?? '#141516', [w, h, d], [0, h / 2 + 0.0002, 0], 0, Math.min(w, d, h) * 0.12)
    if (o.dot !== false) b.cyl('satin', '#3a3c40', Math.min(w, d) * 0.07, Math.min(w, d) * 0.07, 0.00006, [-w / 2 + Math.min(w, d) * 0.16, h + 0.0002, -d / 2 + Math.min(w, d) * 0.16], 0, 8)
    // Faint laser marking lines.
    for (let i = 0; i < 2; i++) b.box('satin', '#4a4d52', [w * (0.55 - i * 0.18), 0.00005, Math.min(d * 0.07, 0.0006)], [0, h + 0.0002, -d * 0.06 + i * d * 0.16])
    const n = o.pins ?? 0
    if (n > 0) {
      const sides = o.pinSides ?? 4
      const pitchW = w / (n + 1)
      const pitchD = d / (n + 1)
      const pl = Math.min(w, d) * 0.12
      for (let i = 1; i <= n; i++) {
        for (const s of [-1, 1]) {
          b.box('metal', K.solder, [pitchW * 0.45, 0.00025, pl], [-w / 2 + i * pitchW, 0.00025, s * (d / 2 + pl / 2)])
          if (sides === 4) b.box('metal', K.solder, [pl, 0.00025, pitchD * 0.45], [s * (w / 2 + pl / 2), 0.00025, -d / 2 + i * pitchD])
        }
      }
    }
  })
}

/** Scatter of 0402/0603 resistors + MLCCs inside a rect, sitting on y. */
export function smd(b: GeoBuilder, seed: number, x0: number, x1: number, z0: number, z1: number, y: number, n: number, avoid: [number, number, number, number][] = []) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0)
    const z = z0 + r() * (z1 - z0)
    if (avoid.some(([ax, az, aw, ad]) => Math.abs(x - ax) < aw / 2 && Math.abs(z - az) < ad / 2)) continue
    const big = r() > 0.75
    const l = big ? 0.0016 : 0.001
    const wd = l * 0.5
    const rotd = r() > 0.5
    const kind = r()
    const body = kind > 0.55 ? '#b49067' : kind > 0.25 ? '#151515' : '#6f6a5f'
    b.group([x, y, z], rotd ? Math.PI / 2 : 0, () => {
      b.box('satin', body, [l * 0.62, wd * 0.9, wd], [0, wd * 0.45, 0])
      for (const s of [-1, 1]) b.box('metal', K.solder, [l * 0.2, wd * 0.95, wd * 1.02], [s * l * 0.4, wd * 0.47, 0])
    })
  }
}

/** Aluminium electrolytic capacitor standing on y = 0 (sleeve, stripe, scored top). */
export function elcap(b: GeoBuilder, r: number, h: number, pos: V3, sleeve = '#1e3f99', stripe = '#cdd5e6', top = '#c4c8cc') {
  b.group(pos, 0, () => {
    b.cyl('gloss', (_n, p) => (Math.atan2(p.z, p.x) > 2.2 ? stripe : sleeve), r, r, h * 0.93, [0, h * 0.465, 0], 0, 18)
    b.cyl('gloss', sleeve, r * 0.97, r * 0.97, h * 0.04, [0, h * 0.06, 0], 0, 18)
    b.cyl('metal', top, r * 0.9, r * 0.9, h * 0.07, [0, h * 0.95, 0], 0, 18)
    b.box('matte', '#55585c', [r * 1.4, h * 0.02, r * 0.1], [0, h * 0.99, 0])
    b.box('matte', '#55585c', [r * 0.1, h * 0.02, r * 1.4], [0, h * 0.99, 0])
  })
}

/** Solid-polymer cap: bare aluminium can with a coloured top band. */
export function polycap(b: GeoBuilder, r: number, h: number, pos: V3, band = '#6b2fb3') {
  b.cyl('metal', K.alu, r, r, h * 0.85, [pos[0], pos[1] + h * 0.425, pos[2]], 0, 14)
  b.cyl('satin', band, r * 1.01, r * 1.01, h * 0.16, [pos[0], pos[1] + h * 0.92, pos[2]], 0, 14)
  b.box('satin', '#1b1b1c', [r * 2.3, h * 0.08, r * 2.3], [pos[0], pos[1] + h * 0.04, pos[2]])
}

/** SMD power inductor / choke: dark grey cube with a lighter top. */
export function choke(b: GeoBuilder, s: number, pos: V3) {
  b.box('satin', (n) => (n.y > 0.7 ? '#5c6066' : '#2c2e31'), [s, s * 0.55, s], [pos[0], pos[1] + s * 0.275, pos[2]], 0, s * 0.08)
  b.box('metal', K.solder, [s * 0.95, s * 0.1, s * 0.24], [pos[0], pos[1] + s * 0.05, pos[2] + s * 0.38])
}

/** Header pins (2.54 mm) in rows, base on y = 0. */
export function header(b: GeoBuilder, cols: number, rows: number, pos: V3, rot = 0, pitch = 0.00254, h = 0.0085) {
  b.group(pos, rot, () => {
    b.box('gloss', '#151617', [cols * pitch, 0.0025, rows * pitch], [0, 0.00125, 0])
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) b.box('metal', K.gold, [0.00064, h, 0.00064], [(i - (cols - 1) / 2) * pitch, h / 2, (j - (rows - 1) / 2) * pitch])
  })
}

/** Plastic wire-to-board connector (JST-like) with coloured wires leaving along +z. */
export function jst(b: GeoBuilder, pins: number, pos: V3, rot = 0, body = '#efe9d8', wires: string[] = [], len = 0.02) {
  const p = 0.002
  b.group(pos, rot, () => {
    b.box('satin', body, [pins * p + 0.0015, 0.005, 0.0045], [0, 0.0025, 0], 0, 0.0004)
    for (let i = 0; i < pins; i++) {
      const x = (i - (pins - 1) / 2) * p
      b.box('matte', '#2a2a2a', [p * 0.55, 0.0035, 0.0008], [x, 0.0028, 0.0022])
      const c = wires[i % Math.max(1, wires.length)]
      if (c) tube(b, 'gloss', c, [[x, 0.0028, 0.0025], [x, 0.003, 0.006 + len * 0.3], [x * 1.4, 0.0035, len]], 0.00055, { radial: 5, seg: 10 })
    }
  })
}

/** Flat flex cable (FFC) from a to b with an optional fold; amber kapton with gold contacts. */
export function flex(b: GeoBuilder, pts: V3[], w: number, color: string = K.kapton) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const c = pts[i + 1]
    const dx = c[0] - a[0]
    const dy = c[1] - a[1]
    const dz = c[2] - a[2]
    const len = Math.hypot(dx, dy, dz)
    const yaw = Math.atan2(dx, dz)
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz))
    b.group([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], [0, yaw, 0], () => {
      b.box('gloss', color, [w, 0.00025, len + 0.0004], [0, 0, 0], [pitch, 0, 0])
    })
  }
}

/** Axial fan facing +z, centred. Square frame with rounded corners, 7 blades, hub. */
export function axialFan(
  b: GeoBuilder,
  size: number,
  depth: number,
  o: { frame?: string; blade?: string; hub?: string; blades?: number; ring?: string; seed?: number } = {},
) {
  const frame = o.frame ?? '#1a1b1d'
  const s = roundRect(size, size, size * 0.09)
  s.holes.push(circlePath(size * 0.475))
  for (const cx of [-1, 1]) for (const cy of [-1, 1]) s.holes.push(circlePath(size * 0.035, cx * size * 0.41, cy * size * 0.41))
  extrude(b, 'satin', frame, s, depth, [0, 0, 0], 0, 0, 24)
  // Rear struts + motor hub.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    b.box('satin', frame, [size * 0.46, size * 0.03, depth * 0.18], [Math.cos(a) * size * 0.25, Math.sin(a) * size * 0.25, -depth * 0.4], [0, 0, a])
  }
  b.cyl('satin', frame, size * 0.19, size * 0.19, depth * 0.2, [0, 0, -depth * 0.4], [Math.PI / 2, 0, 0], 20)
  const n = o.blades ?? 7
  const blade = o.blade ?? '#2b2d30'
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    b.group([0, 0, depth * 0.05], [0, 0, a], () => {
      b.box('satin', blade, [size * 0.29, size * 0.16, size * 0.012], [size * 0.31, 0, 0], [0.55, 0, 0.18], size * 0.004)
    })
  }
  b.cyl('satin', o.hub ?? '#202124', size * 0.16, size * 0.16, depth * 0.62, [0, 0, depth * 0.08], [Math.PI / 2, 0, 0], 22)
  b.cyl('gloss', '#d7d9db', size * 0.11, size * 0.11, 0.0004, [0, 0, depth * 0.39 + 0.0002], [Math.PI / 2, 0, 0], 22)
  if (o.ring) b.torus('glow', o.ring, size * 0.47, size * 0.006, [0, 0, depth * 0.5], 0, 40)
}

/** Laptop blower fan, axis along +y, outlet toward -x. Base on y = 0. */
export function blower(b: GeoBuilder, r: number, h: number, outlet = 0.035) {
  const s = new Shape()
  s.absarc(0, 0, r, -Math.PI * 0.5, Math.PI * 1.05, false)
  s.lineTo(-r - 0.002, r * 0.28)
  s.lineTo(-r - 0.002, -r * 0.2 - outlet * 0.3)
  s.lineTo(-r * 0.2, -r - 0.004)
  s.closePath()
  // Housing: floor + wall, as a solid extrude with the wheel cavity cut from the top plate.
  const wall = new Shape(s.getPoints(20))
  wall.holes.push(circlePath(r - 0.0015))
  b.add('satin', extrudeGeo(wall, h), '#18191b', [0, h / 2, 0], [-Math.PI / 2, 0, 0])
  b.add('satin', extrudeGeo(new Shape(s.getPoints(20)), 0.0006), '#18191b', [0, 0.0003, 0], [-Math.PI / 2, 0, 0])
  // Top plate (thin steel) with intake hole.
  const top = new Shape(s.getPoints(20))
  top.holes.push(circlePath(r * 0.62))
  b.add('metal', extrudeGeo(top, 0.0004), '#8d9298', [0, h + 0.0002, 0], [-Math.PI / 2, 0, 0])
  // Impeller: hub + many thin curved blades.
  b.cyl('satin', '#232427', r * 0.42, r * 0.42, h * 0.8, [0, h * 0.45, 0], 0, 20)
  b.cyl('gloss', '#c8ccd0', r * 0.28, r * 0.28, 0.0003, [0, h * 0.86, 0], 0, 18)
  const n = 33
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    b.box('satin', '#2a2b2e', [r * 0.5, h * 0.78, 0.00045], [Math.cos(a) * r * 0.69, h * 0.44, Math.sin(a) * r * 0.69], -a + 0.35)
  }
}

export function extrudeGeo(shape: Shape, depth: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 })
  g.translate(0, 0, -depth / 2)
  return g
}

/** Stack of thin fins along x (pitch), each fin w (y) x d (z). */
export function fins(b: GeoBuilder, n: number, pitch: number, h: number, d: number, pos: V3, color: string = K.alu, t = 0.0004, bucket: Bucket = 'metal') {
  for (let i = 0; i < n; i++) b.box(bucket, color, [t, h, d], [pos[0] + (i - (n - 1) / 2) * pitch, pos[1], pos[2]])
}

/** Cable bundle: several thin wires following a path with small offsets, tape wraps every few cm. */
export function harness(b: GeoBuilder, pts: V3[], colors: string[], r = 0.0012, tape = '#0f0f10') {
  const n = colors.length
  colors.forEach((c, i) => {
    const a = (i / n) * Math.PI * 2
    const off = r * 1.25
    tube(
      b,
      'gloss',
      c,
      pts.map((p, k) => [p[0] + Math.cos(a + k * 0.7) * off, p[1] + Math.sin(a + k * 0.7) * off, p[2]] as V3),
      r,
      { radial: 5 },
    )
  })
  for (let k = 1; k < pts.length - 1; k++) b.cyl('matte', tape, r * 2.9, r * 2.9, r * 4, pts[k], dirRot(pts[k - 1], pts[k + 1]), 10)
}

/** Euler (XYZ) that turns local +y toward the a->c direction. */
export function dirRot(a: V3, c: V3): V3 {
  const d = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize()
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d)
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return [e.x, e.y, e.z]
}

/** Knurled knob (aluminium cap + skirt), axis along +z, back face at z = 0. */
export function knob(b: GeoBuilder, r: number, h: number, pos: V3, o: { color?: string; skirt?: string; line?: string; rot?: Rot } = {}) {
  b.group(pos, o.rot ?? 0, () => {
    const c = o.color ?? '#d6d9dc'
    lathe(b, 'metal', c, [[0, 0], [r * 1.18, 0], [r * 1.18, h * 0.22], [r, h * 0.28], [r, h * 0.92], [r * 0.9, h], [0, h]], [0, 0, 0], [Math.PI / 2, 0, 0], 28)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      b.box('metal', shade(c, 0.82), [r * 0.08, r * 0.08, h * 0.6], [Math.cos(a) * r, Math.sin(a) * r, h * 0.6])
    }
    if (o.skirt) b.cyl('satin', o.skirt, r * 1.2, r * 1.2, h * 0.08, [0, 0, h * 0.04], [Math.PI / 2, 0, 0], 28)
    b.box('matte', o.line ?? '#1b1c1e', [r * 0.12, r * 0.7, 0.0004], [0, r * 0.45, h + 0.0002])
  })
}

/** Grid of dark slots (vents) on a face lying in XZ at height y. */
export function slots(b: GeoBuilder, cx: number, cz: number, y: number, cols: number, rows: number, sw: number, sd: number, gx: number, gz: number, color = '#0b0c0d') {
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) b.box('matte', color, [sw, 0.0004, sd], [cx + (i - (cols - 1) / 2) * gx, y, cz + (j - (rows - 1) / 2) * gz], 0, Math.min(sw, sd) * 0.45)
}
