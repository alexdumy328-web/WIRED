/**
 * Contract between the page and the 3D device viewer.
 *
 * Each viewer gets its device as a prop. The hovered price-list job is shared: the page writes
 * it into `sceneState` (no React re-renders) and every viewer reads it each frame.
 */
export const sceneState = {
  /** Part id to light up in gold with its label (see MODEL_PARTS), or null. Ignored by a model without that part. */
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
 * Changing `model` reassembles the current device and explodes the new one (staggered, ~1.2 s).
 * Drag to rotate; slow idle turntable unless reducedMotion. Transparent background.
 */
export type DeviceStageProps = {
  model: ModelId
  /** Exploded-view amount, 0 = assembled, 1 = fully exploded (default). */
  explode?: number
  theme: Theme
  reducedMotion: boolean
  className?: string
  /** Stop rendering (e.g. scrolled off screen). */
  paused?: boolean
  /** Localised part names, key `${model}.${part}`, shown next to the highlighted part. */
  partLabels?: Record<string, string>
}
