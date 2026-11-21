import type { ContactChannel, Customer, Lang, Warranty, WarrantyState } from '../../../types'
import type { OwnerBooking } from '../types'

export type WarrantyView = Warranty & { state: WarrantyState }

/** GET /api/admin/bookings/:code */
export type WorkOrder = OwnerBooking & {
  warranties: WarrantyView[]
  customer: Customer | null
  defaults: { warrantyMonths: number }
}

export type CustomerSummary = Customer & { jobs: number; open: number; lastVisit?: string }
export type CustomerDetail = { customer: Customer; jobs: OwnerBooking[]; warranties: WarrantyView[] }

export const sheetLabel = (b: Pick<OwnerBooking, 'intake'>) => (b.intake ? `${b.intake.number}/${b.intake.year}` : null)

/** Digits for wa.me and tel:, with Romanian numbers in international form: "0721 123 456" gives 40721123456. */
export function intlDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10 && digits.startsWith('0')) digits = `4${digits}`
  return digits
}

export type ContactLink = { channel: ContactChannel; href: string; external: boolean }

/**
 * One-tap links that open the owner's own phone apps with the message filled in. Nothing is
 * sent by the server and nothing costs money: the owner presses send.
 */
export function contactLinks(contact: { phone?: string; email?: string }, message: { subject: string; body: string }): ContactLink[] {
  const links: ContactLink[] = []
  const digits = contact.phone ? intlDigits(contact.phone) : ''
  if (digits.length >= 8) {
    links.push({ channel: 'phone', href: `tel:+${digits}`, external: false })
    links.push({ channel: 'whatsapp', href: `https://wa.me/${digits}?text=${encodeURIComponent(message.body)}`, external: true })
    // "?&body=" is read by both iOS and Android.
    links.push({ channel: 'sms', href: `sms:+${digits}?&body=${encodeURIComponent(message.body)}`, external: false })
  }
  if (contact.email) links.push({ channel: 'email', href: `mailto:${contact.email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`, external: false })
  return links
}

/** The preferred channel first, then the rest in a fixed order. */
export function byPreference(links: ContactLink[], preferred?: ContactChannel): ContactLink[] {
  const order: ContactChannel[] = ['phone', 'whatsapp', 'sms', 'email']
  return [...links].sort((a, b) => (a.channel === preferred ? -1 : b.channel === preferred ? 1 : order.indexOf(a.channel) - order.indexOf(b.channel)))
}

export const pdfUrl = {
  intake: (code: string) => `/api/admin/bookings/${encodeURIComponent(code)}/intake.pdf`,
  warranty: (id: string) => `/api/admin/warranties/${encodeURIComponent(id)}.pdf`,
  myIntake: (code: string) => `/api/me/bookings/${encodeURIComponent(code)}/intake.pdf`,
  myWarranty: (id: string) => `/api/me/warranties/${encodeURIComponent(id)}.pdf`,
}

/**
 * Shrinks a camera photo to at most 1600 px on the long side and re-encodes it as JPEG, so an
 * upload stays well under the 2 MB limit and any location data in the original is dropped.
 */
export async function shrinkPhoto(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (let q = quality; q >= 0.5; q -= 0.1) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
    if (blob && blob.size <= 1_900_000) return blob
  }
  throw new Error('photo_too_large')
}

export async function uploadPhoto(code: string, blob: Blob): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/admin/bookings/${encodeURIComponent(code)}/photos`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg' }, body: blob })
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
    return res.ok && data.id ? { ok: true, id: data.id } : { ok: false, error: data.error ?? 'error' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export const dayLabel = (date: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
