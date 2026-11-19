import { motion } from 'motion/react'
import { useI18n } from '../i18n'
import { Section } from '../components/Section'

/** Five steps in order, joined by a trace that draws once when the row scrolls into view. */
export function Process() {
  const { t } = useI18n()
  const steps = t.process.steps
  return (
    <Section id="proces" stop="bench" title={t.process.title}>
      <ol className="relative grid gap-8 md:grid-cols-5 md:gap-6">
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
    </Section>
  )
}
