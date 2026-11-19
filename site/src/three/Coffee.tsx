import type { GeoBuilder } from './builder'
import { C } from './materials'

/**
 * Coffee / small-appliance repair spot in the back-left corner: the small
 * black desk from the original photos, a multimeter on its leads, screws, a cup.
 * The espresso machine on it is the `coffee` device (devices/coffee.ts).
 */
export const COFFEE = { x: 0.33, z: -4.82, top: 0.76 } as const

export function buildCoffee(b: GeoBuilder): void {
  const { x, z, top } = COFFEE
  // Desk.
  b.box('satin', '#19191b', [0.6, 0.035, 0.95], [x, top - 0.0175, z], 0, 0.006)
  for (const s of [-1, 1]) b.box('satin', '#19191b', [0.56, top - 0.035, 0.03], [x, (top - 0.035) / 2, z + s * 0.45])
  b.box('satin', '#19191b', [0.03, 0.4, 0.88], [x - 0.27, top - 0.24, z])

  // Screws, multimeter + leads. The espresso machine itself is a device model (devices/coffee.ts).
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
