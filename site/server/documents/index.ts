import type { Booking, Warranty } from '../../src/types.ts'
import type { Customers } from '../admin/customers.ts'
import type { SettingsService } from '../admin/settings.ts'
import type { MailAttachment } from '../auth/outbox.ts'
import { intakeSheet, warrantyCertificate } from './sheets.ts'

/** Builds the printable documents with the shop's current details and terms. */
export function createDocuments(options: { settings: SettingsService; customers: Customers; origin: string }) {
  const origin = options.origin.replace(/\/+$/, '')
  const companyOf = async (customerId?: string) => (customerId ? (await options.customers.get(customerId))?.company : undefined)

  return {
    async intake(booking: Booking): Promise<MailAttachment> {
      const { company, documents } = await options.settings.get()
      const content = await intakeSheet({
        booking,
        company,
        terms: documents.intakeTerms,
        trackUrl: `${origin}/?cod=${encodeURIComponent(booking.code)}#status`,
        customerCompany: await companyOf(booking.customerId),
      })
      return { filename: `fisa-service-${booking.intake!.number}-${booking.intake!.year}.pdf`, content }
    },

    async warranty(warranty: Warranty, booking: Booking | null): Promise<MailAttachment> {
      const { company, documents } = await options.settings.get()
      const content = await warrantyCertificate({ warranty, booking, company, terms: documents.warrantyTerms, customerCompany: await companyOf(warranty.customerId) })
      return { filename: `garantie-${warranty.label.replace('/', '-')}.pdf`, content }
    },
  }
}

export type Documents = ReturnType<typeof createDocuments>
