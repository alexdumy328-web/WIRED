import { useI18n } from '../i18n'
import { openBooking } from '../lib/booking-store'
import { OpenStatus } from '../components/OpenStatus'

/** First screen: the headline across the full width, the two actions, and a strip of quick facts at the bottom. */
export function Hero() {
  const { t } = useI18n()
  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col gap-8 pb-8 pt-20 sm:gap-16 sm:pt-28 lg:min-h-[min(100svh,60rem)] lg:pb-10">
      <div className="flex flex-1 flex-col justify-center">
        <OpenStatus className="inline-flex self-start" />
        <h1 className="display mt-4 max-w-[18ch] text-[clamp(2.1rem,7.2vw,6.6rem)] sm:mt-6">{t.hero.title}</h1>
        <div className="mt-5 flex flex-col gap-5 sm:mt-8 sm:gap-8 lg:mt-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <p className="measure max-w-[36rem] text-[16px] text-muted sm:text-xl">{t.hero.lead}</p>
          <div className="flex shrink-0 flex-wrap gap-2.5 sm:gap-3">
            <button type="button" className="btn btn-gold flex-1 px-4 text-[15px] sm:flex-none sm:px-[1.35rem] sm:text-[17px]" onClick={() => openBooking()}>
              {t.hero.ctaBook}
            </button>
            <a href="#servicii" className="btn btn-ghost flex-1 px-4 text-[15px] sm:flex-none sm:px-[1.35rem] sm:text-[17px]">
              {t.hero.ctaPrices}
            </a>
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-5 sm:gap-x-6 sm:gap-y-5 sm:pt-7 lg:grid-cols-4 lg:gap-x-10">
        {t.hero.facts.map((f) => (
          <li key={f.title}>
            <p className="text-[15px] font-semibold sm:text-[17px]" style={{ fontStretch: '110%' }}>
              {f.title}
            </p>
            <p className="mt-1 text-[14px] text-muted sm:text-[15px]">{f.note}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
