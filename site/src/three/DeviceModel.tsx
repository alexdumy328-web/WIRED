// @refresh reset
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Color, MeshBasicMaterial, MeshStandardMaterial, Vector3, type Camera, type Group, type Material } from 'three'
import type { Bucket } from './builder'
import { MODEL_PARTS, sceneState, type ModelId } from './contract'
import { ASSEMBLE_TIME, EXPLODE_TIME, getMerged, getModel, partPose, partProgress, type PartAsset } from './devices'
import { shadowFlags } from './Room'

const GOLD = new Color('#D9A93F')
const GOLD_EMISSIVE = new Color('#D9A93F').multiplyScalar(0.9)

/** What a mounted device is doing right now (read by the stage camera). */
export type DeviceRuntime = { id: ModelId | null; g: number; presence: number }

export type DeviceModelProps = {
  id: ModelId
  mats: Record<Bucket, Material>
  reducedMotion: boolean
  /** Plain prop: always assembled, never highlighted, shares the scene materials. */
  idle?: boolean
  /** Set to true to make the device reassemble and leave; `onLeft` fires when it is gone. */
  leaving?: { current: boolean }
  onLeft?: () => void
  /** How the device arrives: scale in from exploded ('scatter') or simply appear ('none'). */
  enter?: 'scatter' | 'none'
  /** Shrink away after reassembling (false when an identical idle prop takes over). */
  fadeOut?: boolean
  partLabels?: Record<string, string>
  runtime?: DeviceRuntime
  castShadow?: boolean
  children?: ReactNode
}

