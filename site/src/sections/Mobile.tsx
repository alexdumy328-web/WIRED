import { fmt, useI18n } from '../i18n'
import { catalog } from '../data/catalog'
import { preselect } from '../lib/booking-store'
import { useStation } from '../lib/stations'
import { JobRow } from './Services'
import { Check, Pin } from '../components/Icons'

export function Mobile() {
  const { t } = useI18n()
  const jobs = catalog.filter((j) => j.mode === 'mobile')
  const ref = useStation<HTMLElement>({ stop: 'door', frame: -0.42 })

  return (
    <section id="auto" ref={ref} className="pointer-events-none relative z-10 scroll-mt-16 lg:min-h-[150vh]">
      <div className="h-[55vh] lg:hidden" />
      <div className="mx-auto flex max-w-[1320px] justify-end px-4 sm:px-6 lg:sticky lg:top-20 lg:py-6">
        <div className="panel pointer-events-auto w-full p-5 sm:p-8 lg:max-h-[calc(100dvh-7rem)] lg:w-[min(42rem,52%)] lg:overflow-y-auto lg:overscroll-contain" data-lenis-prevent>
          <h2 className="display-2 text-[clamp(2rem,3.6vw,3.1rem)]">{t.mobile.title}</h2>
          <p className="measure mt-4 text-muted">{t.mobile.lead}</p>
          <ul className="mt-6 grid gap-3">
            {t.mobile.points.map((p) => (
              <li key={p} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-gold" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-start gap-3 text-[15px] text-muted">
            <Pin className="mt-0.5 size-5 shrink-0" />
            <span>
              {t.mobile.area}. {fmt(t.mobile.travelFee, { price: 2 })}
            </span>
          </p>
          <ul className="mt-6 border-t border-line">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} onBook={() => preselect([j.id], 'mobile')} />
            ))}
          </ul>
          <button type="button" className="btn btn-gold mt-7" onClick={() => preselect([], 'mobile')}>
            {t.mobile.bookThis}
          </button>
        </div>
      </div>
    </section>
  )
}
