import { useEffect, useRef, useState } from 'react'
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
 * scroll past on the right, with a trace that fills up to the current step.
 */
export function Process() {
  const { t } = useI18n()
  const steps = t.process.steps
  const { refs, active } = useActiveStep(steps.length)
  return (
    <Section id="proces" title={t.process.title}>
      {/* Phones and tablets */}
      <ol className="relative grid gap-7 md:grid-cols-5 md:gap-6 lg:hidden">
        <span
          aria-hidden="true"
          className="hidden md:block md:absolute md:inset-x-3 md:top-[calc(0.75rem-1px)] md:h-[2px] md:bg-gold/70"
        />
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-4 md:block">
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute -bottom-7 left-[calc(0.75rem-1px)] top-6 w-[2px] bg-gold/70 md:hidden"
              />
            )}
            <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 border-gold bg-bg text-[11px] font-bold text-gold">{i + 1}</span>
            <div className="min-w-0 md:mt-6">
              <p className="font-semibold" style={{ fontStretch: '110%' }}>
                {s.title}
              </p>
              <p className="mt-1.5 text-[15px] text-muted md:mt-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Desktop */}
      <div className="hidden gap-8 lg:grid xl:gap-14 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div>
          <DevicePanel model="laptop" explode={EXPLODE[active]} className="sticky top-24 h-[calc(100svh-8rem)] max-h-[680px] rounded-[32px] border border-line bg-surface-2">
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-line bg-bg/80 px-3 py-1.5 text-[13px] font-semibold backdrop-blur" aria-hidden="true">
              {fmt(t.process.step, { n: active + 1, total: steps.length })}
            </div>
          </DevicePanel>
        </div>
        {/* Bottom room keeps the laptop pinned while the last step sits mid-screen. */}
        <ol className="relative pb-[40svh] pt-[18svh]">
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
                {/* Trace from this step's pad to the next one's, gold once that step is reached. */}
                {i < steps.length - 1 && (
                  <span aria-hidden="true" className={`absolute -bottom-9 left-[11px] w-[2px] bg-line ${i === 0 ? 'top-3' : 'top-9'}`}>
                    <span className={`block size-full origin-top bg-gold transition-transform duration-500 ease-out ${i < active ? 'scale-y-100' : 'scale-y-0'}`} />
                  </span>
                )}
                <span
                  className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold transition-colors duration-300 ${on || done ? 'border-gold' : 'border-line'} ${on ? 'bg-gold text-on-gold' : done ? 'bg-bg text-gold' : 'bg-bg text-muted'}`}
                >
                  {i + 1}
                </span>
                <div className={`transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-60'}`}>
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
