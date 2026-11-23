import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { partLabels } from '../i18n/parts'
import { useReducedMotion, useTheme } from '../lib/theme'
import type { StopId } from '../three/contract'
import { Loader } from '../scene/Loader'

const ShopHost = lazy(() => import('../scene/SceneHost').then((m) => ({ default: m.ShopHost })))
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

const fallbackImg = <img src="/img/lab.jpg" alt="" className="absolute inset-0 size-full object-cover" />

type ShopProps = {
  className?: string
  onSelect?: (id: StopId) => void
}

/** The whole shop, in the hero card. */
export function ShopPanel({ className = '', onSelect }: ShopProps) {
  const { t, lang } = useI18n()
  const { resolved } = useTheme()
  const reduced = useReducedMotion()
  const { ref, near, visible } = useNearby<HTMLDivElement>()
  return (
    <div ref={ref} className={`overflow-hidden bg-surface-2 ${pos(className)}`}>
      {!webgl ? (
        fallbackImg
      ) : near ? (
        <Boundary fallback={fallbackImg}>
          <Suspense fallback={<Loader progress={0} done={false} />}>
            <ShopHost
              theme={resolved}
              reducedMotion={reduced}
              className="absolute inset-0"
              showHotspots
              labels={t.hotspots}
              onSelect={onSelect}
              paused={!visible}
              partLabels={partLabels(lang)}
            />
          </Suspense>
        </Boundary>
      ) : null}
    </div>
  )
}

/** One exploded device on a plinth (services, mobile, booking popup). */
export function DevicePanel({ className = '', children }: { className?: string; children?: ReactNode }) {
  const { lang } = useI18n()
  const { resolved } = useTheme()
  const reduced = useReducedMotion()
  const { ref, near, visible } = useNearby<HTMLDivElement>()
  return (
    <div ref={ref} className={`overflow-hidden ${pos(className)}`}>
      {webgl && near && (
        <Boundary fallback={null}>
          <Suspense fallback={<Loader progress={0} done={false} />}>
            <StageHost theme={resolved} reducedMotion={reduced} className="absolute inset-0" paused={!visible} partLabels={partLabels(lang)} />
          </Suspense>
        </Boundary>
      )}
      {children}
    </div>
  )
}