type MatEntry = { m: Material; base: Material }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const toward = (v: number, goal: number, step: number) => (v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function validHighlight(id: ModelId): string | null {
  const h = sceneState.highlight
  return h && (MODEL_PARTS[id] as readonly string[]).includes(h) ? h : null
}

export function DeviceModel({
  id,
  mats,
  reducedMotion,
  idle = false,
  leaving,
  onLeft,
  enter = 'scatter',
  fadeOut = true,
  partLabels,
  runtime,
  castShadow = true,
  children,
}: DeviceModelProps) {
  const asset = useMemo(() => getModel(id), [id])
  const root = useRef<Group>(null)
  const refs = useRef<(Group | null)[]>([])
  const labelUi = useRef<LabelUi>({ wrap: null, label: null, line: null, dot: null })
  const labelLay = useRef<LabelLayout>({ side: -1, x: 0, y: 0, init: false })
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (idle) return
    const ui = createLabelUi(gl.domElement.parentElement)
    if (!ui) return
    labelUi.current = ui
    return () => {
      ui.wrap?.remove()
      labelUi.current = { wrap: null, label: null, line: null, dot: null }
    }
  }, [gl, idle])
  const st = useRef({ g: enter === 'scatter' && !idle ? 1 : 0, presence: enter === 'scatter' ? 0 : 1, left: false, h: new Float32Array(asset.parts.length), dim: new Float32Array(asset.parts.length), init: false })
  const [label, setLabel] = useState<string | null>(null)

  // Per-part material clones so one part can glow while the others dim.
  const partMats = useMemo(() => {
    if (idle) return null
    return asset.parts.map((p) => {
      const m = new Map<Bucket, MatEntry>()
      for (const [k] of p.geos) m.set(k, { m: mats[k].clone(), base: mats[k] })
      return m
    })
  }, [asset, mats, idle])
  useEffect(() => () => partMats?.forEach((m) => m.forEach((e) => e.m.dispose())), [partMats])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = st.current
    const isLeaving = !!leaving?.current
    const goal = idle || isLeaving ? 0 : clamp01(Number(sceneState.explode) || 0)
    const g0 = s.g
    const p0 = s.presence
    if (reducedMotion) s.g = goal
    else s.g = toward(s.g, goal, dt / (goal > s.g ? EXPLODE_TIME : ASSEMBLE_TIME))
    if (isLeaving) {
      if (s.g <= 0.001) {
        if (!fadeOut || reducedMotion) s.presence = 0
        else s.presence = toward(s.presence, 0, dt / 0.2)
        if (s.presence <= 0 && !s.left) {
          s.left = true
          onLeft?.()
        }
      }
    } else s.presence = reducedMotion ? 1 : toward(s.presence, 1, dt / 0.32)

    const r = root.current
    if (r) {
      const k = Math.max(1e-4, easeOut(s.presence))
      r.scale.setScalar(k)
      r.visible = s.presence > 0.001
    }

    const moving = !s.init || s.g !== g0 || s.presence !== p0
    if (moving) {
      for (const p of asset.parts) {
        const o = refs.current[p.index]
        if (!o) continue
        const t = partProgress(p.start, s.g, p.span)
        partPose(p, t, o.position, o.rotation)
        if (p.spec.appear) {
          o.scale.setScalar(Math.max(1e-4, t))
          o.visible = t > 0.01
        }
      }
      if (castShadow) shadowFlags.dirty = true
      s.init = true
    }

    // Highlight: gold tint + soft pulse on the chosen part, the rest dims a little.
    const hl = idle || isLeaving ? null : validHighlight(id)
    if (partMats) {
      const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3.6)
      for (const p of asset.parts) {
        const on = hl !== null && p.hi === hl ? 1 : 0
        const dimGoal = hl !== null && !on ? 1 : 0
        const h = reducedMotion ? on : toward(s.h[p.index], on, dt / 0.25)
        const d = reducedMotion ? dimGoal : toward(s.dim[p.index], dimGoal, dt / 0.25)
        const changed = h !== s.h[p.index] || d !== s.dim[p.index] || h > 0
        s.h[p.index] = h
        s.dim[p.index] = d
        if (!changed && s.init) continue
        for (const e of partMats[p.index].values()) applyTint(e, h, d, pulse)
      }
    }
    const want = hl
    if (want !== label) {
      setLabel(want)
      labelLay.current.init = false
    }
    const ui = labelUi.current
    if (ui.wrap) ui.wrap.style.opacity = want ? String(clamp01((s.presence - 0.6) / 0.4)) : '0'
    if (ui.label && ui.label.textContent !== labelTextRef.current) ui.label.textContent = labelTextRef.current
    if (ui.wrap && want && root.current) {
      const part = asset.parts.find((p) => p.spec.id === want)
      if (part) layoutLabel(root.current, asset.parts, refs.current, part, state.camera, state.size, ui, labelLay.current, reducedMotion ? 1 : 1 - Math.exp(-dt / 0.12))
    }

    if (runtime) {
      runtime.id = id
      runtime.g = s.g
      runtime.presence = s.presence
    }
  })

  const children2 = useMemo(() => {
    const kids = new Map<number, PartAsset[]>()
    for (const p of asset.parts) {
      const list = kids.get(p.parent) ?? []
      list.push(p)
      kids.set(p.parent, list)
    }
    return kids
  }, [asset])

  const labelText = label ? (partLabels?.[`${id}.${label}`] ?? label) : ''
  const labelTextRef = useRef('')
  labelTextRef.current = labelText

  const renderPart = (p: PartAsset): ReactNode => (
    <group
      key={p.spec.id}
      ref={(o) => {
        refs.current[p.index] = o
      }}
      position={p.posA}
      rotation={p.rotA}
      scale={p.spec.appear ? 1e-4 : 1}
      visible={!p.spec.appear}
    >
      {p.geos.map(([k, g]) => (
        <mesh
          key={k}
          geometry={g}
          material={partMats ? partMats[p.index].get(k)!.m : mats[k]}
          castShadow={castShadow && k !== 'glow' && k !== 'glass'}
          receiveShadow={k !== 'glow'}
          renderOrder={k === 'glass' ? 2 : 0}
        />
      ))}
      {(children2.get(p.index) ?? []).map(renderPart)}
    </group>
  )

  if (idle) {
    // Static prop: the assembled model merged per material.
    return (
      <group ref={root} scale={st.current.presence > 0 ? 1 : 1e-4}>
        {getMerged(id).map(([k, g]) => (
          <mesh key={k} geometry={g} material={mats[k]} castShadow={castShadow && k !== 'glow' && k !== 'glass'} receiveShadow={k !== 'glow'} renderOrder={k === 'glass' ? 2 : 0} />
        ))}
        {children}
      </group>
    )
  }
  return (
    <group ref={root} scale={st.current.presence > 0 ? 1 : 1e-4}>
      <group rotation-y={asset.spec.frontYaw ?? 0}>{(children2.get(-1) ?? []).map(renderPart)}</group>
      {children}
    </group>
  )
}

