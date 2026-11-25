import { describe, expect, it } from 'vitest'
import { MODELS } from '../contract'
import { findClashes } from './collide'

describe('exploded devices', () => {
  for (const id of MODELS)
    it(`${id}: no part passes through another while exploding`, () => {
      const c = findClashes(id)
      if (c.length) console.log(id, c.map((x) => `${x.a} through ${x.b} at g=${x.g.toFixed(2)} (${(x.frac * 100).toFixed(1)}%)`).join('\n  '))
      expect(c.map((x) => `${x.a}>${x.b}`)).toEqual([])
    })
})
