import { useI18n } from '../i18n'
import { Section } from '../components/Section'
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
  const d = 0.004
  const bbox = [SHOP.lng - d * 1.6, SHOP.lat - d, SHOP.lng + d * 1.6, SHOP.lat + d].join(',')
  return (
    <Section id="contact" stop="door" title={t.contact.title}>
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
        <iframe
          title={t.contact.directions}
          className="h-80 w-full rounded-[24px] border border-line grayscale-[0.5]"
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${SHOP.lat},${SHOP.lng}`}
        />
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] text-muted">
          <a
            href="https://github.com/alexdumy328-web/WIRED/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:text-gold"
          >
            {t.footer.getApp}
          </a>
          <p>
            © {new Date().getFullYear()} {t.footer.rights} {t.footer.made}
          </p>
        </div>
      </div>
    </footer>
  )
}
