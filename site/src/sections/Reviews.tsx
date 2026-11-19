import { fmt, useI18n } from '../i18n'
import { reviews, reviewsArePlaceholder } from '../data/reviews'
import { Section } from '../components/Section'
import { Star } from '../components/Icons'

export function Reviews() {
  const { t, L, lang } = useI18n()
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
  const rating = avg.toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB', { maximumFractionDigits: 1 })
  const date = (d: string) => new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date(d))

  return (
    <Section
      id="recenzii"
      stop="pcbWall"
      title={t.reviews.title}
      aside={
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="display text-4xl">{rating}</span>
            <span className="flex text-gold" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="size-4" filled={i < Math.round(avg)} />
              ))}
            </span>
          </div>
          <p className="mt-1 text-[14px] text-muted">{fmt(t.reviews.summary, { rating, count: reviews.length })}</p>
          {reviewsArePlaceholder && (
            <p className="text-[13px] text-muted">{L({ ro: 'Exemple până la deschiderea profilului Google.', en: 'Examples until the Google profile is live.' })}</p>
          )}
        </div>
      }
    >
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6" data-lenis-prevent-horizontal tabIndex={0} aria-label={t.reviews.title}>
        {reviews.map((r) => (
          <li key={r.name + r.date} className="flex w-[min(22rem,82vw)] shrink-0 snap-start flex-col rounded-[24px] border border-line bg-surface p-6">
            <div className="flex text-gold" aria-label={`${r.rating}/5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="size-4" filled={i < r.rating} />
              ))}
            </div>
            <blockquote className="mt-4 flex-1 leading-relaxed">{L(r.text)}</blockquote>
            <p className="mt-5 text-[15px] font-semibold">{r.name}</p>
            <p className="text-[13px] text-muted">
              {t.services.categories[r.category as Exclude<typeof r.category, 'auto'>]?.name ?? t.nav.mobile}, {date(r.date)}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
