import type { Job } from '../types'
import type { ModelId } from '../three/contract'

/** Which exploded device a job shows in the 3D window. */
export function modelFor(job: Pick<Job, 'category' | 'mode'>): ModelId {
  if (job.category === 'appliance') return job.mode === 'mobile' ? 'largeAppliance' : 'appliance'
  return job.category
}

/** The part a price-list job touches, lit up when the row is hovered. */
export const jobPart: Record<string, string> = {
  'laptop-clean-paste': 'fan',
  'laptop-screen': 'screen',
  'laptop-dc-jack': 'dcJack',
  'laptop-battery': 'battery',
  'pc-clean-paste': 'cpuCooler',
  'pc-psu': 'psu',
  'pc-ram-ssd': 'ram',
  'board-charging': 'mosfets',
  'board-liquid-damage': 'pcb',
  'board-short-circuit': 'capacitors',
  'board-bga-rework': 'bga',
  'board-car-ecu': 'connector',
  'coffee-clean-manual': 'groupHead',
  'coffee-clean-auto': 'grinder',
  'coffee-descale': 'boiler',
  'coffee-repair': 'pump',
  'coffee-board': 'controlBoard',
  'board-console': 'connector',
  'vintage-cassette': 'tapeMechanism',
  'vintage-reel': 'belts',
  'vintage-amp': 'capacitors',
  'vintage-turntable': 'belts',
  'appliance-control-board': 'controlBoard',
  'appliance-kitchen': 'motor',
  'appliance-vacuum': 'brushes',
  'it-os-reinstall': 'ssd',
  'it-data-recovery': 'ssd',
  'it-malware-tune-up': 'ram',
  'auto-obd-diagnosis': 'obdPort',
  'auto-led-interior': 'ledModule',
  'auto-led-headlight': 'headlight',
  'auto-dashcam': 'dashcam',
  'auto-parking-sensors': 'wiring',
  'auto-carplay-interface': 'ecu',
  'auto-battery-drain': 'wiring',
  'home-washer-diagnosis': 'controlBoard',
  'home-washer-pump': 'pump',
  'home-washer-heater': 'heater',
  'home-dishwasher': 'controlBoard',
  'home-oven': 'heater',
  'home-fridge': 'motor',
}
