import type { ComponentType, ReactNode } from 'react'
import { fmt } from '../../../i18n'
import type { BookingStatus, ContactChannel, Lang, WarrantyState } from '../../../types'
import { ChatIcon, MailIcon, PhoneIcon, WhatsAppIcon } from '../icons'
import { copyFor, useWorkshopCopy } from './copy'
import { byPreference, contactLinks } from './model'

const CHANNEL_ICON: Record<ContactChannel, ComponentType<{ className?: string }>> = { phone: PhoneIcon, whatsapp: WhatsAppIcon, sms: ChatIcon, email: MailIcon }

/** The message the one-tap buttons fill in, in the customer's language. */
export function customerMessage(b: { code: string; status: BookingStatus; lang: Lang; contact: { name: string }; finalLei?: number }, origin = window.location.origin) {
  const m = copyFor(b.lang).message
  const first = b.contact.name.trim().split(/\s+/)[0] ?? ''
  const price = b.finalLei != null && (b.status === 'ready' || b.status === 'unrepairable') ? ` ${fmt(m.price, { n: b.finalLei })}` : ''
  const track = b.status === 'done' || b.status === 'cancelled' ? '' : `\n${fmt(m.track, { url: `${origin}/?cod=${b.code}#status` })}`
  return {
    subject: fmt(m.subject, { code: b.code }),
    body: `${fmt(m.greet, { name: first })} ${fmt(m.status[b.status], { code: b.code })}${price}${track}\n${m.sign}`,
  }
}

/**
 * Call, WhatsApp, SMS and email buttons, the customer's preferred one first and filled in gold.
 * Each opens the owner's own app with the message ready; nothing is sent from the server.
 */
export function ContactButtons({ contact, preferred, message, size = 'md' }: { contact: { phone?: string; email?: string }; preferred?: ContactChannel; message: { subject: string; body: string }; size?: 'sm' | 'md' }) {
  const c = useWorkshopCopy()
  const links = byPreference(contactLinks(contact, message), preferred)
  if (!links.length) return null
  const h = size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-10 px-3.5 text-[14px]'
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const Icon = CHANNEL_ICON[link.channel]
        const main = link.channel === preferred
        return (
          <a
            key={link.channel}
            href={link.href}
            {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
            className={`inline-flex items-center gap-2 rounded-full border font-semibold transition-colors ${h} ${main ? 'border-gold bg-gold text-[var(--on-gold)] hover:brightness-110' : 'border-line bg-surface hover:border-ink'}`}
            title={main ? `${c.channelNames[link.channel]} (${c.preferred})` : c.channelNames[link.channel]}
            aria-label={c.channels[link.channel]}
          >
            <Icon className="size-4" />
            {/* Small rows on phones show icons only, so the drawer header stays one line. */}
            <span className={size === 'sm' ? 'hidden sm:inline' : ''}>{c.channels[link.channel]}</span>
          </a>
        )
      })}
    </div>
  )
}

const STATE_TONE: Record<WarrantyState, string> = {
  active: 'bg-ok/12 text-ok',
  expiring: 'bg-gold/14 text-gold',
  expired: 'bg-surface-2 text-muted',
  void: 'bg-rose/12 text-rose line-through decoration-1',
}

export function WarrantyStateBadge({ state }: { state: WarrantyState }) {
  const c = useWorkshopCopy()
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold ${STATE_TONE[state]}`}>{c.states[state]}</span>
}

/** "Fișa 12/2026" chip, or a quiet "not taken in" marker. */
export function SheetChip({ intake }: { intake?: { number: number; year: number } }) {
  const c = useWorkshopCopy()
  if (!intake) return <span className="inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-line px-2.5 py-0.5 text-[12px] font-semibold text-muted">{c.noSheet}</span>
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-ink px-2.5 py-0.5 font-mono text-[12px] font-bold text-bg">
      {fmt(c.sheet, { n: `${intake.number}/${intake.year}` })}
    </span>
  )
}

export function SectionTitle({ id, children, action }: { id?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 id={id} className="text-[13px] font-semibold uppercase tracking-wide text-muted">
        {children}
      </h3>
      {action}
    </div>
  )
}

/** Days from today (shop-local) to a YYYY-MM-DD date. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
}
