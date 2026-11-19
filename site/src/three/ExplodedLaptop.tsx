import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { BufferGeometry, Group, Material } from 'three'
import { GeoBuilder, type Bucket } from './builder'
import { sceneState } from './contract'
import { LAPTOP_SEAT } from './Bench'
import { C, rng } from './materials'

/**
 * Laptop on the second bench, with an Oryzo-style exploded view driven by
 * `sceneState.explode` (0..1). Local frame: depth along x (user at +x),
 * width along z, base sits on y = 0.
 *
 * Layers bottom -> top when exploded:
 *   bottom cover, screws, battery, motherboard, keyboard deck, display panel, lid
 */
const D = 0.235 // depth (x)
const Wd = 0.33 // width (z)
const OPEN = 1.85 // lid angle when open (rad)

type Layer = { geos: Map<Bucket, BufferGeometry> }

function layer(fn: (b: GeoBuilder) => void): Layer {
  const b = new GeoBuilder(false)
  fn(b)
  return { geos: b.build() }
}

function makeLayers() {
  const shell = '#555a60'
  const bottom = layer((b) => {
    b.box('metal', shell, [D, 0.006, Wd], [0, 0.003, 0], 0, 0.003)
    for (const x of [-D / 2 + 0.02, D / 2 - 0.02]) b.box('matte', '#141414', [0.012, 0.004, Wd - 0.06], [x, -0.001, 0])
    b.box('metal', shell, [0.006, 0.012, Wd], [-D / 2 + 0.003, 0.009, 0])
    b.box('metal', shell, [D, 0.012, 0.006], [0, 0.009, Wd / 2 - 0.003])
    b.box('metal', shell, [D, 0.012, 0.006], [0, 0.009, -Wd / 2 + 0.003])
  })
  const screws = layer((b) => {
    const pts: [number, number][] = [
      [-0.1, -0.15],
      [-0.1, 0],
      [-0.1, 0.15],
      [0.1, -0.15],
      [0.1, -0.05],
      [0.1, 0.05],
      [0.1, 0.15],
      [0, -0.15],
      [0, 0.15],
    ]
    for (const [x, z] of pts) {
      b.cyl('metal', '#d8dbde', 0.0045, 0.0045, 0.002, [x, 0.009, z], 0, 8)
      b.cyl('metal', '#b9bdc0', 0.0018, 0.0018, 0.008, [x, 0.004, z], 0, 6)
    }
  })
  const battery = layer((b) => {
    b.box('gloss', '#18191b', [0.085, 0.007, 0.27], [0.06, 0.0035, 0], 0, 0.002)
    for (let i = -2; i <= 2; i++) b.box('satin', '#26282b', [0.08, 0.0005, 0.048], [0.06, 0.0072, i * 0.054])
    b.box('gloss', '#e8c64a', [0.012, 0.004, 0.03], [0.012, 0.004, 0])
  })
  const board = layer((b) => {
    const r = rng(42)
    b.box('satin', C.pcbGreen, [0.115, 0.0025, 0.3], [-0.055, 0.00125, 0], 0, 0.001)
    b.box('satin', C.pcbBlue, [0.05, 0.0025, 0.07], [0.04, 0.00125, -0.11])
    // CPU + GPU dies with silver lids.
    b.box('gloss', '#141516', [0.04, 0.003, 0.04], [-0.06, 0.004, -0.04])
    b.box('metal', '#cfd2d5', [0.026, 0.0015, 0.026], [-0.06, 0.006, -0.04])
    b.box('gloss', '#141516', [0.034, 0.003, 0.034], [-0.06, 0.004, 0.04])
    b.box('metal', '#cfd2d5', [0.022, 0.0015, 0.022], [-0.06, 0.006, 0.04])
    // Copper heat pipe + fan.
    b.box('metal', C.copper, [0.008, 0.003, 0.17], [-0.06, 0.0085, 0.03])
    b.cyl('gloss', '#1d1e20', 0.032, 0.032, 0.008, [-0.07, 0.006, 0.12], 0, 18)
    b.cyl('satin', '#3a3c3f', 0.012, 0.012, 0.009, [-0.07, 0.006, 0.12], 0, 12)
    // RAM sticks with gold edge.
    for (const z of [-0.12, -0.095]) {
      b.box('satin', '#1b5c3a', [0.03, 0.002, 0.068], [-0.02, 0.0035, z])
      b.box('metal', C.gold, [0.004, 0.0022, 0.064], [-0.003, 0.0035, z])
      for (let i = 0; i < 4; i++) b.box('gloss', '#121314', [0.008, 0.0015, 0.01], [-0.022, 0.005, z - 0.024 + i * 0.016])
    }
    // Small chips, gold pads, connectors.
    for (let i = 0; i < 16; i++) {
      const s = 0.006 + r() * 0.01
      b.box('gloss', '#151617', [s, 0.002, s * (0.8 + r())], [-0.105 + r() * 0.09, 0.0035, -0.14 + r() * 0.28])
    }
    for (let i = 0; i < 26; i++) b.box('metal', C.gold, [0.004, 0.0008, 0.004], [-0.108 + r() * 0.1, 0.0029, -0.145 + r() * 0.29])
    b.box('metal', '#c9ccd0', [0.012, 0.006, 0.03], [-0.105, 0.005, -0.13])
    b.box('metal', '#c9ccd0', [0.012, 0.006, 0.02], [-0.105, 0.005, 0.07])
  })
  const deck = layer((b) => {
    b.box('metal', '#6e7378', [D, 0.005, Wd], [0, 0.0025, 0], 0, 0.002)
    const kw = 0.0165
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 15; col++) {
        const wide = row === 5 && col >= 5 && col <= 9
        if (row === 5 && col > 5 && col <= 9) continue
        b.box('gloss', '#141516', [row === 0 ? 0.008 : kw, 0.002, wide ? kw * 5 + 0.0028 * 4 : kw], [-0.075 + row * 0.019 - (row === 0 ? 0.004 : 0), 0.0055, -0.135 + col * 0.0193 + (wide ? kw * 2 + 0.0056 : 0)])
      }
    b.box('satin', '#9a9fa4', [0.07, 0.0008, 0.11], [0.073, 0.0053, 0])
  })
  const display = layer((b) => {
    // Local: panel in the lid's frame, screen side facing -y.
    b.box('gloss', '#0d0e10', [D - 0.012, 0.004, Wd - 0.012], [0, 0, 0])
    b.box('glow', '#2b5f93', [D - 0.03, 0.0005, Wd - 0.03], [0.004, -0.0022, 0])
    b.box('glow', '#9fd3ff', [0.05, 0.0006, 0.16], [0.03, -0.0025, -0.03])
    b.box('glow', '#d9a93f', [0.02, 0.0006, 0.07], [-0.04, -0.0025, 0.08])
  })
  const lid = layer((b) => {
    b.box('metal', shell, [D, 0.005, Wd], [0, 0.0025, 0], 0, 0.002)
    b.cyl('metal', '#2a2c2f', 0.005, 0.005, Wd - 0.08, [-D / 2 + 0.002, 0, 0], [Math.PI / 2, 0, 0], 8)
  })
  return { bottom, screws, battery, board, deck, display, lid }
}

