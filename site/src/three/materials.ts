import { useEffect, useMemo } from 'react'
import { Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three'
import type { Bucket } from './builder'
import type { Theme } from './contract'

/** Shared colours for the device models. */
export const C = {
  red: '#c8262b',
  yellow: '#f0b71c',
  copper: '#b8743d',
  gold: '#d9a93f',
  pcbGreen: '#1f6a47',
  pcbBlue: '#1d4f73',
} as const

/** Seeded PRNG so procedural details are identical between loads. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One material per bucket, created once; theme only nudges a few uniforms. */
export function useBucketMaterials(theme: Theme): Record<Bucket, Material> {
  const mats = useMemo(() => {
    const std = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]) => new MeshStandardMaterial({ vertexColors: true, ...o })
    return {
      matte: std({ roughness: 0.86, metalness: 0 }),
      satin: std({ roughness: 0.5, metalness: 0 }),
      gloss: std({ roughness: 0.22, metalness: 0 }),
      metal: std({ roughness: 0.32, metalness: 0.65 }),
      glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glass: std({ roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }),
      frosted: std({ roughness: 0.55, metalness: 0, transparent: true, opacity: 0.82 }),
    } satisfies Record<Bucket, Material>
  }, [])

  useEffect(() => {
    const k = theme === 'dark' ? 1 : 0.92
    ;(mats.glow as MeshBasicMaterial).color = new Color(k, k, k)
    ;(mats.glass as MeshStandardMaterial).opacity = theme === 'dark' ? 0.14 : 0.2
  }, [theme, mats])

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}
