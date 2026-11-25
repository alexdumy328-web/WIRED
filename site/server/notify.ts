import { catalog } from '../src/data/catalog.ts'
import type { Booking, BookingStatus } from '../src/types.ts'
import type { Mail, MailAttachment, Mailer } from './auth/outbox.ts'
import { maskEmail } from './security/scrub.ts'

export type MailOutcome = 'sent' | 'failed' | 'skipped'

export type Notifier = {
  /** Confirmation to the customer (when they left an email) and a heads-up to every owner address. */
  bookingCreated(booking: Booking): Promise<{ customer: MailOutcome; owner: MailOutcome }>
  /** Tells the customer their booking moved to a new status. A warranty PDF can ride along on "done". */
  statusChanged(booking: Booking, attachments?: MailAttachment[]): Promise<MailOutcome>
  /** The device was taken in at the counter: the service sheet PDF, with the tracking link. */
  intakeReceived(booking: Booking, sheet: MailAttachment): Promise<MailOutcome>
  /** A warranty certificate sent on its own, when it is issued after the job was closed. */
  warrantyIssued(booking: Booking, label: string, endsOn: string, certificate: MailAttachment): Promise<MailOutcome>
}

const SHOP = 'Norgelis Tech'
type Lang = 'ro' | 'en'

/** One line per status, worded for how the device travels: shop visit, pickup and delivery, or on site. */
function statusLine(b: Booking, lang: Lang): string {
  const delivered = b.pickup && b.pickup.trips !== 'pickup'
  const onSite = b.mode === 'mobile'
  const ro = lang === 'ro'
  switch (b.status) {
    case 'received':
      return ro ? 'Am primit programarea ta.' : 'We got your booking.'
    case 'diagnosis':
      return ro
        ? 'Aparatul tău e în diagnostic. Te sunăm dacă găsim ceva în plus față de estimare.'
        : 'Your device is being diagnosed. We will call you if we find more than the estimate covers.'
    case 'waiting-parts':
      return ro ? 'Așteptăm piesa pentru aparatul tău. Îți scriem când ajunge.' : 'We are waiting for a part for your device. We will write when it arrives.'
    case 'repairing':
      return ro ? 'Lucrăm la aparatul tău.' : 'We are repairing your device.'
    case 'ready':
      if (onSite) return ro ? 'Lucrarea e gata.' : 'The job is done.'
      if (delivered) return ro ? 'Aparatul tău e gata. Ți-l aducem la adresă și te sunăm înainte să plecăm.' : 'Your device is ready. We will bring it to your address and call before we set off.'
      return ro ? 'Aparatul tău e gata. Poți veni să-l ridici în programul atelierului.' : 'Your device is ready. You can pick it up during workshop hours.'
    case 'unrepairable':
      if (onSite) return ro ? 'Din păcate, defectul nu se poate repara la fața locului. Te sunăm să-ți explicăm ce am găsit.' : 'Sadly, the fault cannot be fixed on site. We will call to explain what we found.'
      if (delivered) return ro ? 'Din păcate, aparatul tău nu se poate repara. Ți-l aducem înapoi și te sunăm înainte să plecăm.' : 'Sadly, your device cannot be repaired. We will bring it back and call before we set off.'
      return ro ? 'Din păcate, aparatul tău nu se poate repara. Poți veni să-l ridici în programul atelierului.' : 'Sadly, your device cannot be repaired. You can pick it up during workshop hours.'
    case 'done':
      if (onSite) return ro ? 'Lucrarea s-a încheiat. Mulțumim că ne-ai chemat.' : 'The job is finished. Thank you for calling us.'
      if (delivered) return ro ? 'Aparatul a fost predat. Mulțumim!' : 'Your device has been handed back. Thank you!'
      return ro ? 'Aparatul a fost predat. Mulțumim că ai venit la noi.' : 'Your device has been handed back. Thank you for coming to us.'
    case 'cancelled':
      return ro
        ? 'Programarea ta a fost anulată. Dacă e o greșeală sau vrei altă oră, fă o programare nouă pe site.'
        : 'Your booking was cancelled. If this is a mistake or you want another time, make a new booking on the site.'
  }
}

