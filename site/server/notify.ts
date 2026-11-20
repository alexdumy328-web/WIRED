import { catalog } from '../src/data/catalog.ts'
import type { Booking, BookingStatus } from '../src/types.ts'
import type { Mail, Mailer } from './auth/outbox.ts'
import { maskEmail } from './security/scrub.ts'

export type MailOutcome = 'sent' | 'failed' | 'skipped'

export type Notifier = {
  /** Confirmation to the customer (when they left an email) and a heads-up to every owner address. */
  bookingCreated(booking: Booking): Promise<{ customer: MailOutcome; owner: MailOutcome }>
  /** Tells the customer their booking moved to a new status. */
  statusChanged(booking: Booking): Promise<MailOutcome>
}

const SHOP = 'Norgelis Tech'
type Lang = 'ro' | 'en'

const statusLine: Record<Lang, Record<BookingStatus, string>> = {
  ro: {
    received: 'Am primit aparatul la atelier.',
    diagnosis: 'Aparatul tău e în diagnostic. Te sunăm dacă găsim ceva în plus față de estimare.',
    'waiting-parts': 'Așteptăm piesa pentru aparatul tău. Îți scriem când ajunge.',
    repairing: 'Lucrăm la aparatul tău.',
    ready: 'Aparatul tău e gata. Poți veni să-l ridici în programul atelierului.',
    done: 'Aparatul a fost predat. Mulțumim că ai venit la noi.',
  },
  en: {
    received: 'Your device is at the workshop.',
    diagnosis: 'Your device is being diagnosed. We will call you if we find more than the estimate covers.',
    'waiting-parts': 'We are waiting for a part for your device. We will write when it arrives.',
    repairing: 'We are repairing your device.',
    ready: 'Your device is ready. You can pick it up during workshop hours.',
    done: 'Your device has been handed back. Thank you for coming to us.',
  },
}

const statusName: Record<Lang, Record<BookingStatus, string>> = {
  ro: { received: 'Primit la atelier', diagnosis: 'În diagnostic', 'waiting-parts': 'Așteptăm piesa', repairing: 'În reparație', ready: 'Gata de ridicare', done: 'Predat' },
  en: { received: 'Received at the workshop', diagnosis: 'Being diagnosed', 'waiting-parts': 'Waiting for parts', repairing: 'Being repaired', ready: 'Ready for pickup', done: 'Picked up' },
}

function when(slot: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(slot))
}

/** Job names from the price list only. Text the customer typed never goes into a mail to them. */
function jobNames(booking: Booking, lang: Lang): string {
  const names = booking.jobIds.map((id) => catalog.find((j) => j.id === id)?.name[lang]).filter(Boolean)
  if (booking.custom) names.push(lang === 'ro' ? 'cerere proprie' : 'custom request')
  return names.join(', ')
}

/**
 * Mails about bookings. The customer copy holds only text the server controls (code, time, job
 * names from the price list, prices, a link), so a stranger's address typed into the booking form
 * cannot be sent anything an attacker wrote. Sending never throws: a failed mail never fails a
 * booking or a status change.
 */
