import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Color, MeshBasicMaterial, MeshStandardMaterial, Vector3, type Camera, type Group, type Material, type Object3D } from 'three'
import type { Bucket } from './builder'
import { MODEL_PARTS, sceneState, type ModelId } from './contract'
import { ASSEMBLE_TIME, EXPLODE_TIME, getMerged, getModel, partProgress, type PartAsset } from './devices'
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
  const labelEl = useRef<HTMLSpanElement>(null)
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
        const t = partProgress(p.start, s.g)
        o.position.lerpVectors(p.posA, p.posE, t)
        o.rotation.set(p.rotA.x + (p.rotE.x - p.rotA.x) * t, p.rotA.y + (p.rotE.y - p.rotA.y) * t, p.rotA.z + (p.rotE.z - p.rotA.z) * t)
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
    if (want !== label) setLabel(want)
    const el = labelEl.current
    if (el) el.style.opacity = String(clamp01((s.presence - 0.6) / 0.4))

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

  const labelPart = label ? asset.parts.find((p) => p.spec.id === label) : undefined
  const labelText = label ? (partLabels?.[`${id}.${label}`] ?? label) : ''

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
      {labelPart === p && (
        <PartLabel
          key={`label-${label}`}
          anchor={[(p.box.min.x + p.box.max.x) / 2, p.box.max.y, (p.box.min.z + p.box.max.z) / 2]}
          text={labelText}
          spanRef={labelEl}
        />
      )}
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

const _w = new Vector3()

/** Label next to the highlighted part, clamped inside the canvas. */
function PartLabel({ anchor, text, spanRef }: { anchor: [number, number, number]; text: string; spanRef: React.RefObject<HTMLSpanElement | null> }) {
  const calc = useMemo(
    () => (obj: Object3D, camera: Camera, size: { width: number; height: number }) => {
      obj.updateWorldMatrix(true, false)
      _w.setFromMatrixPosition(obj.matrixWorld).project(camera)
      let x = (_w.x * 0.5 + 0.5) * size.width
      let y = (-_w.y * 0.5 + 0.5) * size.height
      const el = spanRef.current
      const w = el?.offsetWidth ?? 120
      const h = el?.offsetHeight ?? 28
      const pad = 10
      x = Math.min(Math.max(x, w / 2 + pad), size.width - w / 2 - pad)
      y = Math.min(Math.max(y, h + 12 + pad), size.height - pad)
      return [x, y]
    },
    [spanRef],
  )
  return (
    <group position={anchor}>
      <Html calculatePosition={calc} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <span
          ref={spanRef}
          className="nt-part-label"
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap', position: 'absolute', left: 0, top: 0, transform: 'translate(-50%, calc(-100% - 12px))' }}
        >
          {text}
        </span>
      </Html>
    </group>
  )
}
