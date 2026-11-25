import { useI18n } from '../i18n'
import { openBooking } from '../lib/booking-store'
import { OpenStatus } from '../components/OpenStatus'

/** First screen: the headline across the full width, the two actions, and a strip of quick facts at the bottom. */
export function Hero() {
  const { t } = useI18n()
  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col gap-10 pb-8 pt-24 sm:gap-16 sm:pt-28 lg:min-h-[min(100svh,60rem)] lg:pb-10">
      <div className="flex flex-1 flex-col justify-center">
        <OpenStatus className="inline-flex self-start" />
        <h1 className="display mt-5 max-w-[18ch] text-[clamp(2.4rem,7.2vw,6.6rem)] sm:mt-6">{t.hero.title}</h1>
        <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8 lg:mt-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <p className="measure max-w-[36rem] text-[17px] text-muted sm:text-xl">{t.hero.lead}</p>
          <div className="flex shrink-0 flex-wrap gap-3">
            <button type="button" className="btn btn-gold" onClick={() => openBooking()}>
              {t.hero.ctaBook}
            </button>
            <a href="#servicii" className="btn btn-ghost">
              {t.hero.ctaPrices}
            </a>
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-x-5 gap-y-5 border-t border-line pt-5 sm:gap-x-6 sm:pt-7 lg:grid-cols-4 lg:gap-x-10">
        {t.hero.facts.map((f) => (
          <li key={f.title}>
            <p className="font-semibold" style={{ fontStretch: '110%' }}>
              {f.title}
            </p>
            <p className="mt-1 text-[15px] text-muted">{f.note}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
