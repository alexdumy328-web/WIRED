import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useReducedMotion, useTheme } from '../lib/theme'
import { stopSection } from '../lib/stations'
import { sceneState, type StopId } from '../three/contract'
import { Loader } from '../scene/Loader'

const SceneHost = lazy(() => import('../scene/SceneHost'))

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
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

function PhotoFallback() {
  return <img src="/img/lab.jpg" alt="" className="absolute inset-0 size-full object-cover" />
}

/**
 * The 3D shop as a backdrop. Fully visible in the hero; past it, a veil in the page
 * colour covers ~90% so the model only drifts behind the content.
 */
export function SceneLayer() {
  const { t } = useI18n()
  const { resolved } = useTheme()
  const reduced = useReducedMotion()
  const [webgl] = useState(hasWebGL)
  const [inHero, setInHero] = useState(true)
  const veil = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      const vh = window.innerHeight
      const p = Math.min(Math.max(window.scrollY / (vh * 0.7), 0), 1)
      if (veil.current) veil.current.style.opacity = String(p * 0.93)
      setInHero(p < 0.5)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [])

  const onSelect = (id: StopId) => {
    sceneState.focus = id
    document.getElementById(stopSection[id])?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`fixed inset-0 z-0 ${inHero ? '' : 'pointer-events-none'}`} aria-hidden={!inHero}>
      {webgl ? (
        <SceneBoundary fallback={<PhotoFallback />}>
          <Suspense fallback={<Loader progress={0} done={false} />}>
            <SceneHost
              theme={resolved}
              reducedMotion={reduced}
              className="size-full"
              showHotspots={inHero}
              labels={t.hotspots}
              onSelect={onSelect}
            />
          </Suspense>
        </SceneBoundary>
      ) : (
        <PhotoFallback />
      )}
      <div ref={veil} className="pointer-events-none absolute inset-0 bg-bg" style={{ opacity: 0 }} />
    </div>
  )
}
