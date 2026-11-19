import { fmt, useI18n } from '../i18n'
import { reviews, reviewsArePlaceholder } from '../data/reviews'
import { useStation } from '../lib/stations'
import { Star } from '../components/Icons'

export function Reviews() {
  const { t, L, lang } = useI18n()
  const ref = useStation<HTMLElement>({ stop: 'pcbWall', frame: 0.42 })
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
  const rating = avg.toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB', { maximumFractionDigits: 1 })
  const date = (d: string) => new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(d))

  return (
    <section id="recenzii" ref={ref} className="pointer-events-none relative z-10 scroll-mt-16 lg:min-h-[130vh]">
      <div className="h-[55vh] lg:hidden" />
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:sticky lg:top-20 lg:py-6">
        <div className="panel pointer-events-auto p-5 sm:p-8 lg:w-[min(42rem,54%)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="display-2 text-[clamp(1.8rem,3.4vw,2.9rem)]">{t.reviews.title}</h2>
            <div className="flex items-center gap-2">
              <span className="display text-4xl">{rating}</span>
              <span className="flex text-gold" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="size-4" filled={i < Math.round(avg)} />
                ))}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[15px] text-muted">{fmt(t.reviews.summary, { rating, count: reviews.length })}</p>
          {reviewsArePlaceholder && (
            <p className="mt-1 text-[13px] text-muted">
              {L({ ro: 'Exemple până la deschiderea profilului Google.', en: 'Examples until the Google profile is live.' })}
            </p>
          )}

          <ul className="-mx-5 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 sm:-mx-8 sm:px-8" data-lenis-prevent-horizontal>
            {reviews.map((r) => (
              <li key={r.name + r.date} className="w-[min(20rem,78vw)] shrink-0 snap-start rounded-[20px] border border-line bg-surface p-5">
                <div className="flex text-gold" aria-label={`${r.rating}/5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className="size-3.5" filled={i < r.rating} />
                  ))}
                </div>
                <blockquote className="mt-3 text-[15px] leading-relaxed">{L(r.text)}</blockquote>
                <p className="mt-4 text-[14px] font-semibold">{r.name}</p>
                <p className="text-[13px] text-muted">
                  {t.services.categories[r.category as Exclude<typeof r.category, 'auto'>]?.name ?? t.nav.mobile}, {date(r.date)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
