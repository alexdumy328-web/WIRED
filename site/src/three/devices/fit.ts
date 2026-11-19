import { Vector3 } from 'three'

const _d = new Vector3()
const _r = new Vector3()
const _u = new Vector3()
const _c = new Vector3()
const _v = new Vector3()

export type FitOut = { pos: Vector3; target: Vector3 }

/**
 * Camera that frames all `points` from direction (az, el) (radians, az = 0
 * looks from +z) at the given vertical fov and aspect. The target is
 * re-centred on the projected extents so the subject sits in the middle.
 * `mx` / `my` are breathing-room factors (1 = touching the edges).
 */
export function fitView(points: readonly Vector3[], az: number, el: number, fovDeg: number, aspect: number, out: FitOut, mx = 1.14, my = 1.2): FitOut {
  _d.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
  _r.set(Math.cos(az), 0, -Math.sin(az))
  _u.crossVectors(_d, _r).normalize()
  _c.set(0, 0, 0)
  for (const p of points) _c.add(p)
  _c.multiplyScalar(1 / Math.max(1, points.length))
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const p of points) {
    _v.subVectors(p, _c)
    const x = _v.dot(_r)
    const y = _v.dot(_u)
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  _c.addScaledVector(_r, (x0 + x1) / 2).addScaledVector(_u, (y0 + y1) / 2)
  const tanV = Math.tan((fovDeg * Math.PI) / 360)
  const tanH = tanV * Math.max(0.2, aspect)
  let dist = 0
  for (const p of points) {
    _v.subVectors(p, _c)
    const z = _v.dot(_d)
    dist = Math.max(dist, z + (mx * Math.abs(_v.dot(_r))) / tanH, z + (my * Math.abs(_v.dot(_u))) / tanV)
  }
  out.target.copy(_c)
  out.pos.copy(_c).addScaledVector(_d, Math.max(dist, 0.05))
  return out
}
