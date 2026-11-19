import type { ModelSpec } from './types'

export const VINTAGE: ModelSpec = {
  id: 'vintage',
  place: { pos: [0.48, 0.904, -1.6], yaw: Math.PI / 2 },
  view: { az: -25, el: 25 },
  parts: [
    { id: 'case', rank: 0, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.24, 0.025, 0]), xpos: [-0.24, 0.15, 0] },
    { id: 'faceplate', rank: 1, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.18, 0.025, 0]), xpos: [-0.18, 0.15, 0] },
    { id: 'tapeMechanism', rank: 2, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.12, 0.025, 0]), xpos: [-0.12, 0.15, 0] },
    { id: 'heads', rank: 3, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [-0.06, 0.025, 0]), xpos: [-0.06, 0.15, 0] },
    { id: 'belts', rank: 4, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [0.00, 0.025, 0]), xpos: [0.00, 0.15, 0] },
    { id: 'capacitors', rank: 5, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [0.06, 0.025, 0]), xpos: [0.06, 0.15, 0] },
    { id: 'transistors', rank: 6, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [0.12, 0.025, 0]), xpos: [0.12, 0.15, 0] },
    { id: 'pots', rank: 7, build: (b) => b.box('satin', '#888', [0.05, 0.05, 0.05], [0.18, 0.025, 0]), xpos: [0.18, 0.15, 0] },
  ],
}
