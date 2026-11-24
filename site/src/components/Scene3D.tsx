import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { partLabels } from '../i18n/parts'
import { useReducedMotion, useTheme } from '../lib/theme'
import { useBooking } from '../lib/booking-store'
import type { ModelId } from '../three/contract'
import { Loader } from '../scene/Loader'

const StageHost = lazy(() => import('../scene/SceneHost').then((m) => ({ default: m.StageHost })))

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
const webgl = typeof document !== 'undefined' && hasWebGL()

/**
 * Mounts a 3D panel only when it is within about a screen of the viewport, pauses it when
 * it leaves the screen, and unmounts it when far away, so at most one WebGL context runs.
 */
function useNearby<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const far = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '100% 0px' })
    const on = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 })
    far.observe(el)
    on.observe(el)
    return () => {
      far.disconnect()
      on.disconnect()
    }
  }, [])
  return { ref, near, visible }
}

/** Keep the caller's positioning (absolute/fixed); default to relative so the loader and labels anchor. */
const pos = (c: string) => (/\b(absolute|fixed|sticky)\b/.test(c) ? c : `relative ${c}`)

type PanelProps = {
  model: ModelId
  /** Exploded-view amount, 0 = assembled, 1 = fully exploded (default). */
  explode?: number
  className?: string
  /** The panel inside the booking popup; page panels pause while the popup covers them. */
  inDialog?: boolean
  children?: ReactNode
}

/** One exploded device on a plinth (services, process, mobile, booking popup). */
export function DevicePanel({ model, explode, className = '', inDialog = false, children }: PanelProps) {
  const { lang } = useI18n()
  const { resolved } = useTheme()
  const reduced = useReducedMotion()
  const { ref, near, visible } = useNearby<HTMLDivElement>()
  const covered = useBooking().open && !inDialog
  return (
    <div ref={ref} className={`overflow-hidden ${pos(className)}`}>
      {webgl && near && (
        <Boundary fallback={null}>
          <Suspense fallback={<Loader progress={0} done={false} />}>
            <StageHost model={model} explode={explode} theme={resolved} reducedMotion={reduced} className="absolute inset-0" paused={!visible || covered} partLabels={partLabels(lang)} />
          </Suspense>
        </Boundary>
      )}
      {children}
    </div>
  )
}
