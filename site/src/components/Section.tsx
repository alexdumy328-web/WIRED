import type { ReactNode } from 'react'

type Props = {
  id: string
  title: string
  lead?: string
  aside?: ReactNode // right side of the header row (e.g. a rating)
  className?: string
  children: ReactNode
}

/** A plain page section in the content column. */
export function Section({ id, title, lead, aside, className = '', children }: Props) {
  return (
    <section id={id} className={`relative scroll-mt-20 py-14 sm:py-24 ${className}`}>
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <h2 className="display-2 text-[clamp(1.85rem,3.6vw,3.2rem)]">{title}</h2>
          {lead && <p className="measure mt-3 text-[16px] text-muted sm:mt-4 sm:text-lg">{lead}</p>}
        </div>
        {aside}
      </header>
      <div className="mt-7 sm:mt-10">{children}</div>
    </section>
  )
}
