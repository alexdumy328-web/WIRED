import { Box3, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { GeoBuilder, type Bucket } from '../builder'
import { MODEL_PARTS, type ModelId } from '../contract'
import type { ModelSpec, PartSpec } from './types'
import { LAPTOP } from '../ExplodedLaptop'
import { PC } from './pc'
import { BOARD } from './board'
import { COFFEE_MACHINE } from './coffee'
import { BLENDER } from './appliance'
import { IT } from './it'
import { AUTO } from './auto'
import { WASHER } from './washer'
import { VINTAGE } from './vintage'

export const SPECS: Record<ModelId, ModelSpec> = {
  laptop: LAPTOP,
  pc: PC,
  board: BOARD,
  coffee: COFFEE_MACHINE,
  appliance: BLENDER,
  it: IT,
  auto: AUTO,
  largeAppliance: WASHER,
  vintage: VINTAGE,
}

/** Explode timing: ~1.2 s apart, ~0.5 s back together; each part animates over SPAN of the timeline. */
export const EXPLODE_TIME = 1.2
export const ASSEMBLE_TIME = 0.5
const SPAN = 0.5

export type PartAsset = {
  spec: PartSpec
  index: number
  parent: number
  /** Part id used for highlighting (own id, or the parent's for `_` pieces). */
  hi: string | null
  geos: [Bucket, BufferGeometry][]
  /** Geometry bounds in the part's pivot space. */
  box: Box3
  start: number
  /** Share of the timeline this part spends moving. */
  span: number
  /** Pose keys along the path: assembled, waypoints, exploded. */
  keysP: Vector3[]
  keysR: Euler[]
  posA: Vector3
  posE: Vector3
  rotA: Euler
  rotE: Euler
}

export type ModelAsset = {
  spec: ModelSpec
  parts: PartAsset[]
  /** Bounds in model space (front = +z, frontYaw applied), assembled and exploded. */
  boxA: Box3
  boxE: Box3
  /** Every part's 8 box corners in model space, assembled / exploded (same order). Used for tight camera fits. */
  ptsA: Vector3[]
  ptsE: Vector3[]
}

const cache = new Map<ModelId, ModelAsset>()

const v3 = (a?: readonly number[], d = 0) => new Vector3(a?.[0] ?? d, a?.[1] ?? d, a?.[2] ?? d)

function build(fn: (b: GeoBuilder) => void): [Bucket, BufferGeometry][] {
  const b = new GeoBuilder()
  fn(b)
  return [...b.build()]
}

const _q = new Quaternion()
const _one = new Vector3(1, 1, 1)

function partMatrix(parts: PartAsset[], i: number, exploded: boolean, out: Matrix4): Matrix4 {
  const p = parts[i]
  out.compose(exploded ? p.posE : p.posA, _q.setFromEuler(exploded ? p.rotE : p.rotA), _one)
  if (p.parent >= 0) out.premultiply(partMatrix(parts, p.parent, exploded, new Matrix4()))
  return out
}

export function getModel(id: ModelId): ModelAsset {
  const hit = cache.get(id)
  if (hit) return hit
  const spec = SPECS[id]
  const ids = spec.parts.map((p) => p.id)
  const maxRank = Math.max(1, ...spec.parts.map((p) => p.rank))
  const span = spec.span ?? SPAN
  const parts: PartAsset[] = spec.parts.map((ps, index) => {
    const geos = build(ps.build)
    const box = new Box3()
    for (const [, g] of geos) {
      if (!g.boundingBox) g.computeBoundingBox()
      box.union(g.boundingBox!)
    }
    const posA = v3(ps.pos)
    const posE = v3(ps.xpos ?? ps.pos)
    const rotA = new Euler(ps.rot?.[0] ?? 0, ps.rot?.[1] ?? 0, ps.rot?.[2] ?? 0)
    const rotE = new Euler(ps.xrot?.[0] ?? ps.rot?.[0] ?? 0, ps.xrot?.[1] ?? ps.rot?.[1] ?? 0, ps.xrot?.[2] ?? ps.rot?.[2] ?? 0)
    const via = ps.via ?? []
    const n = via.length + 1
    const keysP = [posA, ...via.map((w) => v3('pos' in w ? w.pos : w)), posE]
    const keysR = [
      rotA,
      ...via.map((w, i) => {
        const r = 'pos' in w ? w.rot : undefined
        if (r) return new Euler(r[0], r[1], r[2])
        const k = (i + 1) / n
        return new Euler(rotA.x + (rotE.x - rotA.x) * k, rotA.y + (rotE.y - rotA.y) * k, rotA.z + (rotE.z - rotA.z) * k)
      }),
      rotE,
    ]
    const ownSpan = Math.min(1, span * (1 + 0.35 * via.length))
    return {
      spec: ps,
      index,
      parent: ps.parent ? ids.indexOf(ps.parent) : -1,
      hi: null,
      geos,
      box,
      start: (ps.rank / maxRank) * (1 - span),
      span: ownSpan,
      keysP,
      keysR,
      posA,
      posE,
      rotA,
      rotE,
    }
  })
  for (const p of parts) {
    let q: PartAsset | undefined = p
    while (q && q.spec.id.startsWith('_') && !q.spec.group) q = q.parent >= 0 ? parts[q.parent] : undefined
    p.hi = q ? (q.spec.group ?? q.spec.id) : null
  }
  if (import.meta.env.DEV) {
    const missing = (MODEL_PARTS[id] as readonly string[]).filter((pid) => !ids.includes(pid))
    if (missing.length) console.warn(`[devices] ${id} is missing parts`, missing)
  }
  const yawM = new Matrix4().makeRotationY(spec.frontYaw ?? 0)
  const boxA = new Box3()
  const boxE = new Box3()
  const ptsA: Vector3[] = []
  const ptsE: Vector3[] = []
  for (const p of parts) {
    if (p.box.isEmpty()) continue
    const mA = partMatrix(parts, p.index, false, new Matrix4()).premultiply(yawM)
    const mE = partMatrix(parts, p.index, true, new Matrix4()).premultiply(yawM)
    for (let k = 0; k < 8; k++) {
      const c = new Vector3(k & 1 ? p.box.max.x : p.box.min.x, k & 2 ? p.box.max.y : p.box.min.y, k & 4 ? p.box.max.z : p.box.min.z)
      const e = c.clone().applyMatrix4(mE)
      const a = p.spec.appear ? e.clone() : c.applyMatrix4(mA)
      ptsA.push(a)
      ptsE.push(e)
      if (!p.spec.appear) boxA.expandByPoint(a)
      boxE.expandByPoint(e)
    }
  }
  const asset: ModelAsset = { spec, parts, boxA, boxE, ptsA, ptsE }
  cache.set(id, asset)
  return asset
}

/** Per-part eased progress on the shared timeline g (0 assembled .. 1 exploded). */
export function partProgress(start: number, g: number, span = SPAN): number {
  // Parts that start late still finish by g = 1.
  const t = Math.min(1, Math.max(0, (g - start) / Math.min(span, 1 - start)))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const _a = new Vector3()
const _b = new Vector3()

function mono(d0: number, d1: number): number {
  if (d0 * d1 <= 0) return 0
  const m = 0.5 * (d0 + d1)
  const cap = 3 * Math.min(Math.abs(d0), Math.abs(d1))
  return Math.sign(m) * Math.min(Math.abs(m), cap)
}

/** Tangent at `b` between neighbours `a` and `c` (an end key passes itself as its missing neighbour). */
function tangent(a: Vector3, b: Vector3, c: Vector3, out: Vector3): Vector3 {
  if (a === b) return out.subVectors(c, b).multiplyScalar(0.5)
  if (b === c) return out.subVectors(b, a).multiplyScalar(0.5)
  return out.set(mono(b.x - a.x, c.x - b.x), mono(b.y - a.y, c.y - b.y), mono(b.z - a.z, c.z - b.z))
}

/**
 * A part's local pose at its own progress t (0..1): a smooth path through its
 * keys for the position, piecewise linear for the rotation.
 */
export function partPose(p: PartAsset, t: number, pos: Vector3, rot: Euler): void {
  const P = p.keysP
  const R = p.keysR
  const n = P.length - 1
  if (n === 1) {
    pos.lerpVectors(P[0], P[1], t)
    rot.set(R[0].x + (R[1].x - R[0].x) * t, R[0].y + (R[1].y - R[0].y) * t, R[0].z + (R[1].z - R[0].z) * t)
    return
  }
  const u = Math.min(n - 1e-6, Math.max(0, t * n))
  const i = Math.floor(u)
  const f = u - i
  const p0 = P[Math.max(0, i - 1)]
  const p1 = P[i]
  const p2 = P[i + 1]
  const p3 = P[Math.min(n, i + 2)]
  // Hermite segment with monotone tangents: no axis swings back past a key (no overshoot through a shell).
  const f2 = f * f
  const f3 = f2 * f
  tangent(p0, p1, p2, _a)
  tangent(p1, p2, p3, _b)
  pos
    .copy(p1)
    .multiplyScalar(2 * f3 - 3 * f2 + 1)
    .addScaledVector(p2, -2 * f3 + 3 * f2)
    .addScaledVector(_a, f3 - 2 * f2 + f)
    .addScaledVector(_b, f3 - f2)
  const r1 = R[i]
  const r2 = R[i + 1]
  rot.set(r1.x + (r2.x - r1.x) * f, r1.y + (r2.y - r1.y) * f, r1.z + (r2.z - r1.z) * f)
}

const _pts: Vector3[] = []

/** The parts' box corners at explode amount e (model space), written into a reused array. */
export function modelPoints(a: ModelAsset, e: number, pts: Vector3[] = _pts): Vector3[] {
  const n = a.ptsA.length
  while (pts.length < n) pts.push(new Vector3())
  pts.length = n
  for (let i = 0; i < n; i++) pts[i].lerpVectors(a.ptsA[i], a.ptsE[i], e)
  return pts
}
