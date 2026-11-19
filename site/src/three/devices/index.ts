import { Box3, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GeoBuilder, type Bucket } from '../builder'
import { MODEL_PARTS, type ModelId } from '../contract'
import { fitView, type FitOut } from './fit'
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
  base: [Bucket, BufferGeometry][] | null
  /** Assembled model merged into one geometry per material (idle props: a handful of draw calls). */
  merged: [Bucket, BufferGeometry][] | null
}

const cache = new Map<ModelId, ModelAsset>()

const v3 = (a?: readonly number[], d = 0) => new Vector3(a?.[0] ?? d, a?.[1] ?? d, a?.[2] ?? d)

function build(fn: (b: GeoBuilder) => void): [Bucket, BufferGeometry][] {
  const b = new GeoBuilder(false)
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
  const parts: PartAsset[] = spec.parts.map((ps, index) => {
    const geos = build(ps.build)
    const box = new Box3()
    for (const [, g] of geos) {
      if (!g.boundingBox) g.computeBoundingBox()
      box.union(g.boundingBox!)
    }
    return {
      spec: ps,
      index,
      parent: ps.parent ? ids.indexOf(ps.parent) : -1,
      hi: null,
      geos,
      box,
      start: (ps.rank / maxRank) * (1 - SPAN),
      posA: v3(ps.pos),
      posE: v3(ps.xpos ?? ps.pos),
      rotA: new Euler(ps.rot?.[0] ?? 0, ps.rot?.[1] ?? 0, ps.rot?.[2] ?? 0),
      rotE: new Euler(ps.xrot?.[0] ?? ps.rot?.[0] ?? 0, ps.xrot?.[1] ?? ps.rot?.[1] ?? 0, ps.xrot?.[2] ?? ps.rot?.[2] ?? 0),
    }
  })
  for (const p of parts) {
    let q: PartAsset | undefined = p
    while (q && q.spec.id.startsWith('_')) q = q.parent >= 0 ? parts[q.parent] : undefined
    p.hi = q ? q.spec.id : null
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
  const asset: ModelAsset = { spec, parts, boxA, boxE, ptsA, ptsE, base: spec.shopBase ? build(spec.shopBase) : null, merged: null }
  cache.set(id, asset)
  return asset
}

/** The assembled model as one geometry per material bucket, model space (frontYaw applied). */
export function getMerged(id: ModelId): [Bucket, BufferGeometry][] {
  const a = getModel(id)
  if (a.merged) return a.merged
  const yawM = new Matrix4().makeRotationY(a.spec.frontYaw ?? 0)
  const lists = new Map<Bucket, BufferGeometry[]>()
  for (const p of a.parts) {
    if (p.spec.appear) continue
    const m = partMatrix(a.parts, p.index, false, new Matrix4()).premultiply(yawM)
    for (const [k, g] of p.geos) {
      const list = lists.get(k) ?? []
      list.push(g.clone().applyMatrix4(m))
      lists.set(k, list)
    }
  }
  a.merged = [...lists].map(([k, list]) => {
    const g = mergeGeometries(list, false)!
    list.forEach((x) => x.dispose())
    g.computeBoundingSphere()
    return [k, g] as [Bucket, BufferGeometry]
  })
  return a.merged
}

/** Per-part eased progress on the shared timeline g (0 assembled .. 1 exploded). */
export function partProgress(start: number, g: number): number {
  const t = Math.min(1, Math.max(0, (g - start) / SPAN))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const _pts: Vector3[] = []
const _place = new Matrix4()

/** The parts' box corners at explode amount e (model space), written into a reused array. */
export function modelPoints(a: ModelAsset, e: number, pts: Vector3[] = _pts): Vector3[] {
  const n = a.ptsA.length
  while (pts.length < n) pts.push(new Vector3())
  pts.length = n
  for (let i = 0; i < n; i++) pts[i].lerpVectors(a.ptsA[i], a.ptsE[i], e)
  return pts
}

/** Camera pose framing a device at its workshop spot, exploded by e, for the given aspect. */
export function shopModelPose(id: ModelId, e: number, aspect: number, out: FitOut): { fov: number } {
  const a = getModel(id)
  const { place, view } = a.spec
  const pts = modelPoints(a, e)
  _place.makeRotationY(place.yaw).setPosition(place.pos[0], place.pos[1], place.pos[2])
  for (const p of pts) p.applyMatrix4(_place)
  const fov = view.fov ?? 34
  const portrait = aspect < 1
  fitView(pts, place.yaw + (view.az * Math.PI) / 180, (view.el * Math.PI) / 180, fov, aspect, out, portrait ? 1.16 : 1.3, portrait ? 1.24 : 1.16)
  return { fov }
}
