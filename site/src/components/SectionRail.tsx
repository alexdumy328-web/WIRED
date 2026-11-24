import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { Dict } from '../i18n/dict'
import { getLenis } from '../lib/scroll'

/** The home page sections in order, with their rail labels. */
const SECTIONS: [id: string, label: (t: Dict) => string][] = [
  ['top', (t) => t.nav.top],
  ['servicii', (t) => t.nav.services],
  ['proces', (t) => t.nav.process],
  ['mobil', (t) => t.nav.mobile],
  ['status', (t) => t.nav.track],
  ['recenzii', (t) => t.nav.reviews],
  ['programare', (t) => t.nav.book],
  ['intrebari', (t) => t.nav.faq],
  ['contact', (t) => t.nav.contact],
]

/** Scrolls to a section. Both Lenis and the browser stop at its scroll-margin-top, below the header. */
function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const lenis = getLenis()
  if (id === 'top') {
    if (lenis) lenis.scrollTo(0)
    else window.scrollTo({ top: 0 })
  } else if (lenis) lenis.scrollTo(el)
  else el.scrollIntoView()
}

/** The section under the middle of the screen. */
function useActiveSection() {
  const [active, setActive] = useState('top')
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return active
}

/**
 * Desktop side rail: one gold pad per section on a trace, the current one lit and the trace
 * filled up to it. Hover or focus shows the section name; a click scrolls there.
 */
export function SectionRail() {
  const { t } = useI18n()
  const active = useActiveSection()
  const at = Math.max(0, SECTIONS.findIndex(([id]) => id === active))
  const fill = (at / (SECTIONS.length - 1)) * 100
  return (
    <nav aria-label={t.nav.sections} className="fixed right-2 top-1/2 z-30 hidden -translate-y-1/2 lg:block xl:right-4">
      <ol className="relative flex flex-col gap-1">
        <span aria-hidden="true" className="absolute bottom-3 left-1/2 top-3 w-px -translate-x-1/2 bg-line" />
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-3 w-px -translate-x-1/2 bg-gold transition-[height] duration-500 ease-out"
          style={{ height: `calc((100% - 1.5rem) * ${fill / 100})` }}
        />
        {SECTIONS.map(([id, label], i) => {
          const on = id === active
          const name = label(t)
          return (
            <li key={id} className="relative">
              <a
                href={id === 'top' ? '#' : `#${id}`}
                aria-current={on ? 'location' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  scrollToSection(id)
                }}
                className="group peer relative grid size-6 place-items-center rounded-full"
              >
                <span
                  className={`block rounded-full border transition-all duration-300 ${on ? 'size-3 border-gold bg-gold' : i < at ? 'size-2 border-gold bg-bg' : 'size-2 border-muted/60 bg-bg group-hover:border-ink'}`}
                />
                <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-semibold text-ink opacity-0 shadow-sm transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                  {name}
                </span>
                <span className="sr-only">{name}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
