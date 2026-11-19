import { useEffect, useMemo } from 'react'
import {
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
} from 'three'
import type { Bucket } from './builder'
import type { Theme } from './contract'

/** Colours sampled from the reference photos. */
export const C = {
  white: '#f3f4f4',
  wallWhite: '#eceeef',
  black: '#1b1c1e',
  blackWall: '#202124',
  poche: '#55595e', // cut top of walls (architectural section colour)
  exterior: '#9a9fa4',
  benchTop: '#e8eaeb',
  benchLeg: '#d9dcde',
  greyBody: '#d4d7d9',
  pegboard: '#b6babd',
  skirting: '#5c6166',
  pvc: '#f5f6f6',
  red: '#c8262b',
  yellow: '#f0b71c',
  blue: '#1f54c4',
  matGreen: '#2d6e5c',
  steel: '#c6cacd',
  alu: '#b9bdc1',
  darkAlu: '#3b3e42',
  copper: '#b8743d',
  gold: '#d9a93f',
  cardboard: '#c9b08a',
  boxWhite: '#e9e6df',
  shelfBoard: '#dfe2e4',
  base: '#2f3236',
  baseTop: '#3a3e42',
  pcbGreen: '#1f6a47',
  pcbBlue: '#1d4f73',
} as const

/** Seeded PRNG so procedural textures are identical between loads. */
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

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  draw(g, w, h)
  const t = new CanvasTexture(cv)
  if (srgb) t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  return t
}

function grey(v: number, a = 1): string {
  const c = Math.max(0, Math.min(255, Math.round(v)))
  return `rgba(${c},${c + 1},${c + 3},${a})`
}

/** Stone-look blotches inside a rect (clipped). */
function mottle(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, base: number, spread: number, n: number) {
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  g.fillStyle = grey(base)
  g.fillRect(x, y, w, h)
  for (let i = 0; i < n; i++) {
    const rx = x + r() * w
    const ry = y + r() * h
    const rad = (0.08 + r() * 0.35) * Math.min(w, h)
    const grd = g.createRadialGradient(rx, ry, 0, rx, ry, rad)
    const v = base + (r() - 0.5) * spread
    grd.addColorStop(0, grey(v, 0.35))
    grd.addColorStop(1, grey(v, 0))
    g.fillStyle = grd
    g.fillRect(rx - rad, ry - rad, rad * 2, rad * 2)
  }
  g.restore()
}

/** Main room: large grey stone-look tiles, 0.6 x 1.2 m, staggered. Texture spans 2.4 m. */
export function makeMainFloor(): CanvasTexture {
  return canvasTex(1024, 1024, (g, w) => {
    const r = rng(11)
    const px = w / 2.4
    const tw = 0.6 * px
    const th = 1.2 * px
    for (let c = 0; c < 4; c++) {
      const off = c % 2 ? th / 2 : 0
      for (let k = -1; k < 3; k++) {
        const x = c * tw
        const y = k * th + off
        const base = 104 + r() * 22
        mottle(g, r, x, y, tw, th, base, 40, 26)
      }
    }
    g.strokeStyle = grey(70, 0.9)
    g.lineWidth = 2
    for (let c = 0; c <= 4; c++) {
      g.beginPath()
      g.moveTo(c * tw, 0)
      g.lineTo(c * tw, w)
      g.stroke()
      const off = c % 2 ? th / 2 : 0
      for (let k = -1; k < 3; k++) {
        g.beginPath()
        g.moveTo(c * tw, k * th + off)
        g.lineTo((c + 1) * tw, k * th + off)
        g.stroke()
      }
    }
  })
}

/** Vestibule: dark slate pieces in a mixed brick bond with light grout. Texture spans 1.2 m. */
export function makeSlateFloor(): CanvasTexture {
  return canvasTex(512, 512, (g, w) => {
    const r = rng(7)
    const px = w / 1.2
    const rowH = 0.2 * px
    const patterns = [
      [0.4, 0.2, 0.3, 0.3],
      [0.3, 0.4, 0.2, 0.3],
      [0.2, 0.3, 0.4, 0.3],
      [0.3, 0.3, 0.2, 0.4],
      [0.4, 0.3, 0.3, 0.2],
      [0.2, 0.4, 0.3, 0.3],
    ]
    g.fillStyle = '#9ba1a6'
    g.fillRect(0, 0, w, w)
    for (let row = 0; row < 6; row++) {
      const pat = patterns[row]
      let x = (row * 0.1 * px) % w
      for (let rep = 0; rep < 2; rep++)
        for (const len of pat) {
          const lw = len * px
          for (const sx of [x - w, x]) mottle(g, r, sx + 1.5, row * rowH + 1.5, lw - 3, rowH - 3, 64 + r() * 22, 34, 10)
          x += lw
          if (x > w * 2) break
        }
    }
  })
}

