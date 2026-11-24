import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useSpring } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { Section } from '../components/Section'
import { DevicePanel } from '../components/Scene3D'

/**
 * How far the laptop is taken apart at each step: whole when it comes in, opened for the
 * diagnosis, fully apart for the repair, and back together for pickup.
 */
const EXPLODE = [0, 0.55, 0.8, 1, 0]

/** The step whose row crosses the middle of the screen. */
function useActiveStep(count: number) {
  const refs = useRef<(HTMLLIElement | null)[]>([])
  const [active, setActive] = useState(0)
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step))
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    refs.current.slice(0, count).forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [count])
  return { refs, active }
}

/**
 * Five steps in order. Phones and tablets: a list joined by a trace that draws once.
 * Desktop: a laptop pinned on the left comes apart and goes back together as the steps
 * scroll past on the right, with a trace that fills with the scroll.
 */
export function Process() {
  const { t } = useI18n()
  const steps = t.process.steps
  const { refs, active } = useActiveStep(steps.length)
  const list = useRef<HTMLOListElement>(null)
  const { scrollYProgress } = useScroll({ target: list, offset: ['start 50%', 'end 50%'] })
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 })
  return (
    <Section id="proces" title={t.process.title}>
      {/* Phones and tablets */}
      <ol className="relative grid gap-8 md:grid-cols-5 md:gap-6 lg:hidden">
        <motion.span
          aria-hidden="true"
          className="absolute left-[11px] top-3 bottom-3 w-[2px] origin-top bg-gold md:inset-x-3 md:bottom-auto md:top-[11px] md:h-[2px] md:w-auto md:origin-left"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, margin: '-20% 0px' }}
          transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1] }}
        />
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-5 md:block">
            <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 border-gold bg-bg text-[11px] font-bold text-gold">{i + 1}</span>
            <div className="md:mt-6">
              <p className="font-semibold" style={{ fontStretch: '110%' }}>
                {s.title}
              </p>
              <p className="mt-2 text-[15px] text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Desktop */}
      <div className="hidden gap-14 lg:grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div>
          <DevicePanel model="laptop" explode={EXPLODE[active]} className="sticky top-24 h-[calc(100svh-8rem)] max-h-[680px] rounded-[32px] border border-line bg-surface-2">
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-line bg-bg/80 px-3 py-1.5 text-[13px] font-semibold backdrop-blur" aria-hidden="true">
              {fmt(t.process.step, { n: active + 1, total: steps.length })}
            </div>
          </DevicePanel>
        </div>
        <ol ref={list} className="relative py-[18svh]">
          <span aria-hidden="true" className="absolute bottom-[18svh] left-[11px] top-[18svh] w-[2px] bg-line" />
          <motion.span aria-hidden="true" className="absolute bottom-[18svh] left-[11px] top-[18svh] w-[2px] origin-top bg-gold" style={{ scaleY: fill }} />
          {steps.map((s, i) => {
            const on = i === active
            const done = i < active
            return (
              <li
                key={s.title}
                ref={(el) => {
                  refs.current[i] = el
                }}
                data-step={i}
                aria-current={on ? 'step' : undefined}
                className="relative flex min-h-[32svh] gap-6 py-6 first:pt-0 last:min-h-0 last:pb-0"
              >
                <span
                  className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold transition-colors duration-300 ${on || done ? 'border-gold' : 'border-line'} ${on ? 'bg-gold text-on-gold' : done ? 'bg-bg text-gold' : 'bg-bg text-muted'}`}
                >
                  {i + 1}
                </span>
                <div className={`transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-45'}`}>
                  <p className="display-2 text-[clamp(1.4rem,2vw,1.9rem)]">{s.title}</p>
                  <p className="measure mt-3 text-lg text-muted">{s.body}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </Section>
  )
}
