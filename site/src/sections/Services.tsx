import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { catalog, categoryOrder } from '../data/catalog'
import { formatEta, formatLei } from '../lib/estimate'
import { preselect } from '../lib/booking-store'
import type { Job } from '../types'
import { Plus } from '../components/Icons'
import { categoryStop, useStation } from '../lib/stations'

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
  const ref = useStation<HTMLElement>({
    stop,
    frame: 0.42,
    explode: stop === 'laptop' ? { from: 0.15, to: 0.55 } : undefined,
  })

  return (
    <section id="servicii" ref={ref} className="pointer-events-none relative z-10 scroll-mt-16 lg:min-h-[190vh]">
      {/* On phones, leave a window onto the bench before the panel. */}
      <div className="h-[55vh] lg:hidden" />
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:sticky lg:top-20 lg:py-6">
        <div className="panel pointer-events-auto p-5 sm:p-8 lg:max-h-[calc(100dvh-7rem)] lg:w-[min(44rem,54%)] lg:overflow-y-auto lg:overscroll-contain" data-lenis-prevent>
          <h2 className="display-2 text-[clamp(2rem,3.6vw,3.1rem)]">{t.services.title}</h2>
          <p className="measure mt-4 text-muted">{t.services.lead}</p>

          <div role="tablist" aria-label={t.services.title} className="-mx-1 mt-7 flex flex-wrap gap-2">
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
                  className={`relative rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${active ? 'text-bg' : 'text-muted hover:text-ink'}`}
                  style={{ fontStretch: '108%' }}
                >
                  {active && <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
                  {!active && <span className="absolute inset-0 rounded-full border border-line" />}
                  <span className="relative">{t.services.categories[c].name}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-4 text-[15px] text-muted">{t.services.categories[cat].blurb}</p>

          <div id="servicii-panel" role="tabpanel" className="mt-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.ul
                key={cat}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="border-t border-line"
              >
                {jobs.map((j) => (
                  <JobRow key={j.id} job={j} onBook={() => preselect([j.id], 'shop')} />
                ))}
              </motion.ul>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
