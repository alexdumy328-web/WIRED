/**
 * Contract between the page and the 3D device viewer.
 *
 * The page writes into `sceneState` (no React re-renders); the viewer reads it every frame.
 */
export const sceneState = {
  /** Exploded-view amount, 0 = assembled, 1 = fully exploded. */
  explode: 0,
  /**
   * Which service device is on show. null = the default (the laptop).
   * The viewer animates the device apart on its own (staggered, ~1.2 s) once `explode` is 1,
   * and back together when `explode` goes to 0 or `model` changes.
   */
  model: null as ModelId | null,
  /** Part id of the current model to light up in gold with its label (see MODEL_PARTS), or null. */
  highlight: null as string | null,
}

/** One exploded device per service category. */
export const MODELS = ['laptop', 'pc', 'board', 'coffee', 'appliance', 'it', 'auto', 'largeAppliance', 'vintage'] as const
export type ModelId = (typeof MODELS)[number]

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

/**
 * Device viewer: one exploded device on a neutral turntable.
 * Reads sceneState.model / explode / highlight (model null shows the laptop).
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
