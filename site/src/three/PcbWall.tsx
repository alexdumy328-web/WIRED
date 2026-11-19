import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, SRGBColorSpace, type MeshBasicMaterial, type MeshStandardMaterial } from 'three'
import type { GeoBuilder } from './builder'
import type { Theme } from './contract'
import { C, makeFrameGlow, makeRadialGlow, themeK } from './materials'

/** Panel placement on the vestibule end wall (x = 0, facing +x). */
export const PCB = { z: 0.88, y: 1.36, w: 1.2, h: 2.36, x: 0.035 } as const
const LED = '#ffe7c4'

/** Static parts: recessed black frame + warm LED edge strip. */
export function buildPcbFrame(b: GeoBuilder): void {
  const { z, y, w, h } = PCB
  const t = 0.022
  // LED strip just outside the board panel.
  b.box('glow', LED, [0.02, t, w + 2 * t], [0.03, y + h / 2 + t / 2, z])
  b.box('glow', LED, [0.02, t, w + 2 * t], [0.03, y - h / 2 - t / 2, z])
  b.box('glow', LED, [0.02, h, t], [0.03, y, z + w / 2 + t / 2])
  b.box('glow', LED, [0.02, h, t], [0.03, y, z - w / 2 - t / 2])
  // Shallow black reveal around it.
  const o = 0.06
  b.box('satin', C.black, [0.05, 0.03, w + 2 * o], [0.025, y + h / 2 + o, z])
  b.box('satin', C.black, [0.05, 0.03, w + 2 * o], [0.025, y - h / 2 - o, z])
  b.box('satin', C.black, [0.05, h + 2 * o, 0.03], [0.025, y, z + w / 2 + o])
  b.box('satin', C.black, [0.05, h + 2 * o, 0.03], [0.025, y, z - w / 2 - o])
}

/** The hero detail: the real photo of the board wall as an emissive panel with a warm glow halo. */
export function PcbWall({ theme, reducedMotion }: { theme: Theme; reducedMotion: boolean }) {
  const photo = useTexture('/img/pcb-wall.jpg')
  const panelMat = useRef<MeshStandardMaterial>(null)
  const haloMat = useRef<MeshBasicMaterial>(null)
  const spillMat = useRef<MeshBasicMaterial>(null)
  const k = themeK(theme)

  const tex = useMemo(() => {
    const t = photo.clone()
    t.colorSpace = SRGBColorSpace
    // Crop to the LED-framed area of the photo (1343 x 1800 px).
    const x0 = 386
    const x1 = 1088
    const y0 = 222
    const y1 = 1652
    t.repeat.set((x1 - x0) / 1343, (y1 - y0) / 1800)
    t.offset.set(x0 / 1343, 1 - y1 / 1800)
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  }, [photo])
  const halo = useMemo(() => makeFrameGlow(PCB.w / 1.9, PCB.h / 3.1), [])
  const spill = useMemo(() => makeRadialGlow(), [])
  useLayoutEffect(() => () => tex.dispose(), [tex])

  useFrame(({ clock }) => {
    const breathe = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 0.9) * 0.035
    if (panelMat.current) panelMat.current.emissiveIntensity = k.pcbEmissive * breathe
    if (haloMat.current) haloMat.current.opacity = k.halo * breathe
    if (spillMat.current) spillMat.current.opacity = k.halo * 0.55 * breathe
  })

  const warm = useMemo(() => new Color(LED), [])
  return (
    <group>
      <mesh position={[PCB.x, PCB.y, PCB.z]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[PCB.w, PCB.h]} />
        <meshStandardMaterial ref={panelMat} map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={k.pcbEmissive} roughness={0.55} metalness={0.1} />
      </mesh>
      {/* LED halo spilling onto the black wall */}
      <mesh position={[0.012, PCB.y, PCB.z]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[1.9, 3.1]} />
        <meshBasicMaterial ref={haloMat} map={halo} color={warm} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* warm pool of light on the slate floor */}
      <mesh position={[0.55, 0.006, PCB.z]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.5, 2.2]} />
        <meshBasicMaterial ref={spillMat} map={spill} color={warm} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight position={[0.7, 1.5, PCB.z]} color={LED} intensity={theme === 'dark' ? 2.2 : 0.9} distance={3.2} decay={2} />
    </group>
  )
}
