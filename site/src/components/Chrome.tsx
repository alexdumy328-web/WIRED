import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useI18n } from '../i18n'

/** Text that rolls up letter by letter on hover (each letter is stacked twice). */
export function Roll({ text }: { text: string }) {
  return (
    <span className="roll" aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="roll-ch" style={{ transitionDelay: `${i * 14}ms` }} aria-hidden="true" data-ch={ch === ' ' ? ' ' : ch}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

const railIds = ['top', 'servicii', 'proces', 'auto', 'status', 'atelier', 'recenzii', 'programare', 'intrebari', 'contact'] as const

/** Fixed list of page stations; the active one is lit and every item jumps there. */
export function StationRail() {
  const { t, L } = useI18n()
  const [active, setActive] = useState<string>('top')
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = 0
      const mid = window.innerHeight / 2
      for (const id of railIds) {
        const r = document.getElementById(id)?.getBoundingClientRect()
        if (r && r.top <= mid && r.bottom >= mid) {
          setActive(id)
          break
        }
      }
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [])
  const labels: Record<(typeof railIds)[number], string> = {
    top: L({ ro: 'Atelier', en: 'Workshop' }),
    servicii: t.nav.services,
    proces: t.nav.process,
    auto: t.nav.mobile,
    status: t.track.title,
    atelier: L({ ro: 'Fotografii', en: 'Photos' }),
    recenzii: t.nav.reviews,
    programare: t.nav.book,
    intrebari: t.nav.faq,
    contact: t.contact.title,
  }
  return (
    <nav aria-label={L({ ro: 'Stații', en: 'Stations' })} className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 min-[1500px]:block">
      <ul className="flex flex-col items-end gap-1">
        {railIds.map((id) => {
          const on = id === active
          return (
            <li key={id}>
              <a href={`#${id}`} className="group flex items-center gap-3 py-1 text-[12px]" aria-current={on ? 'location' : undefined}>
                <span className={`transition-all duration-300 ${on ? 'text-ink opacity-100' : 'translate-x-1 text-muted opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`}>
                  {labels[id]}
                </span>
                <span className="relative grid size-3 place-items-center">
                  {on && <motion.span layoutId="rail-via" className="absolute inset-0 rounded-full border-2 border-gold" transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} />}
                  <span className={`size-1 rounded-full ${on ? 'bg-gold' : 'bg-muted/60'}`} />
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Viewfinder corners with the shop's real coordinates, like an instrument display. */
export function Viewfinder() {
  const c = 'absolute size-5 border-ink/35'
  return (
    <div className="pointer-events-none fixed inset-3 z-30 hidden md:block" aria-hidden="true">
      <span className={`${c} left-0 top-16 border-l border-t`} />
      <span className={`${c} right-0 top-16 border-r border-t`} />
      <span className={`${c} bottom-0 left-0 border-b border-l`} />
      <span className={`${c} bottom-0 right-0 border-b border-r`} />
      <span className="absolute bottom-1.5 left-8 text-[11px] text-muted">47.1660° N</span>
      <span className="absolute bottom-1.5 right-8 text-[11px] text-muted">27.5584° E</span>
    </div>
  )
}
