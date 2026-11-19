import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { useI18n } from '../i18n'
import { useReducedMotion } from '../lib/theme'
import { useStation } from '../lib/stations'

/**
 * The one section that covers the 3D shop: real photos of the room,
 * so the model and the place can be compared.
 */
export function Workshop() {
  const { t } = useI18n()
  const reduced = useReducedMotion()
  const ref = useStation<HTMLElement>({ stop: 'overview', frame: 0 })
  const inner = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: inner, offset: ['start end', 'end start'] })
  const yA = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [40, -40])
  const yB = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [90, -70])
  const clip = useTransform(scrollYProgress, [0, 0.35], reduced ? ['inset(0% 0% 0% 0% round 28px)', 'inset(0% 0% 0% 0% round 28px)'] : ['inset(8% 6% 8% 6% round 40px)', 'inset(0% 0% 0% 0% round 28px)'])

  return (
    <section id="atelier" ref={ref} className="pointer-events-auto relative z-10 scroll-mt-16 bg-bg py-24 sm:py-32">
      <div ref={inner} className="mx-auto max-w-[1320px] px-4 sm:px-6">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
          <h2 className="display text-[clamp(2.4rem,6vw,5rem)]">{t.workshop.title}</h2>
          <p className="measure text-lg text-muted md:justify-self-end md:pb-2">{t.workshop.lead}</p>
        </div>

        <motion.figure style={{ clipPath: clip }} className="mt-12 overflow-hidden">
          <img src="/img/lab.jpg" alt={t.workshop.photos.lab} className="aspect-[16/10] w-full object-cover sm:aspect-[16/8]" loading="lazy" decoding="async" />
        </motion.figure>

        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <motion.figure style={{ y: yA }} className="overflow-hidden rounded-[28px]">
            <img src="/img/entrance.jpg" alt={t.workshop.photos.entrance} className="aspect-[4/3] w-full object-cover" loading="lazy" decoding="async" />
            <figcaption className="mt-3 text-[15px] text-muted">{t.workshop.photos.entrance}</figcaption>
          </motion.figure>
          <motion.figure style={{ y: yB }} className="overflow-hidden rounded-[28px] md:mt-24">
            <img src="/img/pcb-wall.jpg" alt={t.workshop.photos.pcbWall} className="aspect-[3/4] w-full object-cover" loading="lazy" decoding="async" />
            <figcaption className="mt-3 text-[15px] text-muted">{t.workshop.photos.pcbWall}</figcaption>
          </motion.figure>
        </div>
      </div>
    </section>
  )
}
