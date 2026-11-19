import type { StopId } from './contract'
import type { V3 } from './builder'

/**
 * Floor plan (metres). Y up. x = 0 is the left (bench) wall when you walk in,
 * z = 0 is the street face of the black arch partition, -z goes into the shop,
 * +z goes out through the vestibule to the street.
 *
 *            z = -6.5  back wall (white PVC door)
 *   ┌──────────────────────────────┐
 *   │ coffee            ███ black  │
 *   │ bench 2 (laptop)  ███ shelves│
 *   │                  [counter]   │
 *   │ bench 1 (scope)     radiator │
 *   └────╲  arch (black) ╱─────────┘  z = 0 .. -0.25 partition
 *   │PCB   vestibule (slate tiles)  │
 *   └══════ storefront / door ══════┘  z = 1.8
 *          pavement · road · van
 */
export const ROOM = {
  W: 5,
  H: 2.7,
  back: -6.5,
  wall: 0.15,
  part: 0.25, // partition thickness, occupies z -0.25..0
  vest: 1.8, // storefront line
  archX0: 1.25,
  archX1: 3.85,
  archJamb: 1.95,
  archTop: 2.32,
  cut: 0.12, // height the camera-facing (right) wall is cut down to
} as const

export const STREET = {
  paveEnd: 3.4, // pavement z 1.86 .. 3.4
  curb: 0.14,
  roadEnd: 6.9,
  roadY: -0.1,
  baseX0: -0.6,
  baseX1: 5.8,
  baseZ0: -7.1,
} as const

export type Pose = { pos: V3; target: V3; fov: number }

function orbit(target: V3, azDeg: number, elDeg: number, dist: number, fov: number): Pose {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return {
    target,
    fov,
    pos: [
      target[0] + Math.sin(az) * Math.cos(el) * dist,
      target[1] + Math.sin(el) * dist,
      target[2] + Math.cos(az) * Math.cos(el) * dist,
    ],
  }
}

/** Desktop camera poses per station. */
export const POSES: Record<StopId, Pose> = {
  overview: orbit([2.55, 0.1, -0.2], 54, 40, 23, 32),
  pcbWall: { pos: [3.75, 1.6, 1.15], target: [0.0, 1.36, 0.88], fov: 40 },
  bench: { pos: [1.85, 1.68, -0.42], target: [0.28, 1.0, -1.7], fov: 40 },
  laptop: { pos: [2.02, 2.32, -2.3], target: [0.5, 1.4, -3.15], fov: 40 },
  coffee: { pos: [1.3, 1.32, -4.1], target: [0.26, 0.92, -4.86], fov: 40 },
  counter: { pos: [1.55, 1.85, -0.95], target: [4.05, 1.08, -3.95], fov: 40 },
  door: orbit([2.45, 0.9, 3.1], 55, 15, 9.4, 36),
}

/** How much further back the camera sits on portrait / narrow screens. */
export const NARROW_PULL: Record<StopId, number> = {
  overview: 1.45,
  pcbWall: 1.25,
  bench: 1.35,
  laptop: 1.35,
  coffee: 1.35,
  counter: 1.3,
  door: 1.3,
}

/** Portrait / narrow screens: dedicated poses where pulling back is not enough (long axis turned to run vertically). */
export const NARROW_POSES: Partial<Record<StopId, Pose>> = {
  overview: orbit([2.45, 0.0, -0.1], 24, 55, 31, 40), // replaced at runtime by a fit to DIORAMA_PTS (see cameraRig)
  bench: { pos: [1.72, 1.95, -0.32], target: [0.34, 1.0, -1.4], fov: 50 },
  laptop: { pos: [2.3, 2.45, -2.05], target: [0.5, 1.45, -3.15], fov: 50 },
  counter: { pos: [1.65, 1.95, -1.05], target: [4.0, 1.0, -3.85], fov: 52 },
  door: orbit([2.7, 1.0, 3.0], 38, 22, 12.5, 46),
}

/** Outline of the whole diorama (base slab + roof line + van), for fitting the overview to any aspect. */
export const DIORAMA_PTS: V3[] = [
  [STREET.baseX0, -0.4, STREET.baseZ0],
  [STREET.baseX1, -0.4, STREET.baseZ0],
  [STREET.baseX0, -0.4, STREET.roadEnd],
  [STREET.baseX1, -0.4, STREET.roadEnd],
  [-0.15, ROOM.H, ROOM.back - 0.15],
  [ROOM.W + 0.15, ROOM.H, ROOM.back - 0.15],
  [-0.15, ROOM.H, ROOM.vest],
  [ROOM.W + 0.15, ROOM.H, ROOM.vest],
  [0.2, 1.8, 5.4],
  [4.5, 1.8, 5.4],
]

/** Where each station's hotspot via sits (world space). */
export const ANCHORS: Record<Exclude<StopId, 'overview'>, V3> = {
  pcbWall: [0.08, 2.05, 1.2],
  bench: [0.36, 1.5, -0.98],
  laptop: [0.45, 1.42, -3.15],
  coffee: [0.32, 1.3, -4.82],
  counter: [3.65, 1.16, -3.05],
  door: [2.2, 2.05, 4.55],
}

/** Coarse wall boxes used to hide hotspots that sit behind walls. [min, max]. */
export const OCCLUDERS: [V3, V3][] = [
  [[-ROOM.wall, 0, ROOM.back - ROOM.wall], [0, ROOM.H, ROOM.vest]], // left wall (both rooms)
  [[-ROOM.wall, 0, ROOM.back - ROOM.wall], [ROOM.W + ROOM.wall, ROOM.H, ROOM.back]], // back wall
  [[0, 0, -ROOM.part], [ROOM.archX0, ROOM.H, 0]], // partition left of arch
  [[ROOM.archX1, 0, -ROOM.part], [ROOM.W, ROOM.H, 0]], // partition right of arch
  [[ROOM.archX0, ROOM.archJamb + 0.15, -ROOM.part], [ROOM.archX1, ROOM.H, 0]], // lintel
  [[3.2, 0, -4.89], [ROOM.W, ROOM.H, -4.75]], // black accent partition
  [[3.25, 0, -3.65], [4.9, 1.05, -3.05]], // counter
]
