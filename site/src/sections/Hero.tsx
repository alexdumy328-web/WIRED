import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { useI18n } from '../i18n'
import { focus, stopSection, useStation } from '../lib/stations'
import { openBooking } from '../lib/booking-store'
import { linkTo } from '../lib/router'
import { useReducedMotion } from '../lib/theme'
import { OpenStatus } from '../components/OpenStatus'
import { ShopPanel } from '../components/Scene3D'
import type { StopId } from '../three/contract'

/** First screen: headline on the left, the shop in a card on the right (on top on phones). */
export function Hero() {
  const { t } = useI18n()
  const reduced = useReducedMotion()
  const ref = useStation<HTMLElement>({ stop: 'overview' })
  const card = useRef<HTMLDivElement>(null)
  // As the hero scrolls away the card sinks back a little; it never moves while you read.
  const { scrollYProgress } = useScroll({ target: card, offset: ['start start', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1, 0.9])
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, 80])
  const opacity = useTransform(scrollYProgress, [0.5, 1], reduced ? [1, 1] : [1, 0.3])

  const onSelect = (id: StopId) => {
    focus(id)
    document.getElementById(stopSection[id])?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section id="top" ref={ref} className="relative grid min-h-[100svh] items-center gap-8 pb-12 pt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:pb-16">
      <div>
        <OpenStatus className="inline-flex" />
        <h1 className="display mt-5 max-w-[14ch] text-[clamp(2.4rem,5vw,4.6rem)]">{t.hero.title}</h1>
        <p className="measure mt-6 max-w-[34rem] text-lg text-muted sm:text-xl">{t.hero.lead}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <button type="button" className="btn btn-gold" onClick={() => openBooking()}>
            {t.hero.ctaBook}
          </button>
          <a href="#servicii" className="btn btn-ghost">
            {t.hero.ctaPrices}
          </a>
        </div>
      </div>
      <motion.div ref={card} style={{ scale, y, opacity }}>
        <div className="relative">
          <ShopPanel className="h-[36svh] rounded-[24px] sm:h-[42svh] border border-line lg:h-[min(76svh,760px)] lg:rounded-[32px]" onSelect={onSelect} />
          <a
            href="/atelier"
            onClick={linkTo('/atelier')}
            className="btn btn-ghost absolute bottom-3 left-3 h-10 min-h-0 border-line bg-bg/80 backdrop-blur lg:bottom-5 lg:left-5"
          >
            {t.workshopPage.explore}
          </a>
        </div>
      </motion.div>
    </section>
  )
}