export function createNotifier(options: { mailer: Mailer; origin: string; ownerEmails?: string; quiet?: boolean }): Notifier {
  const origin = options.origin.replace(/\/+$/, '')
  const owners = [...new Set((options.ownerEmails ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]
  const track = (code: string) => `${origin}/?cod=${encodeURIComponent(code)}#status`

  async function send(mail: Mail): Promise<MailOutcome> {
    try {
      await options.mailer.send(mail)
      return 'sent'
    } catch {
      if (!options.quiet) console.log(`[mail] ${mail.kind} to ${maskEmail(mail.to)} could not be sent`)
      return 'failed'
    }
  }

  function customerConfirmation(b: Booking): Mail {
    const lang: Lang = b.lang
    const place =
      b.mode === 'mobile'
        ? lang === 'ro' ? 'la adresa ta' : 'at your address'
        : b.pickup
          ? lang === 'ro' ? 'ridicăm aparatul de la adresa ta' : 'we collect the device from your address'
          : lang === 'ro' ? 'la atelier' : 'at the workshop'
    const transport = b.pickup ? `\nTransport: ${b.pickup.quote.totalLei} lei` : ''
    const lines =
      lang === 'ro'
        ? [
            `Am primit programarea ta. Codul ei este ${b.code}.`,
            '',
            `Când: ${when(b.slot, lang)}, ${place}`,
            `Ce facem: ${jobNames(b, lang) || '-'}`,
            `Estimare: ${b.estimate.priceFrom}–${b.estimate.priceTo} lei, fără piese${transport}`,
            '',
            `Vezi starea reparației oricând: ${track(b.code)}`,
            '',
            'Dacă nu ai făcut tu programarea, ignoră mesajul.',
          ]
        : [
            `We got your booking. Its code is ${b.code}.`,
            '',
            `When: ${when(b.slot, lang)}, ${place}`,
            `What we do: ${jobNames(b, lang) || '-'}`,
            `Estimate: ${b.estimate.priceFrom}–${b.estimate.priceTo} lei, parts not included${transport}`,
            '',
            `Check the repair status any time: ${track(b.code)}`,
            '',
            'If you did not make this booking, ignore this message.',
          ]
    return {
      to: b.contact.email!,
      kind: 'booking:received',
      subject: lang === 'ro' ? `${SHOP}: programarea ${b.code}` : `${SHOP}: booking ${b.code}`,
      text: `${lines.join('\n')}\n\n${SHOP}`,
    }
  }

  function ownerHeadsUp(b: Booking, to: string): Mail {
    const device = [b.device.brand, b.device.model, b.device.year].filter(Boolean).join(' ')
    const lines = [
      `${b.contact.name}, ${b.contact.phone}${b.contact.email ? `, ${b.contact.email}` : ''}`,
      `${when(b.slot, 'ro')}, ${b.mode === 'mobile' ? `la client: ${b.location ?? ''}` : b.pickup ? `ridicare: ${b.pickup.address}` : 'la atelier'}`,
      `Aparat: ${device || '-'}`,
      `Lucrări: ${jobNames(b, 'ro') || '-'}`,
      `Estimare: ${b.estimate.priceFrom}–${b.estimate.priceTo} lei${b.pickup ? `, transport ${b.pickup.quote.totalLei} lei` : ''}`,
      '',
      `Problema: ${b.issue}`,
      '',
      `Deschide în panou: ${origin}/admin?cod=${encodeURIComponent(b.code)}`,
    ]
    return { to, kind: 'booking:owner', subject: `Programare nouă ${b.code}`, text: lines.join('\n') }
  }

  return {
    async bookingCreated(b) {
      const [customer, ...ownerResults] = await Promise.all([
        b.contact.email ? send(customerConfirmation(b)) : Promise.resolve<MailOutcome>('skipped'),
        ...owners.map((to) => send(ownerHeadsUp(b, to))),
      ])
      const owner: MailOutcome = ownerResults.length === 0 ? 'skipped' : ownerResults.every((r) => r === 'sent') ? 'sent' : 'failed'
      return { customer: customer!, owner }
    },

    async statusChanged(b) {
      if (!b.contact.email) return 'skipped'
      const lang: Lang = b.lang
      const price =
        b.finalLei != null && (b.status === 'ready' || b.status === 'done')
          ? lang === 'ro'
            ? `\nDe plată pentru reparație: ${b.finalLei} lei${b.pickup ? `, plus transport ${b.pickup.quote.totalLei} lei` : ''}.`
            : `\nTo pay for the repair: ${b.finalLei} lei${b.pickup ? `, plus transport ${b.pickup.quote.totalLei} lei` : ''}.`
          : ''
      const text =
        lang === 'ro'
          ? `${statusLine.ro[b.status]}${price}\n\nCod: ${b.code}\nVezi starea: ${track(b.code)}\n\n${SHOP}`
          : `${statusLine.en[b.status]}${price}\n\nCode: ${b.code}\nSee the status: ${track(b.code)}\n\n${SHOP}`
      return send({
        to: b.contact.email,
        kind: `booking:${b.status}`,
        subject: `${SHOP}: ${b.code}, ${statusName[lang][b.status].toLowerCase()}`,
        text,
      })
    },
  }
}
