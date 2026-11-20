import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { ModelId } from '../contract'
import { getModel, partPose, partProgress, type ModelAsset } from '.'

/**
 * Finds parts that pass through each other while a device explodes (used by the tests).
 *
 * Every part's surface is sampled into points and voxelised in its own pivot
 * space. Along the explode timeline we move the other parts' points into that
 * space and count how many land in an occupied voxel. Parts that touch when
 * assembled or exploded have a baseline count; a count well above both ends
 * means one part went through the other on the way.
 */

export const STEPS = 48
const _q = new Quaternion()
const _e = new Euler()
const _one = new Vector3(1, 1, 1)
const _v = new Vector3()

export type Sampled = { pts: Float32Array; cells: Set<number>; cell: number }

export function samplePart(a: ModelAsset, i: number, cell: number): Sampled {
  const tris: number[] = []
  let area = 0
  const A = new Vector3()
  const B = new Vector3()
  const C = new Vector3()
  const geos = a.parts[i].geos.map(([, g]) => g.attributes.position.array as Float32Array)
  for (const p of geos)
    for (let k = 0; k < p.length; k += 9) {
      A.fromArray(p, k)
      B.fromArray(p, k + 3)
      C.fromArray(p, k + 6)
      const s = B.clone().sub(A).cross(C.clone().sub(A)).length() / 2
      area += s
      tris.push(s)
    }
  const n = Math.min(60000, Math.max(400, Math.round((area / (cell * cell)) * 3)))
  const pts = new Float32Array(n * 3)
  let ti = 0
  let acc = 0
  let k = 0
  const step = area / n
  let next = step * 0.5
  for (const p of geos)
    for (let j = 0; j < p.length; j += 9, ti++) {
      acc += tris[ti]
      while (next <= acc && k < n) {
        const r1 = ((k * 0.618034) % 1) as number
        const r2 = ((k * 0.754878) % 1) as number
        const su = Math.sqrt(r1)
        const w0 = 1 - su
        const w1 = su * (1 - r2)
        const w2 = su * r2
        for (let c = 0; c < 3; c++) pts[k * 3 + c] = p[j + c] * w0 + p[j + 3 + c] * w1 + p[j + 6 + c] * w2
        k++
        next += step
      }
    }
  const cells = new Set<number>()
  for (let m = 0; m < k; m++) cells.add(key(pts[m * 3], pts[m * 3 + 1], pts[m * 3 + 2], cell))
  return { pts: pts.subarray(0, k * 3), cells, cell }
}

function key(x: number, y: number, z: number, cell: number) {
  const ix = Math.floor(x / cell) + 512
  const iy = Math.floor(y / cell) + 512
  const iz = Math.floor(z / cell) + 512
  return (ix * 1024 + iy) * 1024 + iz
}

const _p = new Vector3()

export function matrices(a: ModelAsset, g: number): Matrix4[] {
  const local = a.parts.map((p) => {
    partPose(p, partProgress(p.start, g, p.span), _p, _e)
    return new Matrix4().compose(_p, _q.setFromEuler(_e), _one)
  })
  const world: Matrix4[] = []
  const get = (i: number): Matrix4 => {
    if (world[i]) return world[i]
    const p = a.parts[i]
    world[i] = p.parent >= 0 ? get(p.parent).clone().multiply(local[i]) : local[i]
    return world[i]
  }
  a.parts.forEach((_, i) => get(i))
  return world
}

/**
 * Points of `src` (moved by `m` into `dst`'s space) that land in an occupied cell of `dst`.
 * With `near`, a point also counts when it lands next to one (used to find resting contact).
 * Points already set in `skip` are ignored; hits are written into `mark` when given.
 */
export function hits(src: Sampled, dst: Sampled, m: Matrix4, skip?: Uint8Array, mark?: Uint8Array, near = false): number {
  let n = 0
  const e = m.elements
  const p = src.pts
  const c = dst.cell
  for (let k = 0, q = 0; k < p.length; k += 3, q++) {
    if (skip && skip[q]) continue
    const x = p[k]
    const y = p[k + 1]
    const z = p[k + 2]
    _v.set(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14])
    let hit = dst.cells.has(key(_v.x, _v.y, _v.z, c))
    if (!hit && near)
      for (let dx = -1; dx <= 1 && !hit; dx++)
        for (let dy = -1; dy <= 1 && !hit; dy++)
          for (let dz = -1; dz <= 1 && !hit; dz++) hit = dst.cells.has(key(_v.x + dx * c, _v.y + dy * c, _v.z + dz * c, c))
    if (hit) {
      n++
      if (mark) mark[q] = 1
    }
  }
  return n
}

export type Clash = { a: string; b: string; g: number; excess: number; frac: number }

/**
 * Parts of `id` that pass through each other on the way apart. Points of a part that rest
 * against the other one when assembled or exploded are left out, so sliding contact and
 * voxel aliasing between touching faces do not count.
 */
export function findClashes(id: ModelId): Clash[] {
  const a = getModel(id)
  const size = a.boxE.getSize(new Vector3())
  const cell = Math.max(0.002, Math.max(size.x, size.y, size.z) / 150)
  const live = a.parts.map((p) => !p.spec.appear && !p.box.isEmpty())
  const S = a.parts.map((_, i) => (live[i] ? samplePart(a, i, cell) : null))
  const frames: Matrix4[][] = []
  for (let s = 0; s <= STEPS; s++) frames.push(matrices(a, s / STEPS))
  const out: Clash[] = []
  const rel = new Matrix4()
  for (let i = 0; i < a.parts.length; i++)
    for (let j = 0; j < a.parts.length; j++) {
      if (i === j || !S[i] || !S[j]) continue
      const total = S[i]!.pts.length / 3
      const contact = new Uint8Array(total)
      for (const s of [0, STEPS]) {
        rel.copy(frames[s][j]).invert().multiply(frames[s][i])
        hits(S[i]!, S[j]!, rel, undefined, contact, true)
      }
      let worst = 0
      let at = 0
      for (let s = 1; s < STEPS; s++) {
        rel.copy(frames[s][j]).invert().multiply(frames[s][i])
        const n = hits(S[i]!, S[j]!, rel, contact)
        if (n > worst) {
          worst = n
          at = s
        }
      }
      const frac = worst / total
      if (worst >= 12 && frac > 0.01) out.push({ a: a.parts[i].spec.id, b: a.parts[j].spec.id, g: at / STEPS, excess: worst, frac })
    }
  return out.sort((x, y) => y.frac - x.frac)
}