function applyTint(e: MatEntry, h: number, d: number, pulse: number) {
  const k = 1 - 0.42 * d
  if (e.m instanceof MeshStandardMaterial) {
    e.m.color.setRGB(k, k, k).lerp(GOLD, 0.4 * h)
    e.m.emissive.copy(GOLD_EMISSIVE)
    e.m.emissiveIntensity = h * (0.38 + 0.3 * pulse)
    if (e.base.transparent) e.m.opacity = (e.base as MeshStandardMaterial).opacity * (1 - 0.3 * d)
  } else if (e.m instanceof MeshBasicMaterial) {
    e.m.color.copy((e.base as MeshBasicMaterial).color).multiplyScalar(k).lerp(GOLD, 0.45 * h)
  }
}

type LabelUi = {
  wrap: HTMLDivElement | null
  label: HTMLSpanElement | null
  line: SVGLineElement | null
  dot: SVGCircleElement | null
  /** Margins the page keeps covered (panels over the canvas), from --nt-safe-l/r/t/b. Re-read now and then. */
  safe?: { l: number; r: number; t: number; b: number; at: number }
}
/** side: 0 left, 1 right, 2 above, 3 below, 4 pinned to the top of the canvas. */
type LabelLayout = { side: number; x: number; y: number; init: boolean }

const _w = new Vector3()
const _c = new Vector3()

