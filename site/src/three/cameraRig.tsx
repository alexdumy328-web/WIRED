import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { sceneState, TOUR, type StopId } from './contract'
import { NARROW_POSES, NARROW_PULL, POSES } from './layout'

type MutPose = { pos: Vector3; target: Vector3; fov: number }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const smoothstep = (t: number) => t * t * (3 - 2 * t)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

function poseInto(out: MutPose, id: StopId, narrow: boolean): MutPose {
  const override = narrow ? NARROW_POSES[id] : undefined
  const p = override ?? POSES[id]
  out.target.set(p.target[0], p.target[1], p.target[2])
  out.pos.set(p.pos[0], p.pos[1], p.pos[2])
  out.fov = p.fov
  if (narrow && !override) {
    out.pos.sub(out.target).multiplyScalar(NARROW_PULL[id]).add(out.target)
    out.fov = p.fov + 4
  }
  return out
}

const mk = (): MutPose => ({ pos: new Vector3(), target: new Vector3(), fov: 35 })
const _a = mk()
const _b = mk()

/** Pose along the scroll tour at continuous t. Eased per segment so the camera settles at each stop. */
function tourPose(out: MutPose, t: number, narrow: boolean): MutPose {
  const max = TOUR.length - 1
  const tt = clamp(Number.isFinite(t) ? t : 0, 0, max)
  const i = Math.min(Math.floor(tt), max - 1)
  const f = smoothstep(tt - i)
  poseInto(_a, TOUR[i], narrow)
  poseInto(_b, TOUR[i + 1], narrow)
  out.pos.lerpVectors(_a.pos, _b.pos, f)
  out.target.lerpVectors(_a.target, _b.target, f)
  out.fov = _a.fov + (_b.fov - _a.fov) * f
  return out
}

/** Critically damped spring (Unity SmoothDamp), per component. */
function smoothDamp(cur: Vector3, goal: Vector3, vel: Vector3, smoothTime: number, dt: number) {
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  for (const k of ['x', 'y', 'z'] as const) {
    const change = cur[k] - goal[k]
    const temp = (vel[k] + omega * change) * dt
    vel[k] = (vel[k] - omega * temp) * exp
    cur[k] = goal[k] + (change + temp) * exp
  }
}

function dampScalar(cur: number, goal: number, smoothTime: number, dt: number) {
  return cur + (goal - cur) * (1 - Math.exp(-dt / Math.max(1e-4, smoothTime)))
}

type Flight = { fromPos: Vector3; fromTarget: Vector3; start: number; dur: number; arc: number }

/**
 * Reads sceneState every frame:
 *  - focus set   -> flies to POSES[focus] along a slightly raised arc (ease-out, ~0.7-1.1 s)
 *  - focus null  -> follows the scroll tour at t (critically damped, ~0.35 s)
 *  - frame       -> lateral subject placement via camera.setViewOffset (damped)
 *  - pointer     -> small parallax; plus a slow idle drift (both off with reducedMotion)
 */
export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const st = useRef({
    init: false,
    key: '' as string,
    flight: null as Flight | null,
    goal: mk(),
    virt: mk(),
    pos: new Vector3(),
    target: new Vector3(),
    vPos: new Vector3(),
    vTarget: new Vector3(),
    fov: 35,
    shift: 0,
    px: 0,
    py: 0,
  })

  useEffect(() => {
    // Reset view offset if the rig unmounts.
    return () => camera.clearViewOffset()
  }, [camera])

  useFrame((state, rawDt) => {
    const s = st.current
    const dt = Math.min(Math.max(rawDt, 1e-4), 0.1)
    const now = state.clock.elapsedTime
    const { width, height } = state.size
    const narrow = width / Math.max(1, height) < 0.8

    const focus = sceneState.focus
    const key = focus ?? 'tour'
    if (focus) poseInto(s.goal, focus, narrow)
    else tourPose(s.goal, sceneState.t, narrow)

    if (!s.init) {
      s.pos.copy(s.goal.pos)
      s.target.copy(s.goal.target)
      s.fov = s.goal.fov
      s.key = key
      s.init = true
    }

    if (key !== s.key) {
      s.key = key
      if (!reducedMotion) {
        const d = s.pos.distanceTo(s.goal.pos) + 0.5 * s.target.distanceTo(s.goal.target)
        s.flight = {
          fromPos: s.pos.clone(),
          fromTarget: s.target.clone(),
          start: now,
          dur: clamp(0.62 + d * 0.035, 0.7, 1.15),
          arc: clamp(d * 0.09, 0, 1.4),
        }
      }
    }

    let smooth = 0.35
    if (s.flight && !reducedMotion) {
      const f = s.flight
      const p = clamp((now - f.start) / f.dur, 0, 1)
      const e = easeOutCubic(p)
      s.virt.pos.lerpVectors(f.fromPos, s.goal.pos, e)
      s.virt.pos.y += Math.sin(Math.PI * e) * f.arc
      s.virt.target.lerpVectors(f.fromTarget, s.goal.target, e)
      smooth = 0.12
      if (p >= 1) s.flight = null
    } else {
      s.virt.pos.copy(s.goal.pos)
      s.virt.target.copy(s.goal.target)
    }

    if (reducedMotion) {
      s.pos.copy(s.virt.pos)
      s.target.copy(s.virt.target)
      s.vPos.set(0, 0, 0)
      s.vTarget.set(0, 0, 0)
      s.fov = s.goal.fov
    } else {
      smoothDamp(s.pos, s.virt.pos, s.vPos, smooth, dt)
      smoothDamp(s.target, s.virt.target, s.vTarget, smooth, dt)
      s.fov = dampScalar(s.fov, s.goal.fov, 0.35, dt)
    }

    // Parallax + idle drift, scaled with distance to the subject.
    const dist = s.pos.distanceTo(s.target)
    let ox = 0
    let oy = 0
    if (!reducedMotion) {
      s.px = dampScalar(s.px, clamp(sceneState.pointer.x, -1, 1), 0.6, dt)
      s.py = dampScalar(s.py, clamp(sceneState.pointer.y, -1, 1), 0.6, dt)
      const k = dist * 0.022
      ox = s.px * k + Math.sin(now * 0.21) * dist * 0.004
      oy = s.py * k * 0.6 + Math.sin(now * 0.17 + 1.3) * dist * 0.0025
    }
    camera.position.copy(s.pos)
    camera.lookAt(s.target)
    if (ox || oy) {
      camera.translateX(ox)
      camera.translateY(oy)
      camera.lookAt(s.target)
    }

    // Lateral framing.
    const goalShift = narrow ? 0 : clamp(Number(sceneState.frame) || 0, -1.6, 1.6) / 6
    s.shift = reducedMotion ? goalShift : dampScalar(s.shift, goalShift, 0.45, dt)
    if (camera.fov !== s.fov) camera.fov = s.fov
    camera.setViewOffset(width, height, -s.shift * width, 0, width, height)
    camera.updateProjectionMatrix()
  })

  return null
}
