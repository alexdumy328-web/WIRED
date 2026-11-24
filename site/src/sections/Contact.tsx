import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { Section } from '../components/Section'
import { Logo } from '../components/Logo'
import { OpenStatus } from '../components/OpenStatus'
import { Phone, Pin } from '../components/Icons'

const ShopMap = lazy(() => import('../components/ShopMap'))

/** Loads the map chunk (Leaflet) only when Contact gets within a screen of the viewport. */
function useNear<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, near }
}

/** Contact details. The map position lives in lib/pickup.ts. */
export const SHOP = {
  phone: '+40700000000', // TODO: real number
  maps: 'https://maps.app.goo.gl/ka5738mbWirnKRPJ9',
}

export function Contact() {
  const { t } = useI18n()
  const { ref: mapRef, near: mapNear } = useNear<HTMLDivElement>()
  return (
    <Section id="contact" title={t.contact.title}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div>
          <p className="flex gap-3 text-lg">
            <Pin className="mt-1 size-5 shrink-0 text-gold" />
            {t.contact.address}
          </p>
          <ul className="mt-5 grid gap-1 text-muted">
            {t.contact.hours.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <OpenStatus className="mt-5 inline-flex" />
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`tel:${SHOP.phone}`} className="btn btn-gold">
              <Phone className="size-4" />
              {t.contact.call}
            </a>
            <a href={`https://wa.me/${SHOP.phone.replace('+', '')}`} className="btn btn-ghost" target="_blank" rel="noreferrer">
              {t.contact.whatsapp}
            </a>
            <a href={SHOP.maps} className="btn btn-ghost" target="_blank" rel="noreferrer">
              {t.contact.directions}
            </a>
          </div>
        </div>
        <div ref={mapRef} role="region" aria-label={t.contact.directions} className="relative isolate h-80 overflow-hidden rounded-[24px] border border-line bg-surface-2 lg:h-[26rem]">
          {mapNear && (
            <Suspense fallback={null}>
              <ShopMap label={t.contact.address} />
            </Suspense>
          )}
        </div>
      </div>
    </Section>
  )
}

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="relative z-10 border-t border-line bg-bg">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <Logo />
        <p className="text-[14px] text-muted">
          © {new Date().getFullYear()} {t.footer.rights} {t.footer.made}
        </p>
      </div>
    </footer>
  )
}
