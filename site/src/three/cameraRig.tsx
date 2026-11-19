import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { MODEL_STOP, sceneState, STATION_MODEL, STOPS, TOUR, type StopId } from './contract'
import { shopModelPose } from './devices'
import { fitView } from './devices/fit'
import { DIORAMA_PTS, NARROW_POSES, NARROW_PULL, POSES } from './layout'

type MutPose = { pos: Vector3; target: Vector3; fov: number }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const smoothstep = (t: number) => t * t * (3 - 2 * t)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const Y = new Vector3(0, 1, 0)

/** Portrait / square windows use the narrow poses; landscape (aspect >= 1) the desktop ones. */
const isNarrow = (aspect: number) => aspect < 1

const DIORAMA = DIORAMA_PTS.map((p) => new Vector3(p[0], p[1], p[2]))

function poseInto(out: MutPose, id: StopId, narrow: boolean, aspect = 1): MutPose {
  if (id === 'overview' && narrow) {
    // Portrait / square: fit the whole diorama, turned so its long axis runs up the screen.
    out.fov = 40
    fitView(DIORAMA, (26 * Math.PI) / 180, (50 * Math.PI) / 180, out.fov, aspect, out, 1.06, 1.06)
    return out
  }
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
const _off = new Vector3()

/** Pose along the scroll tour at continuous t. Eased per segment so the camera settles at each stop. */
function tourPose(out: MutPose, t: number, narrow: boolean, aspect: number): MutPose {
  const max = TOUR.length - 1
  const tt = clamp(Number.isFinite(t) ? t : 0, 0, max)
  const i = Math.min(Math.floor(tt), max - 1)
  const f = smoothstep(tt - i)
  poseInto(_a, TOUR[i], narrow, aspect)
  poseInto(_b, TOUR[i + 1], narrow, aspect)
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

type Flight = { fromPos: Vector3; fromTarget: Vector3; fromFov: number; start: number; dur: number; arc: number }

/** Advance the guided tour to the next station (and its default device). */
function nextTourStop() {
  const i = STOPS.indexOf(sceneState.focus ?? 'overview')
  const next = STOPS[(i + 1) % STOPS.length]
  const m = STATION_MODEL[next]
  sceneState.focus = next
  sceneState.model = m
  sceneState.explode = m ? 1 : 0
  sceneState.highlight = null
}

/**
 * Reads sceneState every frame:
 *  - focus set   -> flies to POSES[focus] along a slightly raised arc (ease-out, ~0.7-1.1 s)
 *                   or, when a device of that station is on show, to a pose that fits the device
 *  - focus null  -> follows the scroll tour at t (critically damped, ~0.35 s)
 *  - frame       -> lateral subject placement via camera.setViewOffset (damped; landscape only)
 *  - pointer     -> small parallax; plus a slow idle orbit of a few degrees (both off with reducedMotion)
 *  - tour        -> next station every ~6 s
 * In interactive mode it only flies between stations; in between, orbit controls own the camera.
 */
export function CameraRig({
  reducedMotion,
  interactive = false,
  controls,
}: {
  reducedMotion: boolean
  interactive?: boolean
  controls?: RefObject<OrbitControlsImpl | null>
}) {
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
    eCam: 0,
    tourAt: 0,
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
    const aspect = width / Math.max(1, height)
    const narrow = isNarrow(aspect)

    // Guided tour.
    if (sceneState.tour) {
      if (s.tourAt === 0) s.tourAt = now
      else if (now - s.tourAt > 6) {
        s.tourAt = now
        nextTourStop()
      }
    } else s.tourAt = 0

    const focus = sceneState.focus
    const model = sceneState.model
    const onModel = !!model && !!focus && MODEL_STOP[model] === focus
    const explode = clamp(Number(sceneState.explode) || 0, 0, 1)
    s.eCam = reducedMotion || interactive ? explode : dampScalar(s.eCam, explode, 0.45, dt)
    const key = focus ? `${focus}|${onModel ? model : ''}` : 'tour'
    if (onModel) s.goal.fov = shopModelPose(model, s.eCam, aspect, s.goal).fov
    else if (focus) poseInto(s.goal, focus, narrow, aspect)
    else tourPose(s.goal, sceneState.t, narrow, aspect)

    const ctl = interactive ? controls?.current : null

    if (!s.init) {
      s.pos.copy(s.goal.pos)
      s.target.copy(s.goal.target)
      s.fov = s.goal.fov
      s.key = key
      s.init = true
      if (ctl) {
        camera.position.copy(s.goal.pos)
        ctl.target.copy(s.goal.target)
        ctl.update()
      }
    }

    if (key !== s.key) {
      s.key = key
      if (!reducedMotion) {
        const fromPos = ctl ? camera.position.clone() : s.pos.clone()
        const fromTarget = ctl ? ctl.target.clone() : s.target.clone()
        const d = fromPos.distanceTo(s.goal.pos) + 0.5 * fromTarget.distanceTo(s.goal.target)
        s.flight = {
          fromPos,
          fromTarget,
          fromFov: ctl ? camera.fov : s.fov,
          start: now,
          dur: clamp(0.62 + d * 0.035, 0.7, 1.15) + (ctl ? 0.25 : 0),
          arc: clamp(d * 0.09, 0, 1.4),
        }
      } else if (ctl) {
        camera.position.copy(s.goal.pos)
        ctl.target.copy(s.goal.target)
        camera.fov = s.goal.fov
        camera.updateProjectionMatrix()
        ctl.update()
      }
    }

    if (ctl) {
      // Explore mode: fly between stations, otherwise leave the camera to the orbit controls.
      if (camera.view) camera.clearViewOffset()
      const f = s.flight
      if (f) {
        ctl.enabled = false
        const p = clamp((now - f.start) / f.dur, 0, 1)
        const e = easeInOutCubic(p)
        camera.position.lerpVectors(f.fromPos, s.goal.pos, e)
        camera.position.y += Math.sin(Math.PI * e) * f.arc
        s.virt.target.lerpVectors(f.fromTarget, s.goal.target, e)
        camera.lookAt(s.virt.target)
        camera.fov = f.fromFov + (s.goal.fov - f.fromFov) * e
        camera.updateProjectionMatrix()
        if (p >= 1) {
          s.flight = null
          ctl.target.copy(s.goal.target)
          ctl.enabled = true
          ctl.update()
        }
      } else ctl.enabled = true
      return
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

    // Idle orbit of a few degrees + pointer parallax, scaled with distance to the subject.
    const dist = s.pos.distanceTo(s.target)
    let ox = 0
    let oy = 0
    camera.position.copy(s.pos)
    if (!reducedMotion) {
      const amp = ((onModel ? 1.6 : 3.5) * Math.PI) / 180
      _off.subVectors(s.pos, s.target).applyAxisAngle(Y, Math.sin(now * 0.11) * amp)
      camera.position.copy(s.target).add(_off)
      s.px = dampScalar(s.px, clamp(sceneState.pointer.x, -1, 1), 0.6, dt)
      s.py = dampScalar(s.py, clamp(sceneState.pointer.y, -1, 1), 0.6, dt)
      const k = dist * 0.022
      ox = s.px * k + Math.sin(now * 0.21) * dist * 0.004
      oy = s.py * k * 0.6 + Math.sin(now * 0.17 + 1.3) * dist * 0.0025
    }
    camera.lookAt(s.target)
    if (ox || oy) {
      camera.translateX(ox)
      camera.translateY(oy)
      camera.lookAt(s.target)
    }

    // Lateral framing (landscape only; a device on show is always centred).
    const goalShift = narrow || onModel ? 0 : clamp(Number(sceneState.frame) || 0, -1.6, 1.6) / 6
    s.shift = reducedMotion ? goalShift : dampScalar(s.shift, goalShift, 0.45, dt)
    if (camera.fov !== s.fov) camera.fov = s.fov
    camera.setViewOffset(width, height, -s.shift * width, 0, width, height)
    camera.updateProjectionMatrix()
  })

  return null
}
