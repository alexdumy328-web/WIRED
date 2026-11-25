import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fmt, useI18n } from '../i18n'
import { catalog, categoryOrder } from '../data/catalog'
import { formatEta, formatLei, jobPrice } from '../lib/estimate'
import { rateFor } from '../lib/pricing'
import { preselect } from '../lib/booking-store'
import type { Job } from '../types'
import { Plus } from '../components/Icons'
import { jobPart, modelFor } from '../lib/models'
import { sceneState, type ModelId } from '../three/contract'
import { Section } from '../components/Section'
import { DevicePanel } from '../components/Scene3D'

type ShopCat = Exclude<(typeof categoryOrder)[number], 'auto'>
const shopCats = categoryOrder.filter((c): c is ShopCat => c !== 'auto')

/** Formats a lei range like "150–200 lei" (or "150 lei"). */
export function useLeiRange() {
  const { t, lang } = useI18n()
  return ([lo, hi]: [number, number]) => {
    const from = formatLei(lo, lang).replace(/\s?lei$/, '')
    if (hi === lo) return fmt(t.services.fixed, { price: from })
    return fmt(t.services.range, { from, to: formatLei(hi, lang).replace(/\s?lei$/, '') })
  }
}

/** The small line under an hourly job's price: its rate, and whether it follows the device value. */
export function useRateNote() {
  const { t } = useI18n()
  return (job: Job) => {
    if (!job.hourly) return null
    const [lo, hi] = rateFor(job.hourly.fineness, null)
    const rate = lo === hi ? fmt(t.services.perHour, { rate: lo }) : fmt(t.services.perHourRange, { from: lo, to: hi })
    return job.hourly.byValue ? `${rate}, ${t.services.byValue}` : rate
  }
}

export function JobRow({ job, onBook }: { job: Job; onBook: () => void }) {
  const lit = () => (sceneState.highlight = jobPart[job.id] ?? null)
  const unlit = () => (sceneState.highlight = null)
  const { t, lang, L } = useI18n()
  const lei = useLeiRange()
  const rateNote = useRateNote()(job)
  return (
    <li onPointerEnter={lit} onPointerLeave={unlit} onFocus={lit} onBlur={unlit} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5 border-b border-line py-4 sm:py-5 md:grid-cols-[1fr_7rem_11rem_auto] md:gap-x-5 md:gap-y-1">
      <div className="col-span-2 md:col-span-1">
        <p className="font-semibold">{L(job.name)}</p>
        <p className="mt-0.5 text-[14px] text-muted sm:text-[15px]">{L(job.description)}</p>
      </div>
      <p className="hidden text-sm text-muted md:block md:text-[15px]">
        {fmt(t.services.eta, { eta: formatEta(job.etaHours, lang) })}
      </p>
      <div className="min-w-0 md:text-right">
        <p className="font-semibold" style={{ fontStretch: '110%' }}>
          {lei(jobPrice(job))}
          {job.partsExtra && <span className="font-normal text-muted"> {t.services.plusParts}</span>}
        </p>
        <p className="mt-0.5 text-[13px] text-muted md:hidden">
          {fmt(t.services.eta, { eta: formatEta(job.etaHours, lang) })}
          {rateNote ? ` · ${rateNote}` : job.needsDiagnosis ? ` · ${t.services.afterDiagnosis}` : ''}
        </p>
        {rateNote && <p className="hidden text-xs text-muted md:block">{rateNote}</p>}
        {job.needsDiagnosis && !rateNote && <p className="hidden text-xs text-muted md:block">{t.services.afterDiagnosis}</p>}
      </div>
      <button
        type="button"
        onClick={onBook}
        className="grid size-10 shrink-0 place-items-center justify-self-end rounded-full border border-line text-muted transition-colors hover:border-gold hover:text-gold md:size-9"
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
  const model = modelFor({ category: cat, mode: 'shop' })
  const jobs = catalog.filter((j) => j.category === cat && j.mode === 'shop')

  return (
    <Section id="servicii" className="pt-10 sm:pt-16" title={t.services.title} lead={`${t.services.lead} ${t.services.labour}`}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
        <div className="min-w-0">
          <div role="tablist" aria-label={t.services.title} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" data-lenis-prevent>
            {shopCats.map((c) => {
              const active = c === cat
              return (
                <button
                  key={c}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-controls="servicii-panel"
                  onClick={() => {
                    sceneState.highlight = null
                    setCat(c)
                  }}
                  className={`relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-semibold transition-colors sm:text-[15px] ${active ? 'text-bg' : 'text-muted hover:text-ink'}`}
                  style={{ fontStretch: '108%' }}
                >
                  {active ? (
                    <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />
                  ) : (
                    <span className="absolute inset-0 rounded-full border border-line" />
                  )}
                  <span className="relative">{t.services.categories[c].name}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[15px] text-muted sm:mt-4 sm:text-[17px]">{t.services.categories[cat].blurb}</p>

          <StageCard model={model} className="mt-4 lg:hidden" label={t.services.categories[cat].name} hint={t.services.stageHint} />

          <div id="servicii-panel" role="tabpanel" className="mt-4 rounded-[24px] border border-line bg-surface px-4 sm:mt-5 sm:px-7">
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
        <div className="hidden lg:block">
          <StageCard model={model} className="sticky top-24" tall label={t.services.categories[cat].name} hint={t.services.stageHint} />
        </div>
      </div>
    </Section>
  )
}

/**
 * The device viewer card. Phones: scrolls naturally above the list so the price rows keep the
 * full viewport. Desktop: a tall card pinned beside the list while the section is on screen.
 */
export function StageCard({ model, className = '', tall = false, label, hint }: { model: ModelId; className?: string; tall?: boolean; label: string; hint: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, clipPath: 'inset(8% 8% 8% 8% round 32px)' }}
      whileInView={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 32px)' }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      <DevicePanel model={model} className={`rounded-[24px] border border-line bg-surface-2 ${tall ? 'h-[calc(100svh-8rem)] max-h-[760px] rounded-[32px]' : 'h-[240px] sm:h-[290px]'}`}>
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-line bg-bg/80 px-3 py-1.5 text-[13px] font-semibold backdrop-blur">{label}</div>
        {tall && <p className="pointer-events-none absolute inset-x-4 bottom-4 z-10 text-center text-[13px] text-muted">{hint}</p>}
      </DevicePanel>
    </motion.div>
  )
}
