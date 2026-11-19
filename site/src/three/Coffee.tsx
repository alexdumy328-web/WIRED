import type { GeoBuilder } from './builder'
import { C } from './materials'

/**
 * Coffee / small-appliance repair spot in the back-left corner: the small
 * black desk from the original photos, carrying an espresso machine with its
 * top and side covers off, the panel lying beside it, a multimeter on the leads.
 */
export const COFFEE = { x: 0.33, z: -4.82, top: 0.76 } as const

export function buildCoffee(b: GeoBuilder): void {
  const { x, z, top } = COFFEE
  // Desk.
  b.box('satin', '#19191b', [0.6, 0.035, 0.95], [x, top - 0.0175, z], 0, 0.006)
  for (const s of [-1, 1]) b.box('satin', '#19191b', [0.56, top - 0.035, 0.03], [x, (top - 0.035) / 2, z + s * 0.45])
  b.box('satin', '#19191b', [0.03, 0.4, 0.88], [x - 0.27, top - 0.24, z])

  b.group([x - 0.02, top, z + 0.05], 0, () => {
    const W = 0.3 // x (front at +x)
    const D = 0.26 // z
    const H = 0.36
    const inox = '#c3c7ca'
    // Chassis: base, back, left side, front fascia. Top and +z side removed.
    b.box('metal', inox, [W, 0.02, D], [0, 0.01, 0])
    b.box('metal', inox, [0.01, H, D], [-W / 2 + 0.005, H / 2, 0])
    b.box('metal', inox, [W, H, 0.008], [0, H / 2, -D / 2 + 0.004])
    b.box('metal', '#d2d5d8', [0.012, H, D], [W / 2 - 0.006, H / 2, 0])
    b.box('metal', inox, [0.012, 0.012, D], [W / 2 - 0.006, H - 0.006, 0])
    // Internals: copper boiler, pump, wiring, water tank at the back.
    b.cyl('metal', C.copper, 0.06, 0.06, 0.17, [0.02, 0.17, 0.02], 0, 16)
    b.cyl('metal', '#9c5d2b', 0.062, 0.062, 0.012, [0.02, 0.255, 0.02], 0, 16)
    b.cyl('gloss', '#1c1c1d', 0.03, 0.03, 0.09, [-0.08, 0.07, 0.07], [Math.PI / 2, 0, 0], 12)
    b.torus('metal', C.copper, 0.05, 0.006, [-0.03, 0.2, 0.05], [0, 0, 0], 12, Math.PI)
    b.torus('gloss', C.red, 0.04, 0.004, [0.06, 0.26, 0.06], [Math.PI / 2, 0, 0], 12, Math.PI * 1.3)
    b.torus('gloss', '#2b62d3', 0.05, 0.004, [0.0, 0.29, -0.03], [Math.PI / 2, 0.4, 0], 12, Math.PI)
    b.box('glass', '#cfe3ee', [0.07, 0.24, D - 0.04], [-W / 2 + 0.05, 0.14, 0])
    // Group head + portafilter in place, drip tray.
    b.cyl('metal', '#e2e5e7', 0.035, 0.035, 0.04, [W / 2 + 0.03, 0.23, 0], 0, 16)
    b.box('metal', '#9ea3a7', [0.1, 0.012, 0.2], [W / 2 + 0.05, 0.03, 0])
    b.cyl('gloss', '#e8e6e2', 0.026, 0.022, 0.05, [W / 2 + 0.04, 0.062, 0], 0, 12)
    // Portafilter locked in, black handle toward the operator; steam wand; cup-warmer rail.
    b.cyl('metal', '#d9dcde', 0.04, 0.036, 0.03, [W / 2 + 0.03, 0.195, 0], 0, 16)
    b.cyl('gloss', '#141414', 0.014, 0.017, 0.13, [W / 2 + 0.12, 0.19, 0], [0, 0, Math.PI / 2 - 0.12], 10)
    b.cyl('metal', '#d9dcde', 0.006, 0.006, 0.2, [W / 2 + 0.03, 0.2, 0.1], [0.25, 0, 0.12], 8)
    b.box('gloss', '#141414', [0.03, 0.03, 0.03], [W / 2 + 0.02, 0.31, 0.1])
    b.box('metal', '#d9dcde', [W - 0.02, 0.012, 0.012], [0, H + 0.01, -D / 2 + 0.01])
    b.box('metal', '#d9dcde', [0.012, 0.012, D - 0.02], [W / 2 - 0.01, H + 0.01, 0])
    // Front fascia controls.
    b.cyl('gloss', '#151515', 0.014, 0.014, 0.012, [W / 2 + 0.002, 0.3, 0.07], [0, 0, Math.PI / 2], 10)
    b.box('glow', '#ff9a3c', [0.004, 0.01, 0.01], [W / 2 + 0.002, 0.3, -0.07])
  })
  // Removed side panel lying flat, screws, multimeter + leads.
  b.box('metal', '#c3c7ca', [0.27, 0.008, 0.36], [x + 0.02, top + 0.004, z + 0.33], 0.3)
  if (!b.lite) for (let i = 0; i < 5; i++) b.cyl('metal', '#d6d9db', 0.004, 0.004, 0.012, [x + 0.16 + i * 0.022, top + 0.006, z - 0.24], 0, 6)
  b.group([x + 0.1, top, z - 0.32], 0.3, () => {
    b.box('gloss', C.yellow, [0.09, 0.03, 0.16], [0, 0.015, 0], 0, 0.01)
    b.box('glow', '#b9d6a6', [0.06, 0.003, 0.05], [0, 0.031, 0.04])
    b.cyl('gloss', '#1a1a1a', 0.014, 0.014, 0.008, [0, 0.032, -0.02], 0, 10)
  })
  b.torus('gloss', C.red, 0.07, 0.003, [x + 0.2, top + 0.003, z - 0.12], [Math.PI / 2, 0, 0], 14, Math.PI * 1.4)
  b.torus('gloss', '#111', 0.06, 0.003, [x + 0.18, top + 0.003, z - 0.15], [Math.PI / 2, 0, 0], 14, Math.PI * 1.2)
  // Espresso cup.
  b.cyl('gloss', '#f2f2f0', 0.03, 0.025, 0.055, [x - 0.12, top + 0.028, z - 0.35], 0, 12)
}
