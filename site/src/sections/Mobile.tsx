import { fmt, useI18n } from '../i18n'
import { catalog } from '../data/catalog'
import { preselect } from '../lib/booking-store'
import { Section } from '../components/Section'
import { JobRow } from './Services'
import { Check, Pin } from '../components/Icons'

export function Mobile() {
  const { t } = useI18n()
  const jobs = catalog.filter((j) => j.mode === 'mobile')
  return (
    <Section id="auto" stop="door" title={t.mobile.title} lead={t.mobile.lead}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div>
          <ul className="grid gap-4">
            {t.mobile.points.map((p) => (
              <li key={p} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-gold" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex items-start gap-3 text-muted">
            <Pin className="mt-0.5 size-5 shrink-0" />
            <span>
              {t.mobile.area}. {fmt(t.mobile.travelFee, { price: 2 })}
            </span>
          </p>
          <button type="button" className="btn btn-gold mt-8" onClick={() => preselect([], 'mobile')}>
            {t.mobile.bookThis}
          </button>
        </div>
        <ul className="h-fit rounded-[24px] border border-line bg-surface px-5 sm:px-8 [&>li:last-child]:border-0">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} onBook={() => preselect([j.id], 'mobile')} />
          ))}
        </ul>
      </div>
    </Section>
  )
}
