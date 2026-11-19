import { z } from 'zod'
import { ROMANIA_BBOX } from './geo.ts'
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

export const deviceValueSchema = z.enum(['low', 'mid', 'high', 'premium'])

const boundedMoney = z.number().min(0).max(10_000_000)
const moneyRange = z.tuple([boundedMoney, boundedMoney])

/**
 * The AI estimate the customer saw. It is stored for the workshop's reference,
 * so unknown extra fields are kept but every known field is size-bounded.
 */
const storedAiEstimateSchema = z
  .object({
    labourHours: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
    fineness: z.enum(['standard', 'fine', 'micro']),
    consumables: z.enum(['low', 'medium', 'high']),
    rate: moneyRange,
    labour: moneyRange,
    parts: z
      .array(
        z.object({
          name: z.string().trim().max(60),
          priceFrom: boundedMoney,
          priceTo: boundedMoney,
        }),
      )
      .max(10),
    partsTotal: moneyRange,
    total: moneyRange,
    confidence: z.enum(['low', 'medium', 'high']),
    summary: z.string().trim().max(300),
    questions: z.array(z.string().trim().max(160)).max(3),
    model: z.string().trim().max(120),
  })
  .loose()

/** POST /api/estimate request. Unknown job ids are ignored by the route. */
export const aiEstimateRequestSchema = z.object({
  lang: z.enum(['ro', 'en']),
  mode: z.enum(['shop', 'mobile']),
  jobIds: z.array(z.string().trim().min(1).max(60)).max(10, 'At most 10 jobs per estimate'),
  device: z
    .object({
      brand: z.string().trim().max(60).optional(),
      model: z.string().trim().max(60).optional(),
      year: z.string().trim().max(60).optional(),
    })
    .default({}),
  deviceValue: deviceValueSchema.optional(),
  issue: z.string().trim().min(10).max(1500),
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

const pickupSchema = z.object({
  address: z.string().trim().max(200),
  lat: z.number().min(ROMANIA_BBOX.minLat).max(ROMANIA_BBOX.maxLat),
  lon: z.number().min(ROMANIA_BBOX.minLon).max(ROMANIA_BBOX.maxLon),
  trips: z.enum(['both', 'pickup', 'dropoff']),
  urgent: z.boolean().optional(),
  quote: z.object({
    totalLei: z.number().min(0).max(5000),
    oneWayKm: z.number().min(0).max(500),
    urgentLei: z.number().min(0).max(5000).optional(),
  }),
})

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
    deviceValue: deviceValueSchema.optional(),
    aiEstimate: storedAiEstimateSchema.optional(),
    pickup: pickupSchema.optional(),
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

    if (value.pickup && value.mode !== 'shop') {
      ctx.addIssue({
        code: 'custom',
        message: 'Pickup is only available for shop service',
        path: ['pickup'],
      })
    }
  })

export type ParsedBookingRequest = z.infer<typeof bookingRequestSchema>

/** Compile-time guard: the parsed schema output must stay assignable to BookingRequest. */
export function toBookingRequest(value: ParsedBookingRequest): BookingRequest {
  return value
}
