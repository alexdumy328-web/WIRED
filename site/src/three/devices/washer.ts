import type { ModelSpec } from './types'

export const WASHER: ModelSpec = {
  id: 'largeAppliance',
  place: { pos: [5.05, 0, 2.62], yaw: 0.5 },
  view: { az: -25, el: 25 },
  parts: [
    { id: 'cabinet', rank: 0, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.21, 0.025, 0]), xpos: [-0.21, 0.15, 0] },
    { id: 'drum', rank: 1, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.15, 0.025, 0]), xpos: [-0.15, 0.15, 0] },
    { id: 'motor', rank: 2, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.09, 0.025, 0]), xpos: [-0.09, 0.15, 0] },
    { id: 'pump', rank: 3, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.03, 0.025, 0]), xpos: [-0.03, 0.15, 0] },
    { id: 'heater', rank: 4, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [0.03, 0.025, 0]), xpos: [0.03, 0.15, 0] },
    { id: 'controlBoard', rank: 5, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [0.09, 0.025, 0]), xpos: [0.09, 0.15, 0] },
    { id: 'door', rank: 6, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [0.15, 0.025, 0]), xpos: [0.15, 0.15, 0] },
  ],
}
