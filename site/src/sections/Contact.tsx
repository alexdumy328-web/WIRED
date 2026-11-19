import { useI18n } from '../i18n'
import { useStation } from '../lib/stations'
import { Logo } from '../components/Logo'
import { OpenStatus } from '../components/OpenStatus'
import { Phone, Pin } from '../components/Icons'

export const SHOP = {
  lat: 47.166015,
  lng: 27.558417,
  phone: '+40700000000', // TODO: real number
  maps: 'https://maps.app.goo.gl/ka5738mbWirnKRPJ9',
}

export function Contact() {
  const { t } = useI18n()
  const ref = useStation<HTMLElement>({ stop: 'door', frame: -0.42 })
  const d = 0.004
  const bbox = [SHOP.lng - d * 1.6, SHOP.lat - d, SHOP.lng + d * 1.6, SHOP.lat + d].join(',')
  return (
    <section id="contact" ref={ref} className="pointer-events-none relative z-10 scroll-mt-16 py-10 lg:min-h-[100vh] lg:py-20">
      <div className="h-[40vh] lg:hidden" />
      <div className="mx-auto flex max-w-[1320px] justify-end px-4 sm:px-6">
        <div className="panel pointer-events-auto w-full overflow-hidden lg:w-[min(42rem,54%)]">
          <div className="p-5 sm:p-8">
            <h2 className="display-2 text-[clamp(1.8rem,3.4vw,2.9rem)]">{t.contact.title}</h2>
            <p className="mt-4 flex gap-3">
              <Pin className="mt-0.5 size-5 shrink-0 text-gold" />
              {t.contact.address}
            </p>
            <ul className="mt-4 grid gap-1 text-muted">
              {t.contact.hours.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <OpenStatus className="mt-4 inline-flex" />
            <div className="mt-6 flex flex-wrap gap-3">
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
          <iframe
            title={t.contact.directions}
            className="h-64 w-full border-0 border-t border-line grayscale-[0.6]"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${SHOP.lat},${SHOP.lng}`}
          />
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="relative z-10 border-t border-line bg-bg">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo />
        <p className="text-[14px] text-muted">
          © {new Date().getFullYear()} {t.footer.rights} {t.footer.made}
        </p>
      </div>
    </footer>
  )
}
