import { useI18n } from '../i18n'
import { useStation } from '../lib/stations'
import { OpenStatus } from '../components/OpenStatus'

/** One screen: headline left, the 3D shop on the right (rendered by SceneLayer behind). */
export function Hero() {
  const { t } = useI18n()
  const ref = useStation<HTMLElement>({ stop: 'overview', frame: 1.5 })
  return (
    <section id="top" ref={ref} className="pointer-events-none relative z-10 flex min-h-[100dvh] items-end pb-12 pt-24 md:items-center md:pb-0">
      {/* Wash so the headline reads over the model. */}
      <div className="absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-bg via-bg/75 to-transparent md:block" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-bg via-bg/85 to-transparent md:hidden" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1320px] px-4 sm:px-6">
        <div className="pointer-events-auto max-w-[36rem]">
          <OpenStatus className="inline-flex" />
          <h1 className="display mt-5 text-[clamp(2.5rem,5.4vw,4.75rem)]">{t.hero.title}</h1>
          <p className="measure mt-6 max-w-[32rem] text-lg text-muted sm:text-xl">{t.hero.lead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#programare" className="btn btn-gold">
              {t.hero.ctaBook}
            </a>
            <a href="#servicii" className="btn btn-ghost">
              {t.hero.ctaPrices}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
