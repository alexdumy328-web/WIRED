import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
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
  return (
    <div className="absolute inset-0">
      <img src="/img/lab.jpg" alt="" className="size-full object-cover opacity-40" />
    </div>
  )
}

/** The 3D shop, fixed behind the whole page. */
export function SceneLayer() {
  const { t } = useI18n()
  const { resolved } = useTheme()
  const reduced = useReducedMotion()
  const [webgl] = useState(hasWebGL)

  const onSelect = (id: StopId) => {
    sceneState.focus = id
    document.getElementById(stopSection[id])?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="fixed inset-0 z-0" aria-hidden={!webgl}>
      {webgl ? (
        <SceneBoundary fallback={<PhotoFallback />}>
          <Suspense fallback={<Loader progress={0} done={false} />}>
            <SceneHost
              theme={resolved}
              reducedMotion={reduced}
              className="size-full"
              showHotspots
              labels={t.hotspots}
              onSelect={onSelect}
            />
          </Suspense>
        </SceneBoundary>
      ) : (
        <PhotoFallback />
      )}
    </div>
  )
}
