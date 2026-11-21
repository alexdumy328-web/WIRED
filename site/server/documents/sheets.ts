import { rgb } from 'pdf-lib'
import { catalog } from '../../src/data/catalog.ts'
import type { Booking, Warranty } from '../../src/types.ts'
import type { CompanyDetails } from '../admin/settings.ts'
import { createPen, drawQr, footer, GOLD, header, MARGIN, MUTED, roDateTime, roDay, sectionTitle, signatures, TINT, type Pen } from './pdf.ts'

/** Job names from the price list, then the customer's own request. */
export function workAsked(b: Booking): string {
  const names = b.jobIds.map((id) => catalog.find((j) => j.id === id)?.name.ro).filter(Boolean) as string[]
  if (b.custom) names.push(b.custom)
  return names.join('; ')
}

export function deviceName(b: Booking): string {
  return [b.intake?.deviceType, b.device.brand, b.device.model, b.device.year].filter(Boolean).join(' ') || b.custom || 'Aparat'
}

function customerFields(b: Booking, company?: { name?: string; cui?: string; regCom?: string }) {
  const row = [
    { label: 'Client', value: b.contact.name },
    { label: 'Telefon', value: b.contact.phone },
    { label: 'Email', value: b.contact.email ?? '' },
  ]
  const firm = company?.name || company?.cui ? [{ label: 'Firmă', value: company.name ?? '' }, { label: 'CUI', value: company.cui ?? '' }, { label: 'Reg. Com.', value: company.regCom ?? '' }] : null
  return firm ? [row, firm] : [row]
}

function terms(pen: Pen, title: string, value: string) {
  const lines = value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return
  sectionTitle(pen, title)
  lines.forEach((line, i) => pen.text(`${i + 1}. ${line}`, { size: 8.5, color: MUTED, lineGap: 0.5 }))
}

/**
 * The service sheet (fișă de service) handed to the customer when the device comes in. It
 * records what was handed over and in what state, and carries a QR code to the status page.
 */
export async function intakeSheet(input: { booking: Booking; company: CompanyDetails; terms: string; trackUrl: string; customerCompany?: { name?: string; cui?: string; regCom?: string } }): Promise<Uint8Array> {
  const { booking: b, company } = input
  const intake = b.intake!
  const number = `${intake.number}/${intake.year}`
  const pen = await createPen({ title: `Fișă de service ${number}`, subject: `Recepție aparat, ${b.code}`, author: company.name || 'Norgelis Tech' })
  header(pen, company, 'Fișă de service', `Nr. ${number}`, `Primit ${roDateTime(intake.receivedAt)}`)

  // Tracking strip: code, QR and the link, so the customer can follow the repair without calling.
  const stripTop = pen.y
  const stripH = 92
  pen.box(MARGIN, stripTop, pen.width, stripH, { fill: TINT })
  drawQr(pen, input.trackUrl, MARGIN + pen.width - stripH + 6, stripTop + 6, stripH - 12)
  pen.y = stripTop + 14
  pen.text('COD DE URMĂRIRE', { x: MARGIN + 16, size: 7.5, weight: 'semibold', color: GOLD })
  pen.text(b.code, { x: MARGIN + 16, size: 22, weight: 'bold' })
  pen.text('Scanați codul QR sau intrați pe site și introduceți codul ca să vedeți în ce stadiu e reparația.', { x: MARGIN + 16, width: pen.width - stripH - 40, size: 8.5, color: MUTED })
  pen.y = stripTop + stripH + 14

  sectionTitle(pen, 'Client')
  pen.fields(customerFields(b, input.customerCompany))

  sectionTitle(pen, 'Aparat')
  pen.fields([
    [
      { label: 'Tip', value: intake.deviceType },
      { label: 'Marcă și model', value: [b.device.brand, b.device.model, b.device.year].filter(Boolean).join(' ') },
      { label: 'Serie', value: intake.serial ?? '' },
    ],
    [
      { label: 'Accesorii predate', value: intake.accessories || 'Fără accesorii' },
      { label: 'Starea la predare', value: intake.appearance || 'Fără observații' },
    ],
  ])

  sectionTitle(pen, 'Defect reclamat')
  pen.text(b.issue, { size: 10 })
  const asked = workAsked(b)
  if (asked) {
    pen.gap(4)
    pen.text(`Lucrări cerute: ${asked}`, { size: 9, color: MUTED })
  }

  sectionTitle(pen, 'Cost estimat')
  const estimate =
    b.estimate.priceTo > 0
      ? `${b.estimate.priceFrom === b.estimate.priceTo ? `${b.estimate.priceFrom}` : `${b.estimate.priceFrom}–${b.estimate.priceTo}`} lei, fără piese. Prețul final se confirmă după diagnostic.`
      : 'Se stabilește după diagnostic. Vă sunăm înainte de orice cost.'
  pen.text(estimate, { size: 10 })
  if (b.pickup) pen.text(`Transport: ${b.pickup.quote.totalLei} lei (${{ both: 'ridicare și livrare', pickup: 'ridicare', dropoff: 'livrare' }[b.pickup.trips]}).`, { size: 9, color: MUTED })

  terms(pen, 'Condiții', input.terms)
  signatures(pen, `Client: ${b.contact.name}. Am predat aparatul în starea descrisă.`, `Primit de: ${intake.by}`)
  footer(pen, `Fișa ${number}  ·  ${b.code}  ·  ${company.name || 'Norgelis Tech'}`)
  return pen.doc.save()
}