function toScreen(v: Vector3, camera: Camera, W: number, H: number): boolean {
  v.project(camera)
  const ok = v.z < 1
  v.set((v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, 0)
  return ok
}

/**
 * Places the part label outside the device's outline, on the side of the part, with a
 * leader line back to it, so the label never sits on top of another part.
 */
function layoutLabel(
  root: Group,
  parts: PartAsset[],
  objs: (Group | null)[],
  part: PartAsset,
  camera: Camera,
  size: { width: number; height: number },
  ui: LabelUi,
  lay: LabelLayout,
  k: number,
) {
  const { width: W, height: H } = size
  const el = ui.label
  if (!el || !ui.line || !ui.dot || !ui.wrap || W < 2 || H < 2) return
  const now = performance.now()
  if (!ui.safe || now - ui.safe.at > 500) {
    const cs = getComputedStyle(ui.wrap)
    const v = (n: string) => parseFloat(cs.getPropertyValue(n)) || 0
    ui.safe = { l: v('--nt-safe-l'), r: v('--nt-safe-r'), t: v('--nt-safe-t'), b: v('--nt-safe-b'), at: now }
  }
  // Usable area: the canvas minus whatever the page lays over it.
  const L = ui.safe.l
  const R = W - ui.safe.r
  const T = ui.safe.t
  const B = H - ui.safe.b
  root.updateWorldMatrix(true, true)
  // Screen outline of the device: projected corners of every visible part's box.
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const p of parts) {
    const o = objs[p.index]
    if (!o || !o.visible || p.box.isEmpty()) continue
    for (let c = 0; c < 8; c++) {
      _w.set(c & 1 ? p.box.max.x : p.box.min.x, c & 2 ? p.box.max.y : p.box.min.y, c & 4 ? p.box.max.z : p.box.min.z).applyMatrix4(o.matrixWorld)
      if (!toScreen(_w, camera, W, H)) continue
      x0 = Math.min(x0, _w.x)
      x1 = Math.max(x1, _w.x)
      y0 = Math.min(y0, _w.y)
      y1 = Math.max(y1, _w.y)
    }
  }
  const o = objs[part.index]
  if (!o || !Number.isFinite(x0)) return
  part.box.getCenter(_c).applyMatrix4(o.matrixWorld)
  toScreen(_c, camera, W, H)
  const ax = _c.x
  const ay = _c.y
  const w = el.offsetWidth || 110
  const h = el.offsetHeight || 26
  const pad = 10
  const gap = 24
  x0 = Math.max(x0, L)
  x1 = Math.min(x1, R)
  y0 = Math.max(y0, T)
  y1 = Math.min(y1, B)
  const fits = [x0 - gap - w >= L + pad, x1 + gap + w <= R - pad, y0 - gap - h >= T + pad, y1 + gap + h <= B - pad]
  // Prefer the side of the device the part is on; keep the current side while it still works (no flicker on the turntable).
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const pref = [ax < cx ? 0 : 1, ax < cx ? 1 : 0, ay < cy ? 2 : 3, ay < cy ? 3 : 2]
  // Best side that fits; left and right only swap once the part is clearly past the middle (no flicker on the turntable).
  let side = pref.find((v) => fits[v]) ?? 4
  const hyst = (x1 - x0) * 0.12
  if ((side === 0 || side === 1) && (lay.side === 0 || lay.side === 1) && side !== lay.side && fits[lay.side] && Math.abs(ax - cx) < hyst) side = lay.side
  let x: number
  let y: number
  if (side === 0 || side === 1) {
    x = side === 0 ? x0 - gap - w : x1 + gap
    y = Math.min(Math.max(ay - h / 2, T + pad), B - pad - h)
  } else if (side === 2 || side === 3) {
    x = Math.min(Math.max(ax - w / 2, L + pad), R - pad - w)
    y = side === 2 ? y0 - gap - h : y1 + gap
  } else {
    // No room around the device: pin the label to the top corner away from the part.
    x = ax < (L + R) / 2 ? R - pad - w : L + pad
    y = T + pad
  }
  if (!lay.init || side !== lay.side) {
    if (!lay.init) {
      lay.x = x
      lay.y = y
    }
    lay.side = side
    lay.init = true
  }
  lay.x += (x - lay.x) * k
  lay.y += (y - lay.y) * k
  el.style.transform = `translate3d(${lay.x.toFixed(1)}px, ${lay.y.toFixed(1)}px, 0)`
  // Leader from the part to the nearest point of the label.
  const lx = Math.min(Math.max(ax, lay.x), lay.x + w)
  const ly = Math.min(Math.max(ay, lay.y), lay.y + h)
  ui.line.setAttribute('x1', ax.toFixed(1))
  ui.line.setAttribute('y1', ay.toFixed(1))
  ui.line.setAttribute('x2', lx.toFixed(1))
  ui.line.setAttribute('y2', ly.toFixed(1))
  ui.dot.setAttribute('cx', ax.toFixed(1))
  ui.dot.setAttribute('cy', ay.toFixed(1))
}

const SVG = 'http://www.w3.org/2000/svg'

/** Overlay over the canvas (plain DOM, no React root): label, leader line and a dot on the part. */
function createLabelUi(host: HTMLElement | null): LabelUi | null {
  if (!host) return null
  const wrap = document.createElement('div')
  wrap.setAttribute('aria-hidden', 'true')
  wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 120ms linear;z-index:3;overflow:hidden'
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.style.cssText = 'position:absolute;inset:0'
  const line = document.createElementNS(SVG, 'line')
  line.setAttribute('stroke', '#D9A93F')
  line.setAttribute('stroke-width', '1.5')
  line.setAttribute('stroke-linecap', 'round')
  const dot = document.createElementNS(SVG, 'circle')
  dot.setAttribute('r', '3.5')
  dot.setAttribute('fill', '#D9A93F')
  dot.setAttribute('stroke', 'rgba(0,0,0,.35)')
  svg.append(line, dot)
  const label = document.createElement('span')
  label.className = 'nt-part-label'
  label.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform'
  wrap.append(svg, label)
  host.appendChild(wrap)
  return { wrap, label, line, dot }
}