/** Grey pegboard with a 25 mm hole grid. Texture spans 0.6 m x 0.6 m. */
export function makePegboard(): CanvasTexture {
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#b9bdc0'
    g.fillRect(0, 0, w, w)
    const step = w / 24
    g.fillStyle = '#5e6266'
    for (let i = 0; i < 24; i++)
      for (let j = 0; j < 24; j++) {
        g.beginPath()
        g.arc((i + 0.5) * step, (j + 0.5) * step, 1.6, 0, Math.PI * 2)
        g.fill()
      }
  })
}

/** Concrete pavement slabs, 0.5 m. Texture spans 2 m. */
export function makePavement(): CanvasTexture {
  return canvasTex(512, 512, (g, w) => {
    const r = rng(3)
    const s = w / 4
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) mottle(g, r, i * s, j * s, s, s, 150 + r() * 14, 22, 8)
    g.strokeStyle = grey(110, 1)
    g.lineWidth = 2
    for (let i = 0; i <= 4; i++) {
      g.beginPath()
      g.moveTo(i * s, 0)
      g.lineTo(i * s, w)
      g.moveTo(0, i * s)
      g.lineTo(w, i * s)
      g.stroke()
    }
  })
}

/** Asphalt. Texture spans 3 m. */
export function makeAsphalt(): CanvasTexture {
  return canvasTex(512, 512, (g, w) => {
    const r = rng(5)
    g.fillStyle = grey(48)
    g.fillRect(0, 0, w, w)
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = grey(30 + r() * 50, 0.5)
      g.fillRect(r() * w, r() * w, 1.5, 1.5)
    }
  })
}

/** Soft radial glow (white -> transparent), used additively. */
export function makeRadialGlow(): CanvasTexture {
  return canvasTex(
    128,
    128,
    (g, w) => {
      const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
      grd.addColorStop(0, 'rgba(255,255,255,1)')
      grd.addColorStop(0.35, 'rgba(255,255,255,0.45)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, w, w)
    },
    false,
  )
}

/** Rounded-square soft glow (for the LED ceiling panels). */
export function makeSoftSquare(): CanvasTexture {
  return canvasTex(
    128,
    128,
    (g, w) => {
      const img = g.createImageData(w, w)
      for (let y = 0; y < w; y++)
        for (let x = 0; x < w; x++) {
          const dx = Math.max(Math.abs(x - w / 2 + 0.5) - w * 0.26, 0)
          const dy = Math.max(Math.abs(y - w / 2 + 0.5) - w * 0.26, 0)
          const a = Math.exp(-Math.hypot(dx, dy) / 7)
          const i = (y * w + x) * 4
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
          img.data[i + 3] = Math.round(a * 255)
        }
      g.putImageData(img, 0, 0)
    },
    false,
  )
}

/**
 * Glow that hugs the outline of a rectangle (the LED edge strip of the PCB
 * wall spilling onto the matte black wall). `inner` = rect size as a fraction of the texture.
 */
export function makeFrameGlow(innerW: number, innerH: number): CanvasTexture {
  const W = 128
  const H = 256
  const t = canvasTex(
    W,
    H,
    (g) => {
      const img = g.createImageData(W, H)
      const hx = (innerW * W) / 2
      const hy = (innerH * H) / 2
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const dx = Math.max(Math.abs(x - W / 2) - hx, 0)
          const dy = Math.max(Math.abs(y - H / 2) - hy, 0)
          const d = Math.hypot(dx, dy)
          const a = Math.exp(-d / 7) * 0.9 + Math.exp(-d / 26) * 0.35
          const i = (y * W + x) * 4
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
          img.data[i + 3] = Math.round(Math.min(1, a) * 255)
        }
      g.putImageData(img, 0, 0)
    },
    false,
  )
  t.wrapS = t.wrapT = 1001 // ClampToEdgeWrapping
  t.minFilter = LinearFilter
  return t
}

/** Theme-dependent multipliers. */
export function themeK(theme: Theme) {
  const dark = theme === 'dark'
  return {
    glow: dark ? 1 : 0.92,
    pcbEmissive: dark ? 0.85 : 0.42,
    halo: dark ? 0.95 : 0.4,
    env: dark ? 0.55 : 0.85,
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
    const k = themeK(theme)
    ;(mats.glow as MeshBasicMaterial).color = new Color(k.glow, k.glow, k.glow)
    ;(mats.glass as MeshStandardMaterial).opacity = theme === 'dark' ? 0.14 : 0.2
  }, [theme, mats])

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}
