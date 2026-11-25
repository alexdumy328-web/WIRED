import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '../i18n'
import { Section } from '../components/Section'
import { Plus } from '../components/Icons'

export function Faq() {
  const { t } = useI18n()
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Section id="intrebari" title={t.faq.title}>
      <div className="max-w-[52rem]">
<ul className="border-t border-line">
            {t.faq.items.map((item, i) => {
              const isOpen = open === i
              return (
                <li key={item.q} className="border-b border-line">
                  <h3>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold"
                      aria-expanded={isOpen}
                      aria-controls={`faq-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                    >
                      {item.q}
                      <Plus className={`size-4 shrink-0 text-muted transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} />
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="measure pb-5 text-muted">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              )
            })}
          </ul>
      </div>
    </Section>
  )
}
