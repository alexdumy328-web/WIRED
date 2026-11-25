import { useI18n } from '../i18n'
import { openBooking } from '../lib/booking-store'

/** In-page anchor for "#programare": a short pitch and the button that opens the booking popup. */
export function BookingCta() {
  const { t } = useI18n()
  return (
    <section id="programare" className="relative scroll-mt-20 py-14 sm:py-24">
      <div className="rounded-[28px] border border-line bg-surface p-6 sm:p-10">
        <h2 className="display-2 text-[clamp(1.85rem,3.6vw,3.2rem)]">{t.booking.title}</h2>
        <p className="measure mt-3 text-[16px] text-muted sm:mt-4 sm:text-lg">{t.booking.lead}</p>
        <button type="button" className="btn btn-gold mt-6 w-full sm:mt-8 sm:w-auto" onClick={() => openBooking()}>
          {t.booking.open}
        </button>
      </div>
    </section>
  )
}
