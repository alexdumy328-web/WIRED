import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { openBooking, useBooking } from '../lib/booking-store'
import { SHOP } from '../sections/Contact'
import { Phone } from './Icons'

/**
 * Phones and tablets: Call, WhatsApp and Book pinned to the bottom edge. It shows once the hero
 * buttons are off screen and hides again over Contact, which has the same buttons, and while the
 * booking popup is open.
 */
export function ActionBar() {
  const { t } = useI18n()
  const booking = useBooking().open
  const [pastHero, setPastHero] = useState(false)
  const [atContact, setAtContact] = useState(false)
  useEffect(() => {
    const hero = document.getElementById('top')
    const contact = document.getElementById('contact')
    const ios: IntersectionObserver[] = []
    if (hero) {
      const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-40% 0px 0px 0px' })
      io.observe(hero)
      ios.push(io)
    }
    if (contact) {
      const io = new IntersectionObserver(([e]) => setAtContact(e.isIntersecting))
      io.observe(contact)
      ios.push(io)
    }
    return () => ios.forEach((io) => io.disconnect())
  }, [])
  const shown = pastHero && !atContact && !booking
  return (
    <div
      role="region"
      aria-label={t.actionBar.label}
      inert={!shown}
      className={`scrim fixed inset-x-0 bottom-0 z-40 border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 ease-out sm:px-6 lg:hidden ${shown ? 'translate-y-0' : 'translate-y-full'}`}
    >
      <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
        <a href={`tel:${SHOP.phone}`} className="btn btn-ghost min-h-11 px-3 text-[15px]">
          <Phone className="size-4" />
          {t.actionBar.call}
        </a>
        <a href={`https://wa.me/${SHOP.phone.replace('+', '')}`} target="_blank" rel="noreferrer" className="btn btn-ghost min-h-11 px-3 text-[15px]">
          {t.actionBar.whatsapp}
        </a>
        <button type="button" onClick={() => openBooking()} className="btn btn-gold min-h-11 px-3 text-[15px]">
          {t.actionBar.book}
        </button>
      </div>
    </div>
  )
}
