import { useI18n } from '../i18n'
import { openBooking } from '../lib/booking-store'
import { useStation } from '../lib/stations'

/** In-page anchor for "#programare": a short pitch and the button that opens the booking popup. */
export function BookingCta() {
  const { t } = useI18n()
  const ref = useStation<HTMLElement>({ stop: 'counter' })
  return (
    <section id="programare" ref={ref} className="relative scroll-mt-20 py-20 sm:py-24">
      <div className="rounded-[28px] border border-line bg-surface p-6 sm:p-10">
        <h2 className="display-2 text-[clamp(2rem,3.6vw,3.2rem)]">{t.booking.title}</h2>
        <p className="measure mt-4 text-lg text-muted">{t.booking.lead}</p>
        <button type="button" className="btn btn-gold mt-8" onClick={() => openBooking()}>
          {t.booking.open}
        </button>
      </div>
    </section>
  )
}
