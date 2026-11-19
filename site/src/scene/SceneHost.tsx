import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import WorkshopCanvas from '../three/WorkshopCanvas'
import DeviceStage from '../three/DeviceStage'
import type { DeviceStageProps, WorkshopCanvasProps } from '../three/contract'
import { Loader } from './Loader'

/** Waits for drei's loading manager, with a 4 s cap so a stuck asset never hides the scene. */
function useDone() {
  const { active, progress } = useProgress()
  const [done, setDone] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setDone(true), !active && progress >= 100 ? 250 : 4000)
    return () => window.clearTimeout(id)
  }, [active, progress])
  return { done, progress: done ? 100 : progress }
}

/** Lazy chunk: the shop scene with its loader. */
export function ShopHost(props: WorkshopCanvasProps) {
  const { done, progress } = useDone()
  return (
    <>
      <WorkshopCanvas {...props} />
      <Loader progress={progress} done={done} />
    </>
  )
}

/** Lazy chunk: the single-device stage with its loader. */
export function StageHost(props: DeviceStageProps) {
  const { done, progress } = useDone()
  return (
    <>
      <DeviceStage {...props} />
      <Loader progress={progress} done={done} />
    </>
  )
}
