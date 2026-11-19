/**
 * Contract between the page and the 3D workshop scene.
 *
 * The scene is fixed behind the WHOLE page (not only the hero). The page writes
 * into `sceneState` (no React re-renders); the scene reads it every frame and
 * damps the camera toward the resolved pose.
 *
 * Camera resolution, every frame:
 *   if (sceneState.focus) -> fly to POSES[focus]
 *   else                  -> interpolate along TOUR at position sceneState.t
 */
export const STOPS = [
  'overview', // whole diorama, high 3/4 view
  'pcbWall', // backlit wall of boards + ECUs in the entrance
  'bench', // board-level bench: stereo microscope, soldering stations, oscilloscope
  'laptop', // second bench: laptop on stand, PC / laptop / IT work
  'coffee', // espresso + small appliance repair spot (an espresso machine opened up on a bench end or side table)
  'counter', // reception counter + black shelving (quotes, booking, pickup)
  'door', // out through the storefront to the street, car/van parked outside (mobile car electrics)
] as const
export type StopId = (typeof STOPS)[number]

/** Order the scroll-driven hero tour passes through (t = 0 .. TOUR.length - 1). */
export const TOUR: readonly StopId[] = ['overview', 'pcbWall', 'bench', 'counter', 'door']

export const sceneState = {
  /** Continuous position along TOUR. Used when `focus` is null. */
  t: 0,
  /** Discrete station the camera should fly to; overrides `t` when set. */
  focus: null as StopId | null,
  /** Normalised pointer, -1..1 on each axis, for subtle parallax. */
  pointer: { x: 0, y: 0 },
  /**
   * Horizontal framing hint, -1..1: where on screen the page wants the subject.
   * -1 = subject on the left third (text panel on the right), 0 = centred, 1 = right third.
   * The scene shifts the camera's view offset (camera.setViewOffset or a lookAt shift) accordingly.
   */
  frame: 0.35,
  /** Exploded-view amount for the laptop at the `laptop` station, 0 = assembled, 1 = fully exploded. */
  explode: 0,
}

export type Theme = 'dark' | 'light'

export type WorkshopCanvasProps = {
  theme: Theme
  reducedMotion: boolean
  className?: string
  /** Show clickable hotspots (small glowing gold vias with a label) at each station except overview. */
  showHotspots?: boolean
  /** Localised hotspot labels. */
  labels?: Partial<Record<StopId, string>>
  /** Called when a hotspot is clicked. The page then sets sceneState.focus and scrolls to the matching section. */
  onSelect?: (id: StopId) => void
}
