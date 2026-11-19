import type { ReactNode } from 'react'
import { useStation } from '../lib/stations'
import type { StopId } from '../three/contract'

type Props = {
  id: string
  stop: StopId
  title: string
  lead?: string
  aside?: ReactNode // right side of the header row (e.g. a rating)
  explode?: { from: number; to: number }
  onProgress?: (p: number) => void
  className?: string
  children: ReactNode
}

/**
 * A plain page section. The only link to the 3D backdrop is `stop`: while the
 * section is in the middle of the screen, the camera behind the veil drifts there.
 */
export function Section({ id, stop, title, lead, aside, explode, onProgress, className = '', children }: Props) {
  const ref = useStation<HTMLElement>({ stop, frame: 0, explode, onProgress })
  return (
    <section id={id} ref={ref} className={`relative z-10 scroll-mt-16 py-20 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <h2 className="display-2 text-[clamp(2rem,4.2vw,3.4rem)]">{title}</h2>
            {lead && <p className="measure mt-4 text-lg text-muted">{lead}</p>}
          </div>
          {aside}
        </header>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  )
}
