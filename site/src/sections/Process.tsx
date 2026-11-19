import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '../i18n'
import { useStation } from '../lib/stations'
import type { StopId } from '../three/contract'

/** Each step happens at a different place in the shop; the camera follows. */
const stepStops: StopId[] = ['pcbWall', 'bench', 'counter', 'laptop', 'door']

export function Process() {
  const { t } = useI18n()
  const steps = t.process.steps
  const [progress, setProgress] = useState(0)
  const active = Math.min(Math.floor(progress * steps.length), steps.length - 1)
  const ref = useStation<HTMLElement>({ stop: stepStops[active], frame: 0.42, onProgress: setProgress })

  return (
    <section id="proces" ref={ref} className="pointer-events-none relative z-10 scroll-mt-16" style={{ height: `${steps.length * 70 + 30}vh` }}>
      <div className="sticky top-0 flex h-[100dvh] items-end pb-6 md:items-center md:pb-0">
        <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6">
          <div className="panel pointer-events-auto p-5 sm:p-8 md:w-[min(36rem,50%)]">
            <h2 className="display-2 text-[clamp(1.8rem,3.4vw,2.9rem)]">{t.process.title}</h2>
            <ol className="relative mt-7">
              {/* The trace: a grey track with a gold fill that follows scroll. */}
              <span className="absolute left-[11px] top-3 bottom-3 w-[2px] bg-line" aria-hidden="true" />
              <span
                className="absolute left-[11px] top-3 w-[2px] origin-top bg-gold"
                style={{ height: 'calc(100% - 1.5rem)', transform: `scaleY(${Math.min(progress * 1.08, 1)})` }}
                aria-hidden="true"
              />
              {steps.map((s, i) => {
                const lit = i <= active
                const current = i === active
                return (
                  <li key={s.title} className="relative flex gap-5 py-2.5" aria-current={current ? 'step' : undefined}>
                    <span
                      className={`relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 bg-bg text-[11px] font-bold transition-colors duration-300 ${
                        lit ? 'border-gold text-gold' : 'border-line text-muted'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`font-semibold transition-colors duration-300 ${current ? 'text-ink' : 'text-muted'}`} style={{ fontStretch: '110%' }}>
                        {s.title}
                      </p>
                      <AnimatePresence initial={false}>
                        {current && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="measure overflow-hidden pt-1.5 text-[15px] text-muted"
                          >
                            {s.body}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
