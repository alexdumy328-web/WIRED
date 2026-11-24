import { describe, expect, it } from 'vitest'
import { Box3 } from 'three'
import { MODELS } from '../contract'
import { getModel, modelPoints } from '.'

const near = (a: Box3, b: Box3) => {
  for (const k of ['min', 'max'] as const) for (const ax of ['x', 'y', 'z'] as const) expect(a[k][ax]).toBeCloseTo(b[k][ax], 5)
}

describe('camera fit points', () => {
  for (const id of MODELS) {
    it(`${id}: match the exploded bounds at 1 and hold the assembled bounds at 0`, () => {
      const a = getModel(id)
      near(new Box3().setFromPoints(modelPoints(a, 1)), a.boxE)
      const at0 = new Box3().setFromPoints(modelPoints(a, 0)).expandByScalar(1e-6)
      expect(at0.containsBox(a.boxA)).toBe(true)
    })
  }
})
