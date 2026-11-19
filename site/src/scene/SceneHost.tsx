import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import WorkshopCanvas from '../three/WorkshopCanvas'
import type { WorkshopCanvasProps } from '../three/contract'
import { Loader } from './Loader'

/** Lazy chunk: the 3D scene plus a loader that tracks texture/asset progress. */
export default function SceneHost(props: WorkshopCanvasProps) {
  const { active, progress } = useProgress()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!active && progress >= 100) {
      const id = window.setTimeout(() => setDone(true), 350)
      return () => window.clearTimeout(id)
    }
    // Nothing to load (or loader never started): give up waiting after 4 s.
    const id = window.setTimeout(() => setDone(true), 4000)
    return () => window.clearTimeout(id)
  }, [active, progress])
  return (
    <>
      <WorkshopCanvas {...props} />
      <Loader progress={done ? 100 : progress} done={done} />
    </>
  )
}
