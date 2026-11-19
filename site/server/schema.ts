import { z } from 'zod'
import type { BookingRequest } from '../src/types.ts'

/** Statuses a booking can move through, in workshop order. */
export const BOOKING_STATUSES = [
  'received',
  'diagnosis',
  'waiting-parts',
  'repairing',
  'ready',
  'done',
] as const

export const bookingStatusSchema = z.enum(BOOKING_STATUSES)

export const statusUpdateSchema = z.object({
  status: bookingStatusSchema,
})

const isoSlotSchema = z
  .string()
  .trim()
  .min(1, 'Slot is required')
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    'Slot must be an ISO datetime with a timezone, e.g. 2026-05-04T09:00:00.000Z',
  )
  .refine((value) => Date.parse(value) > Date.now(), 'Slot must be in the future')

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9 ()-]{8,20}$/, 'Phone must be 8-20 characters of digits, spaces, +, ( ) or -')

export const bookingRequestSchema = z
  .object({
    mode: z.enum(['shop', 'mobile']),
    jobIds: z.array(z.string().trim().min(1).max(60)).max(10, 'At most 10 jobs per booking'),
    custom: z.string().trim().max(500).optional(),
    device: z
      .object({
        brand: z.string().trim().max(60).optional(),
        model: z.string().trim().max(60).optional(),
        year: z.string().trim().max(60).optional(),
      })
      .default({}),
    issue: z.string().trim().min(3).max(1500),
    slot: isoSlotSchema,
    location: z.string().trim().max(200).optional(),
    contact: z.object({
      name: z.string().trim().min(2).max(80),
      phone: phoneSchema,
      email: z.email('Invalid email address').max(160).optional(),
    }),
    estimate: z.object({
      priceFrom: z.number().min(0),
      priceTo: z.number().min(0),
      etaHours: z.tuple([z.number().min(0), z.number().min(0)]),
    }),
    lang: z.enum(['ro', 'en']),
  })
  .superRefine((value, ctx) => {
    const hasJobs = value.jobIds.length > 0
    const hasCustom = typeof value.custom === 'string' && value.custom.length > 0

    if (!hasJobs && !hasCustom) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pick at least one job or describe the job in "custom"',
        path: ['custom'],
      })
    }

    if (value.mode === 'mobile' && !(value.location && value.location.length > 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Location is required for mobile service',
        path: ['location'],
      })
    }
  })

export type ParsedBookingRequest = z.infer<typeof bookingRequestSchema>

/** Compile-time guard: the parsed schema output must stay assignable to BookingRequest. */
export function toBookingRequest(value: ParsedBookingRequest): BookingRequest {
  return value
}
