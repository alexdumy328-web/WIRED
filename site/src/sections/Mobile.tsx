import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { catalog } from '../data/catalog'
import { preselect } from '../lib/booking-store'
import { Section } from '../components/Section'
import { JobRow, StageCard } from './Services'
import { sceneState } from '../three/contract'
import { Check, Pin } from '../components/Icons'

type Tab = 'auto' | 'appliances'

export function Mobile() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('auto')
  const model = tab === 'auto' ? 'auto' : 'largeAppliance'
  const jobs = catalog.filter((j) => j.mode === 'mobile' && (tab === 'auto' ? j.category === 'auto' : j.category === 'appliance'))

  return (
    <Section id="mobil" title={t.mobile.title} lead={t.mobile.lead}>
      <div role="tablist" aria-label={t.mobile.title} className="inline-flex rounded-full border border-line p-1">
        {(['auto', 'appliances'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => {
              sceneState.highlight = null
              setTab(k)
            }}
            className={`relative rounded-full px-5 py-2 text-[15px] font-semibold transition-colors ${tab === k ? 'text-bg' : 'text-muted hover:text-ink'}`}
          >
            {tab === k && <motion.span layoutId="mobile-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
            <span className="relative">{t.mobile.tabs[k]}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
      <div className="hidden lg:block">
        <StageCard model={model} className="sticky top-24" tall label={t.mobile.tabs[tab]} hint={t.services.stageHint} />
      </div>
      <div className="min-w-0">
      <StageCard model={model} className="mt-5 lg:hidden" label={t.mobile.tabs[tab]} hint={t.services.stageHint} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          <ul className="mt-6 grid gap-3 text-[15px] sm:mt-7 sm:grid-cols-2 sm:text-[17px]">
            {t.mobile.points[tab].map((p) => (
              <li key={p} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-gold" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-6 rounded-[24px] border border-line bg-surface px-4 sm:mt-8 sm:px-7 [&>li:last-child]:border-0">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} onBook={() => preselect([j.id], 'mobile')} />
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
      </div>
      </div>

      <div className="mt-7 flex flex-col gap-4 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
        <button type="button" className="btn btn-gold w-full sm:w-auto" onClick={() => preselect([], 'mobile')}>
          {t.mobile.bookThis}
        </button>
        <p className="flex items-start gap-2 text-[15px] text-muted">
          <Pin className="mt-0.5 size-5 shrink-0" />
          <span>
            {t.mobile.area}. {fmt(t.mobile.travelFee, { price: 2 })}
          </span>
        </p>
      </div>
    </Section>
  )
}