const statusName: Record<Lang, Record<BookingStatus, string>> = {
  ro: { received: 'Programare primită', diagnosis: 'În diagnostic', 'waiting-parts': 'Așteptăm piesa', repairing: 'În reparație', ready: 'Gata', unrepairable: 'Nereparabil', done: 'Predat', cancelled: 'Anulată' },
  en: { received: 'Booking received', diagnosis: 'Being diagnosed', 'waiting-parts': 'Waiting for parts', repairing: 'Being repaired', ready: 'Ready', unrepairable: 'Cannot be repaired', done: 'Handed back', cancelled: 'Cancelled' },
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
    const ro = lang === 'ro'
    const trips = b.pickup?.trips
    const place =
      b.mode === 'mobile'
        ? ro ? 'la adresa ta' : 'at your address'
        : trips === 'both'
          ? ro ? 'ridicăm aparatul de la adresa ta și ți-l aducem înapoi' : 'we collect the device from your address and bring it back'
          : trips === 'pickup'
            ? ro ? 'ridicăm aparatul de la adresa ta' : 'we collect the device from your address'
            : trips === 'dropoff'
              ? ro ? 'aduci aparatul la atelier, iar noi ți-l aducem înapoi' : 'you bring the device to the workshop and we deliver it back'
              : ro ? 'la atelier' : 'at the workshop'
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
      `${when(b.slot, 'ro')}, ${b.mode === 'mobile' ? `la client: ${b.location ?? ''}` : b.pickup ? `${{ both: 'ridicare și livrare', pickup: 'ridicare', dropoff: 'livrare' }[b.pickup.trips]}: ${b.pickup.address}` : 'la atelier'}`,
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

    async intakeReceived(b, sheet) {
      if (!b.contact.email || !b.intake) return 'skipped'
      const ro = b.lang === 'ro'
      const number = `${b.intake.number}/${b.intake.year}`
      const text = ro
        ? `Am primit aparatul tău în atelier. Fișa de service are numărul ${number} și o găsești atașată.\n\nCod: ${b.code}\nVezi starea reparației oricând: ${track(b.code)}\n\nPăstrează fișa: o folosești când ridici aparatul.\n\n${SHOP}`
        : `We have your device in the workshop. The service sheet is number ${number} and is attached.\n\nCode: ${b.code}\nCheck the repair status any time: ${track(b.code)}\n\nKeep the sheet: you use it to collect the device.\n\n${SHOP}`
      return send({
        to: b.contact.email,
        kind: 'booking:intake',
        subject: ro ? `${SHOP}: fișa de service ${number}` : `${SHOP}: service sheet ${number}`,
        text,
        attachments: [sheet],
      })
    },

    async warrantyIssued(b, label, endsOn, certificate) {
      if (!b.contact.email) return 'skipped'
      const ro = b.lang === 'ro'
      const until = new Intl.DateTimeFormat(ro ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${endsOn}T12:00:00Z`))
      return send({
        to: b.contact.email,
        kind: 'warranty:issued',
        subject: ro ? `${SHOP}: certificatul de garanție ${label}` : `${SHOP}: warranty certificate ${label}`,
        text: ro
          ? `Îți trimitem certificatul de garanție ${label} pentru lucrarea ${b.code}. Garanția e valabilă până la ${until} inclusiv.\n\nPăstrează certificatul: îl aduci împreună cu aparatul dacă apare o problemă.\n\n${SHOP}`
          : `Here is warranty certificate ${label} for job ${b.code}. It is valid until ${until} inclusive.\n\nKeep the certificate: bring it with the device if anything goes wrong.\n\n${SHOP}`,
        attachments: [certificate],
      })
    },

    async statusChanged(b, attachments) {
      if (!b.contact.email) return 'skipped'
      const lang: Lang = b.lang
      const forWhat = b.status === 'unrepairable' ? (lang === 'ro' ? 'diagnostic' : 'the diagnosis') : lang === 'ro' ? 'reparație' : 'the repair'
      const price =
        b.finalLei != null && (b.status === 'ready' || b.status === 'done' || b.status === 'unrepairable')
          ? lang === 'ro'
            ? `\nDe plată pentru ${forWhat}: ${b.finalLei} lei${b.pickup ? `, plus transport ${b.pickup.quote.totalLei} lei` : ''}.`
            : `\nTo pay for ${forWhat}: ${b.finalLei} lei${b.pickup ? `, plus transport ${b.pickup.quote.totalLei} lei` : ''}.`
          : ''
      const warranty = attachments?.length
        ? lang === 'ro'
          ? '\nAtașat găsești certificatul de garanție. Păstrează-l.'
          : '\nYour warranty certificate is attached. Please keep it.'
        : ''
      const text =
        lang === 'ro'
          ? `${statusLine(b, 'ro')}${price}${warranty}\n\nCod: ${b.code}\nVezi starea: ${track(b.code)}\n\n${SHOP}`
          : `${statusLine(b, 'en')}${price}${warranty}\n\nCode: ${b.code}\nSee the status: ${track(b.code)}\n\n${SHOP}`
      return send({
        to: b.contact.email,
        kind: `booking:${b.status}`,
        subject: `${SHOP}: ${b.code}, ${statusName[lang][b.status].toLowerCase()}`,
        text,
        ...(attachments?.length ? { attachments } : {}),
      })
    },
  }
}
