import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  TorusGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Material buckets. Every static prop in the diorama is baked into one merged
 * BufferGeometry per bucket (vertex coloured), so the whole room costs a
 * handful of draw calls instead of hundreds.
 */
export type Bucket = 'matte' | 'satin' | 'gloss' | 'metal' | 'glow' | 'glass' | 'frosted'
export const BUCKETS: readonly Bucket[] = ['matte', 'satin', 'gloss', 'metal', 'glow', 'glass', 'frosted']

export type V3 = readonly [number, number, number]
/** Rotation: a number is a Y rotation in radians, a tuple is an XYZ Euler. */
export type Rot = number | V3
/** Colour per vertex from its local normal / position (lets one box carry several face colours). */
export type ColorFn = (n: Vector3, p: Vector3) => ColorRepresentation
export type Paint = ColorRepresentation | ColorFn

const KEEP = new Set(['position', 'normal', 'uv'])
const _c = new Color()
const _n = new Vector3()
const _p = new Vector3()
const _q = new Quaternion()
const _e = new Euler()

function compose(pos: V3, rot: Rot, scale: number | V3 = 1): Matrix4 {
  if (typeof rot === 'number') _e.set(0, rot, 0)
  else _e.set(rot[0], rot[1], rot[2])
  _q.setFromEuler(_e)
  const s = typeof scale === 'number' ? new Vector3(scale, scale, scale) : new Vector3(scale[0], scale[1], scale[2])
  return new Matrix4().compose(new Vector3(pos[0], pos[1], pos[2]), _q, s)
}

export class GeoBuilder {
  readonly lite: boolean
  private parts = new Map<Bucket, BufferGeometry[]>()
  private stack: Matrix4[] = [new Matrix4()]

  constructor(lite = false) {
    this.lite = lite
  }

  private get top(): Matrix4 {
    return this.stack[this.stack.length - 1]
  }

  /** Run `fn` with a local transform pushed (props are authored in local space). */
  group(pos: V3, rot: Rot, fn: () => void, scale: number | V3 = 1): void {
    this.stack.push(this.top.clone().multiply(compose(pos, rot, scale)))
    fn()
    this.stack.pop()
  }

  add(bucket: Bucket, geo: BufferGeometry, paint: Paint, pos: V3 = [0, 0, 0], rot: Rot = 0, scale: number | V3 = 1): void {
    let g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name)
    g.clearGroups()
    const count = g.attributes.position.count
    if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2))
    if (!g.attributes.normal) g.computeVertexNormals()
    const colors = new Float32Array(count * 3)
    const pa = g.attributes.position
    const na = g.attributes.normal
    const fn = typeof paint === 'function' ? (paint as ColorFn) : null
    if (!fn) _c.set(paint as ColorRepresentation)
    for (let i = 0; i < count; i++) {
      if (fn) {
        _n.fromBufferAttribute(na, i)
        _p.fromBufferAttribute(pa, i)
        _c.set(fn(_n, _p))
      }
      colors[i * 3] = _c.r
      colors[i * 3 + 1] = _c.g
      colors[i * 3 + 2] = _c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    g.applyMatrix4(this.top.clone().multiply(compose(pos, rot, scale)))
    const list = this.parts.get(bucket) ?? []
    list.push(g)
    this.parts.set(bucket, list)
  }

  /** Box centred on `pos`. `r` > 0 gives bevelled edges. */
  box(bucket: Bucket, paint: Paint, size: V3, pos: V3, rot: Rot = 0, r = 0): void {
    const [w, h, d] = size
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)
    const geo = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new BoxGeometry(w, h, d)
    this.add(bucket, geo, paint, pos, rot)
  }

  /** Axis-aligned box from min/max corners (handy for architecture). */
  slab(bucket: Bucket, paint: Paint, min: V3, max: V3, r = 0): void {
    this.box(
      bucket,
      paint,
      [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      0,
      r,
    )
  }

  /** Cylinder along local Y, centred on `pos`. */
  cyl(bucket: Bucket, paint: Paint, rTop: number, rBot: number, h: number, pos: V3, rot: Rot = 0, seg = 12): void {
    this.add(bucket, new CylinderGeometry(rTop, rBot, h, seg, 1), paint, pos, rot)
  }

  /** Torus in the local XY plane. */
  torus(bucket: Bucket, paint: Paint, r: number, tube: number, pos: V3, rot: Rot = 0, seg = 18, arc = Math.PI * 2): void {
    this.add(bucket, new TorusGeometry(r, tube, 5, seg, arc), paint, pos, rot)
  }

  build(): Map<Bucket, BufferGeometry> {
    const out = new Map<Bucket, BufferGeometry>()
    for (const [bucket, list] of this.parts) {
      if (!list.length) continue
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      merged.computeBoundingSphere()
      merged.computeBoundingBox()
      out.set(bucket, merged)
    }
    this.parts.clear()
    return out
  }
}

/** Face-colour helper for walls: picks a colour by dominant normal direction. */
export function faces(o: {
  px?: ColorRepresentation
  nx?: ColorRepresentation
  py?: ColorRepresentation
  ny?: ColorRepresentation
  pz?: ColorRepresentation
  nz?: ColorRepresentation
  rest: ColorRepresentation
}): ColorFn {
  return (n) => {
    if (n.x > 0.7) return o.px ?? o.rest
    if (n.x < -0.7) return o.nx ?? o.rest
    if (n.y > 0.7) return o.py ?? o.rest
    if (n.y < -0.7) return o.ny ?? o.rest
    if (n.z > 0.7) return o.pz ?? o.rest
    if (n.z < -0.7) return o.nz ?? o.rest
    return o.rest
  }
}
