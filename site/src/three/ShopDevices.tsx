import { useFrame } from '@react-three/fiber'
import { useCallback, useRef, useState } from 'react'
import type { Material } from 'three'
import type { Bucket } from './builder'
import { MODELS, sceneState, type ModelId } from './contract'
import { DeviceModel } from './DeviceModel'
import { getModel, SPECS } from './devices'

const IDLE: ModelId[] = MODELS.filter((m) => SPECS[m].idle)

function Placed({ id, children }: { id: ModelId; children: React.ReactNode }) {
  const { pos, yaw } = SPECS[id].place
  return (
    <group position={[pos[0], pos[1], pos[2]]} rotation-y={yaw}>
      {children}
    </group>
  )
}

function ShopBase({ id, mats }: { id: ModelId; mats: Record<Bucket, Material> }) {
  const base = getModel(id).base
  if (!base) return null
  return (
    <>
      {base.map(([k, g]) => (
        <mesh key={k} geometry={g} material={mats[k]} castShadow={k !== 'glow'} receiveShadow />
      ))}
    </>
  )
}

/**
 * The service devices in the workshop. Idle props (laptop on its stand,
 * espresso machine on its desk) stay assembled at their spots; the device in
 * `sceneState.model` is mounted at its station and explodes / highlights.
 * Changing model: the current one reassembles (~0.5 s), leaves, the next one assembles in.
 */
export function ShopDevices({ mats, reducedMotion, partLabels }: { mats: Record<Bucket, Material>; reducedMotion: boolean; partLabels?: Record<string, string> }) {
  const [shown, setShown] = useState<ModelId | null>(() => sceneState.model)
  const leaving = useRef(false)
  const lastLeft = useRef<ModelId | null>(null)
  const first = useRef(true)

  useFrame(() => {
    const want = sceneState.model
    if (shown === null) {
      if (want !== null) setShown(want)
      return
    }
    leaving.current = want !== shown
  })

  const onLeft = useCallback(() => {
    lastLeft.current = shown
    leaving.current = false
    first.current = false
    setShown(sceneState.model)
  }, [shown])

  const taken = new Set<ModelId>(shown ? [shown, ...(SPECS[shown].replaces ?? [])] : [])
  return (
    <group>
      {IDLE.filter((id) => !taken.has(id)).map((id) => (
        <Placed key={`idle-${id}`} id={id}>
          <DeviceModel id={id} mats={mats} reducedMotion={reducedMotion} idle enter={first.current || lastLeft.current === id ? 'none' : 'scatter'} />
        </Placed>
      ))}
      {shown && (
        <Placed key={`on-${shown}`} id={shown}>
          <DeviceModel
            id={shown}
            mats={mats}
            reducedMotion={reducedMotion}
            leaving={leaving}
            onLeft={onLeft}
            enter={SPECS[shown].idle ? 'none' : 'scatter'}
            fadeOut={!SPECS[shown].idle}
            partLabels={partLabels}
          >
            <ShopBase id={shown} mats={mats} />
          </DeviceModel>
        </Placed>
      )}
    </group>
  )
}