function LayerMesh({ layer, mats }: { layer: Layer; mats: Record<Bucket, Material> }) {
  return (
    <>
      {[...layer.geos].map(([k, g]) => (
        <mesh key={k} geometry={g} material={mats[k]} castShadow={k !== 'glow'} />
      ))}
    </>
  )
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function ExplodedLaptop({ mats, reducedMotion }: { mats: Record<Bucket, Material>; reducedMotion: boolean }) {
  const layers = useMemo(makeLayers, [])
  useEffect(
    () => () => Object.values(layers).forEach((l) => l.geos.forEach((g) => g.dispose())),
    [layers],
  )
  const root = useRef<Group>(null)
  const refs = {
    bottom: useRef<Group>(null),
    screws: useRef<Group>(null),
    battery: useRef<Group>(null),
    board: useRef<Group>(null),
    deck: useRef<Group>(null),
    hinge: useRef<Group>(null),
    display: useRef<Group>(null),
  }
  const cur = useRef(0)

  useFrame((state, dt) => {
    const goal = clamp01(Number((sceneState as { explode?: number }).explode ?? 0))
    if (reducedMotion) cur.current = goal
    else cur.current += (goal - cur.current) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.22))
    const e = cur.current
    const r = root.current
    if (!r) return
    // Lift the whole assembly off the stand, turn it a little toward the camera, scale up for legibility.
    const lift = smooth(0.05, 0.55, e)
    const idle = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.8) * 0.006 * lift
    r.position.set(LAPTOP_SEAT[0] + 0.16 * lift, LAPTOP_SEAT[1] + 0.06 * lift + idle, LAPTOP_SEAT[2] + 0.04 * lift)
    r.rotation.set(0, -0.55 * lift, 0.05 * lift)
    r.scale.setScalar(1 + 0.6 * lift)

    // Lid closes first (0 .. 0.3), then layers separate with a stagger.
    const close = smooth(0.0, 0.3, e)
    const gap = 0.08
    // Top layers peel off first (higher i starts earlier) so no layer ever passes through the one above it.
    const st = (i: number) => smooth(0.22 + (6 - i) * 0.06, 0.64 + (6 - i) * 0.06, e)
    const y = (i: number) => i * gap * st(i)
    // Each higher layer steps back a little (fanned stack) so the front edge of every layer stays visible.
    const x = (i: number) => -i * 0.026 * st(i)
    refs.screws.current?.position.set(x(1), 0.006 + y(1) * 0.9, 0)
    refs.battery.current?.position.set(x(2), 0.006 + y(2), 0)
    refs.board.current?.position.set(x(3), 0.006 + y(3), 0)
    refs.deck.current?.position.set(x(4), 0.013 + y(4), 0)
    const hinge = refs.hinge.current
    if (hinge) {
      // At full explode the lid floats highest and tips its face toward the viewer.
      const top = st(6)
      hinge.position.set(-D / 2 + x(5.6) - 0.02 * top, 0.019 + y(5.6) + 0.05 * top, 0)
      hinge.rotation.z = OPEN * (1 - close) - 0.22 * top
    }
    const disp = refs.display.current
    if (disp) {
      // Separates downward from the lid shell and flips screen-up as it goes.
      const s = st(5)
      disp.position.set(D / 2, -0.0035 - gap * 1.0 * s, 0)
      disp.rotation.x = Math.PI * smooth(0.45, 0.95, e)
    }
  })

  return (
    <group ref={root} position={[LAPTOP_SEAT[0], LAPTOP_SEAT[1], LAPTOP_SEAT[2]]}>
      <group ref={refs.bottom}>
        <LayerMesh layer={layers.bottom} mats={mats} />
      </group>
      <group ref={refs.screws}>
        <LayerMesh layer={layers.screws} mats={mats} />
      </group>
      <group ref={refs.battery}>
        <LayerMesh layer={layers.battery} mats={mats} />
      </group>
      <group ref={refs.board}>
        <LayerMesh layer={layers.board} mats={mats} />
      </group>
      <group ref={refs.deck}>
        <LayerMesh layer={layers.deck} mats={mats} />
      </group>
      {/* Hinge pivot at the back edge; lid content extends toward +x when closed. */}
      <group ref={refs.hinge} position={[-D / 2, 0.019, 0]} rotation-z={OPEN}>
        <group position={[D / 2, 0.004, 0]}>
          <LayerMesh layer={layers.lid} mats={mats} />
        </group>
        <group ref={refs.display}>
          <LayerMesh layer={layers.display} mats={mats} />
        </group>
      </group>
    </group>
  )
}
