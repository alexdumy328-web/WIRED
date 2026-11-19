import type { GeoBuilder } from './builder'
import { faces } from './builder'
import { C, rng } from './materials'
import { ROOM } from './layout'

const SHELF_FRONT = -4.75

/** Matte black accent block with two black-framed open shelving bays. */
function shelving(b: GeoBuilder) {
  // Thin black accent partition; a small stock room sits behind it.
  b.slab('matte', faces({ py: C.poche, rest: C.blackWall }), [3.2, 0, SHELF_FRONT - 0.14], [ROOM.W, ROOM.H, SHELF_FRONT])
  stockRoom(b)
  const r = rng(21)
  const z0 = SHELF_FRONT
  const depth = 0.32
  const zc = z0 + depth / 2
  const levels = [0.12, 0.92, 1.3, 1.68, 2.06]
  for (const [x0, x1] of [
    [3.3, 4.12],
    [4.16, 4.96],
  ] as const) {
    const xc = (x0 + x1) / 2
    const w = x1 - x0
    for (const x of [x0 + 0.015, x1 - 0.015]) b.box('satin', '#151618', [0.03, 2.22, depth], [x, 1.11, zc])
    b.box('satin', '#151618', [w, 0.03, depth], [xc, 2.22, zc])
    // Lower closed cabinet behind the counter.
    b.box('satin', '#2a2c2f', [w - 0.03, 0.78, depth - 0.02], [xc, 0.5, zc])
    for (const y of levels) b.box('satin', C.shelfBoard, [w - 0.03, 0.022, depth - 0.01], [xc, y, zc])
    // Stock on shelves above the counter.
    for (const y of levels.slice(1)) {
      let x = x0 + 0.05
      while (x < x1 - 0.1) {
        const kind = r()
        let wd = 0.08 + r() * 0.06
        let h = 0.06 + r() * 0.08
        let col: string = r() > 0.5 ? C.boxWhite : C.cardboard
        let bucket: 'satin' | 'metal' | 'gloss' = 'satin'
        if (kind > 0.82) {
          // Car ECU: silver cast case.
          wd = 0.16
          h = 0.11
          col = '#bfc3c6'
          bucket = 'metal'
        } else if (kind > 0.7) {
          col = '#1b1c1e'
          bucket = 'gloss'
          h = 0.05 + r() * 0.06
        } else if (kind > 0.6 && y < 1.4) {
          col = '#2a5ab4'
          h = 0.03
          wd = 0.14
        }
        if (x + wd > x1 - 0.03) break
        const stack = bucket === 'satin' && h < 0.09 && r() > 0.4 ? 2 : 1
        for (let s = 0; s < stack; s++)
          b.box(bucket, col, [wd, h, 0.2], [x + wd / 2, y + 0.011 + h / 2 + s * h, z0 + 0.14], (r() - 0.5) * 0.06, 0.004)
        x += wd + 0.02 + r() * 0.03
      }
    }
  }
}

/** Behind the black wall: a second PVC door, a grey locker and stacked parcels. */
function stockRoom(b: GeoBuilder) {
  const z = ROOM.back + 0.035
  b.box('satin', C.pvc, [0.07, 2.1, 0.06], [3.45, 1.05, z])
  b.box('satin', C.pvc, [0.07, 2.1, 0.06], [4.25, 1.05, z])
  b.box('satin', C.pvc, [0.87, 0.07, 0.06], [3.85, 2.1, z])
  b.box('satin', '#eef0f0', [0.73, 2.03, 0.03], [3.85, 1.03, z - 0.005])
  b.box('metal', C.steel, [0.12, 0.025, 0.03], [4.1, 1.02, z + 0.03])
  b.box('satin', '#8e9398', [0.6, 1.9, 0.45], [4.65, 0.95, -5.55], 0, 0.01)
  b.box('satin', '#7f8489', [0.004, 1.8, 0.4], [4.345, 0.95, -5.55])
  const r = rng(9)
  for (let i = 0; i < 5; i++) {
    const w = 0.35 + r() * 0.15
    b.box('satin', C.cardboard, [w, 0.25, 0.35], [3.55 + (i % 2) * 0.12, 0.125 + Math.floor(i / 2) * 0.25, -5.2 - (i % 3) * 0.05], (r() - 0.5) * 0.3, 0.01)
  }
}

/** Reception counter: light grey body, black edge trim, black top, silver laptop facing staff. */
function counter(b: GeoBuilder) {
  const x0 = 3.25
  const x1 = 4.9
  const z0 = -3.05
  const z1 = -3.65
  const h = 1.05
  const xc = (x0 + x1) / 2
  const zc = (z0 + z1) / 2
  b.box('satin', '#d9dcdd', [x1 - x0 - 0.04, h - 0.04, z0 - z1 - 0.04], [xc, (h - 0.04) / 2, zc])
  // Black frame trim around the front.
  const t = 0.03
  b.box('satin', C.black, [t, h - 0.04, t], [x0 + t / 2, (h - 0.04) / 2, z0 - t / 2])
  b.box('satin', C.black, [t, h - 0.04, t], [x1 - t / 2, (h - 0.04) / 2, z0 - t / 2])
  b.box('satin', C.black, [x1 - x0, 0.03, t], [xc, 0.015, z0 - t / 2])
  b.box('satin', C.black, [t, h - 0.04, z0 - z1], [x0 + t / 2, (h - 0.04) / 2, zc])
  b.box('satin', C.black, [t, h - 0.04, z0 - z1], [x1 - t / 2, (h - 0.04) / 2, zc])
  // Black top with slight overhang.
  b.box('satin', '#151618', [x1 - x0 + 0.04, 0.04, z0 - z1 + 0.05], [xc, h - 0.02, zc + 0.01], 0, 0.006)
  // Silver laptop, screen toward staff (-z).
  b.group([4.35, h, -3.38], Math.PI, () => {
    b.box('metal', '#c8cbce', [0.34, 0.016, 0.24], [0, 0.008, 0], 0, 0.004)
    b.group([0, 0.016, -0.12], 0, () => {
      b.group([0, 0, 0], [-1.85, 0, 0], () => {
        b.box('metal', '#c8cbce', [0.34, 0.008, 0.23], [0, 0, 0.115], 0, 0.003)
        b.box('glow', '#9fc2e6', [0.31, 0.002, 0.2], [0, -0.005, 0.115])
      })
    })
  })
  // Paper slip, mouse, card terminal, phone.
  b.box('matte', '#f7f7f5', [0.21, 0.002, 0.15], [3.55, h + 0.001, -3.2], 0.2)
  b.box('gloss', '#141516', [0.06, 0.025, 0.1], [3.9, h + 0.012, -3.4], 0.3, 0.01)
  b.box('gloss', '#141516', [0.08, 0.05, 0.16], [4.72, h + 0.025, -3.5], -0.2, 0.01)
}

export function buildCounter(b: GeoBuilder): void {
  shelving(b)
  counter(b)
}
