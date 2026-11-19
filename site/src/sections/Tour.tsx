import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '../i18n'
import { TOUR, sceneState } from '../three/contract'
import { Arrow } from '../components/Icons'

/** Map page progress (0..1) to a tour position with a short hold at each stop. */
function toStopT(p: number) {
  const n = TOUR.length - 1
  const seg = Math.min(Math.max(p, 0), 1) * n
  const i = Math.min(Math.floor(seg), n - 1)
  const f = seg - i
  const x = Math.min(Math.max((f - 0.22) / 0.56, 0), 1)
  return i + x * x * (3 - 2 * x)
}

export function Tour() {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  const [stop, setStop] = useState(0)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const p = -r.top / Math.max(r.height - vh, 1)
      const tt = toStopT(p)
      sceneState.t = tt
      setStop(Math.round(tt))
      // While the tour covers the middle of the screen it owns the camera.
      if (r.top <= vh / 2 && r.bottom >= vh / 2) {
        sceneState.focus = null
        // Push the diorama right while the headline needs the left half.
        sceneState.frame = tt < 0.5 ? 1.5 : 0.8
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  const captions = [t.tour.overview, t.tour.pcbWall, t.tour.bench, t.tour.counter, t.tour.door]
  const cap = captions[stop]

  return (
    <section id="top" ref={ref} aria-label="Norgelis Tech" style={{ height: `${TOUR.length * 100 + 20}vh` }} className="relative">
      {/* Washes so text stays legible over the model. */}
      <div className="pointer-events-none fixed inset-y-0 left-0 z-[1] hidden w-[46%] bg-gradient-to-r from-bg/85 via-bg/40 to-transparent md:block" aria-hidden="true" style={{ opacity: stop === 0 ? 1 : 0.7 }} />
      <div className="pointer-events-none sticky top-0 z-10 flex h-[100dvh] items-end md:items-center">
        <div className="mx-auto w-full max-w-[1320px] px-4 pb-10 sm:px-6 md:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            {stop === 0 ? (
              <motion.div
                key="hero"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="scrim-mobile pointer-events-auto max-w-[40rem]"
              >
                <h1 className="display text-[clamp(2.5rem,5.4vw,4.75rem)]">{t.hero.title}</h1>
                <p className="measure mt-6 text-lg text-muted sm:text-xl">{t.hero.lead}</p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <a href="#programare" className="btn btn-gold">
                    {t.hero.ctaBook}
                  </a>
                  <a href="#servicii" className="btn btn-ghost">
                    {t.hero.ctaPrices}
                  </a>
                </div>
                <p className="mt-14 hidden items-center gap-3 text-sm text-muted md:flex">
                  <span className="relative h-9 w-[22px] rounded-full border border-line">
                    <span className="absolute left-1/2 top-1.5 h-2 w-[3px] -translate-x-1/2 rounded-full bg-gold motion-safe:animate-bounce" />
                  </span>
                  {t.hero.scrollHint}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={stop}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="scrim-mobile pointer-events-auto max-w-[30rem]"
              >
                <TourProgress stop={stop} />
                <h2 className="display-2 mt-5 text-[clamp(2rem,4.2vw,3.4rem)]">{cap.title}</h2>
                <p className="measure mt-4 text-lg text-muted">{cap.body}</p>
                {stop === TOUR.length - 1 && (
                  <a href="#auto" className="btn btn-ghost mt-7">
                    {t.nav.mobile}
                    <Arrow className="size-4" />
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

/** A short trace with one via per stop; the active via lights up gold. */
function TourProgress({ stop }: { stop: number }) {
  const n = TOUR.length - 1
  return (
    <div className="flex items-center" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const k = i + 1
        const lit = k <= stop
        return (
          <span key={k} className="flex items-center">
            {i > 0 && <span className={`h-[2px] w-8 transition-colors duration-500 ${lit ? 'bg-gold' : 'bg-line'}`} />}
            <span
              className={`grid size-3.5 place-items-center rounded-full border-2 transition-colors duration-500 ${lit ? 'border-gold' : 'border-line'}`}
            >
              <span className={`size-1 rounded-full ${k === stop ? 'bg-gold' : 'bg-transparent'}`} />
            </span>
          </span>
        )
      })}
    </div>
  )
}
