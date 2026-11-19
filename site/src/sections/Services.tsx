import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { catalog, categoryOrder } from '../data/catalog'
import { formatEta, formatLei } from '../lib/estimate'
import { preselect } from '../lib/booking-store'
import type { Job } from '../types'
import { Plus } from '../components/Icons'
import { categoryStop } from '../lib/stations'
import { Section } from '../components/Section'

type ShopCat = Exclude<(typeof categoryOrder)[number], 'auto'>
const shopCats = categoryOrder.filter((c): c is ShopCat => c !== 'auto')

export function usePrice() {
  const { t, lang } = useI18n()
  return (j: Pick<Job, 'priceFrom' | 'priceTo'>) => {
    const from = formatLei(j.priceFrom, lang).replace(/\s?lei$/, '')
    if (j.priceTo == null || j.priceTo === j.priceFrom) return fmt(t.services.fixed, { price: from })
    const to = formatLei(j.priceTo, lang).replace(/\s?lei$/, '')
    return fmt(t.services.range, { from, to })
  }
}

export function JobRow({ job, onBook }: { job: Job; onBook: () => void }) {
  const { t, lang, L } = useI18n()
  const price = usePrice()
  return (
    <li className="group grid grid-cols-[1fr_auto] items-start gap-x-5 gap-y-1 border-b border-line py-5 sm:grid-cols-[1fr_8.5rem_9.5rem_auto] sm:items-center">
      <div>
        <p className="font-semibold">{L(job.name)}</p>
        <p className="mt-0.5 text-[15px] text-muted">{L(job.description)}</p>
      </div>
      <p className="order-3 col-span-1 text-sm text-muted sm:order-none sm:text-[15px]">
        {fmt(t.services.eta, { eta: formatEta(job.etaHours, lang) })}
      </p>
      <div className="order-2 text-right sm:order-none">
        <p className="font-semibold" style={{ fontStretch: '110%' }}>
          {price(job)}
        </p>
        {job.needsDiagnosis && <p className="text-xs text-muted">{t.services.afterDiagnosis}</p>}
      </div>
      <button
        type="button"
        onClick={onBook}
        className="order-4 col-start-2 row-start-2 grid size-9 place-items-center justify-self-end rounded-full border border-line text-muted transition-colors hover:border-gold hover:text-gold sm:order-none sm:col-auto sm:row-auto"
        aria-label={`${t.services.bookThis}: ${L(job.name)}`}
        title={t.services.bookThis}
      >
        <Plus className="size-4" />
      </button>
    </li>
  )
}

export function Services() {
  const { t } = useI18n()
  const [cat, setCat] = useState<ShopCat>(shopCats[0])
  const jobs = catalog.filter((j) => j.category === cat)
  const stop = categoryStop[cat]

  return (
    <Section id="servicii" stop={stop} title={t.services.title} lead={t.services.lead} explode={stop === 'laptop' ? { from: 0.1, to: 0.5 } : undefined}>
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-14">
        <div role="tablist" aria-label={t.services.title} aria-orientation="vertical" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0">
          {shopCats.map((c) => {
            const active = c === cat
            return (
              <button
                key={c}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="servicii-panel"
                onClick={() => setCat(c)}
                className={`relative shrink-0 rounded-full border px-4 py-2 text-left transition-colors lg:rounded-none lg:border-0 lg:border-b lg:border-line lg:px-0 lg:py-4 lg:pl-5 ${
                  active ? 'border-ink bg-ink text-bg lg:bg-transparent lg:text-ink' : 'border-line text-muted hover:text-ink'
                }`}
              >
                {active && <motion.span layoutId="cat-trace" className="absolute left-0 top-1/2 hidden h-8 w-[3px] -translate-y-1/2 rounded-full bg-gold lg:block" />}
                <span className="font-semibold lg:text-lg" style={{ fontStretch: '110%' }}>
                  {t.services.categories[c].name}
                </span>
                <span className="hidden text-[14px] text-muted lg:mt-0.5 lg:block">{t.services.categories[c].blurb}</span>
              </button>
            )
          })}
        </div>

        <div id="servicii-panel" role="tabpanel" className="h-fit rounded-[24px] border border-line bg-surface px-5 sm:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul
              key={cat}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="[&>li:last-child]:border-0"
            >
              {jobs.map((j) => (
                <JobRow key={j.id} job={j} onBook={() => preselect([j.id], 'shop')} />
              ))}
            </motion.ul>
          </AnimatePresence>
        </div>
      </div>
    </Section>
  )
}