/** The warranty certificate for one finished job. */
export async function warrantyCertificate(input: { warranty: Warranty; booking: Booking | null; company: CompanyDetails; terms: string; customerCompany?: { name?: string; cui?: string; regCom?: string } }): Promise<Uint8Array> {
  const { warranty: w, booking: b, company } = input
  const pen = await createPen({ title: `Certificat de garanție ${w.label}`, subject: `Garanție pentru ${w.bookingCode}`, author: company.name || 'Norgelis Tech' })
  header(pen, company, 'Certificat de garanție', w.label, `Emis ${roDay(w.startsOn)}`)

  if (w.voided) {
    const top = pen.y
    pen.box(MARGIN, top, pen.width, 34, { fill: rgb(0.98, 0.92, 0.94) })
    pen.y = top + 10
    pen.text(`ANULAT la ${roDay(w.voided.at.slice(0, 10))}: ${w.voided.reason}`, { x: MARGIN + 12, size: 10, weight: 'bold', color: rgb(0.72, 0.27, 0.44) })
    pen.y = top + 44
  }

  // The validity band: the one thing a customer looks for on this page.
  const top = pen.y
  pen.box(MARGIN, top, pen.width, 64, { fill: TINT })
  pen.y = top + 12
  pen.text('VALABILĂ', { x: MARGIN + 16, size: 7.5, weight: 'semibold', color: GOLD })
  pen.text(w.months === 1 ? '1 lună' : `${w.months} luni`, { x: MARGIN + 16, size: 20, weight: 'bold' })
  pen.y = top + 16
  pen.text(`de la ${roDay(w.startsOn)}`, { x: MARGIN + pen.width / 2, width: pen.width / 2 - 16, size: 10, align: 'right', color: MUTED })
  pen.text(`până la ${roDay(w.endsOn)} inclusiv`, { x: MARGIN + pen.width / 2, width: pen.width / 2 - 16, size: 12, weight: 'bold', align: 'right' })
  pen.y = top + 64 + 12

  sectionTitle(pen, 'Client')
  if (b) pen.fields(customerFields(b, input.customerCompany))
  else pen.fields([[{ label: 'Client', value: w.customerName }]])

  sectionTitle(pen, 'Aparat și lucrare')
  pen.fields([
    [
      { label: 'Aparat', value: w.device },
      { label: 'Serie', value: b?.intake?.serial ?? '' },
      { label: 'Fișa de service', value: w.sheet ? `${w.sheet}, ${w.bookingCode}` : w.bookingCode },
    ],
  ])
  pen.fields([[{ label: 'Lucrare efectuată', value: w.work }]])
  if (b?.repair?.partsUsed) pen.fields([[{ label: 'Piese montate', value: b.repair.partsUsed }]])

  terms(pen, 'Condiții de garanție', input.terms)
  signatures(pen, `Service: ${w.issuedBy} (semnătură și ștampilă)`, `Client: ${w.customerName}`)
  footer(pen, `Garanția ${w.label}  ·  ${w.bookingCode}  ·  ${company.name || 'Norgelis Tech'}`)
  return pen.doc.save()
}
