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
  /**
   * Which service device is on show, exploded, at its station (see MODEL_STOP).
   * null = no device singled out (benches show their normal props).
   * The scene animates the device apart on its own (staggered, ~1.2 s) once `explode` is 1,
   * and back together when `explode` goes to 0 or `model` changes.
   */
  model: null as ModelId | null,
  /** Part id of the current model to light up in gold with its label (see MODEL_PARTS), or null. */
  highlight: null as string | null,
  /**
   * Guided tour: when true the shop camera moves on to the next station in STOPS every ~6 s
   * (and shows that station's default device, see STATION_MODEL). Any drag in explore mode sets it back to false.
   */
  tour: false,
}

/** One exploded device per service category. */
export const MODELS = ['laptop', 'pc', 'board', 'coffee', 'appliance', 'it', 'auto', 'largeAppliance', 'vintage'] as const
export type ModelId = (typeof MODELS)[number]

/** Station each device sits at; the page flies the camera there when the model is chosen. */
export const MODEL_STOP: Record<ModelId, StopId> = {
  laptop: 'laptop',
  pc: 'laptop',
  it: 'laptop',
  board: 'bench',
  coffee: 'coffee',
  appliance: 'coffee',
  auto: 'door',
  largeAppliance: 'door',
  vintage: 'bench',
}

/**
 * Part ids per model. The page maps price-list jobs to these ids for `highlight`,
 * and passes localised names for them in `partLabels` (key = `${model}.${part}`).
 */
export const MODEL_PARTS = {
  laptop: ['lid', 'screen', 'keyboard', 'board', 'battery', 'fan', 'dcJack', 'bottom'],
  pc: ['sidePanel', 'psu', 'motherboard', 'gpu', 'ram', 'cpuCooler', 'ssd', 'fans'],
  board: ['pcb', 'bga', 'capacitors', 'mosfets', 'connector', 'shield'],
  coffee: ['housing', 'tank', 'boiler', 'pump', 'groupHead', 'gaskets', 'grinder', 'controlBoard'],
  appliance: ['housing', 'motor', 'brushes', 'switch', 'cable', 'controlBoard'],
  it: ['bottom', 'fan', 'heatsink', 'paste', 'ssd', 'ram'],
  auto: ['headlight', 'ledModule', 'ecu', 'dashcam', 'wiring', 'obdPort'],
  largeAppliance: ['cabinet', 'drum', 'motor', 'pump', 'heater', 'controlBoard', 'door'],
  vintage: ['case', 'faceplate', 'tapeMechanism', 'heads', 'belts', 'capacitors', 'transistors', 'pots'],
} as const satisfies Record<ModelId, readonly string[]>

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
  /** Stop rendering (e.g. the canvas is scrolled off screen). */
  paused?: boolean
  /** Localised part names, key `${model}.${part}`, shown next to the highlighted part. */
  partLabels?: Record<string, string>
  /**
   * Explore mode: orbit controls (damped, zoom + polar limits, target kept inside the diorama),
   * hotspots always on. Focus changes still fly the camera there, then hand control back to the
   * orbit controls around that station. Clicking a hotspot sets focus + that station's default
   * device (STATION_MODEL) exploded, and still calls onSelect.
   */
  interactive?: boolean
}

/** Device shown when a station is picked in explore mode or by the guided tour. */
export const STATION_MODEL: Record<StopId, ModelId | null> = {
  overview: null,
  pcbWall: null,
  bench: 'board',
  laptop: 'laptop',
  coffee: 'coffee',
  counter: null,
  door: 'auto',
}

/**
 * Standalone device viewer (no shop): one exploded device on a neutral turntable.
 * Reads sceneState.model / explode / highlight like the shop scene (model null shows the laptop).
 * Drag to rotate; slow idle turntable unless reducedMotion. Transparent background.
 */
export type DeviceStageProps = {
  theme: Theme
  reducedMotion: boolean
  className?: string
  /** Stop rendering (e.g. scrolled off screen). */
  paused?: boolean
  /** Localised part names, key `${model}.${part}`, shown next to the highlighted part. */
  partLabels?: Record<string, string>
}
