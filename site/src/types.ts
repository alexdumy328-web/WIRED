export type Lang = 'ro' | 'en'
export type Localized = { ro: string; en: string }

/** Where the work happens. */
export type ServiceMode = 'shop' | 'mobile'

export type JobCategory =
  | 'laptop' // laptops
  | 'pc' // desktop PCs
  | 'board' // board-level / motherboard / ECU micro-soldering
  | 'coffee' // espresso & coffee machines
  | 'appliance' // small/medium home appliances
  | 'it' // maintenance, cleaning, OS, data
  | 'vintage' // vintage audio: cassette decks, reel-to-reel, amplifiers, turntables
  | 'auto' // mobile car electrics

/** One bookable job in the price list. Prices in RON, VAT included. */
export type Job = {
  id: string // kebab-case, stable
  category: JobCategory
  mode: ServiceMode
  name: Localized
  description: Localized // one short sentence, what is actually done
  priceFrom: number
  priceTo?: number // omit for fixed price
  /** Typical turnaround in hours once the device is with us (shop) or on-site duration (mobile). */
  etaHours: [min: number, max: number]
  /** True when the final price is only known after diagnosis. */
  needsDiagnosis?: boolean
  /**
   * Billed by the hour instead of a set price. priceFrom/priceTo are then ignored and
   * the price is hours × rate (see lib/pricing.ts) × consumables factor, plus parts.
   */
  hourly?: {
    hours: [min: number, max: number]
    fineness: 'standard' | 'fine' | 'micro'
    consumables: 'low' | 'medium' | 'high'
    /** True when the rate follows the device's current value (asked in the booking form). */
    byValue?: boolean
  }
  /** Parts are billed on top of the shown price. */
  partsExtra?: boolean
}

export type Review = {
  name: string // first name + initial, e.g. "Andrei M."
  rating: 1 | 2 | 3 | 4 | 5
  date: string // ISO yyyy-mm-dd
  category: JobCategory
  text: Localized
}

export type BookingStatus = 'received' | 'diagnosis' | 'waiting-parts' | 'repairing' | 'ready' | 'done'

export type BookingRequest = {
  mode: ServiceMode
  jobIds: string[] // from catalog; may be empty when custom
  custom?: string // free-text description of a job not in the list
  device: { brand?: string; model?: string; year?: string } // year used for cars
  issue: string
  /** What the device is worth today, if the customer told us. */
  deviceValue?: 'low' | 'mid' | 'high' | 'premium'
  /** AI estimate the customer saw, if any (for the workshop's reference). */
  aiEstimate?: AiEstimate
  slot: string // ISO datetime of the chosen start
  location?: string // required when mode === 'mobile'
  /** We collect the device and/or bring it back (mode 'shop' only). */
  pickup?: {
    address: string
    lat: number
    lon: number
    trips: 'both' | 'pickup' | 'dropoff'
    urgent?: boolean
    quote: { totalLei: number; oneWayKm: number; urgentLei?: number }
  }
  contact: { name: string; phone: string; email?: string }
  estimate: { priceFrom: number; priceTo: number; etaHours: [number, number] }
  lang: Lang
}

/** One step in a booking's life. `note` is internal and never shown to customers. */
export type StatusEntry = {
  status: BookingStatus
  at: string
  /** Display name of whoever made the change, or "customer" / "token". */
  by: string
  byId?: string
  note?: string
}

export type Booking = BookingRequest & {
  code: string // short human code like "NT-4K7Q"
  status: BookingStatus
  createdAt: string
  updatedAt: string
  /** Set when a signed-in user made the booking. */
  userId?: string
  statusHistory?: StatusEntry[]
  /** What the workshop charged for the repair, parts included, transport not. Set by the owner. */
  finalLei?: number
}

/** POST /api/estimate request. */
export type AiEstimateRequest = {
  lang: Lang
  mode: ServiceMode
  jobIds: string[]
  device: { brand?: string; model?: string; year?: string }
  deviceValue?: 'low' | 'mid' | 'high' | 'premium'
  issue: string
}

/** POST /api/estimate response. Money is computed by the server from lib/pricing.ts, never by the model. */
export type AiEstimate = {
  labourHours: [number, number]
  fineness: 'standard' | 'fine' | 'micro'
  consumables: 'low' | 'medium' | 'high'
  rate: [number, number] // lei/h used
  labour: [number, number] // lei, labour × consumables factor
  parts: { name: string; priceFrom: number; priceTo: number }[]
  partsTotal: [number, number]
  total: [number, number]
  confidence: 'low' | 'medium' | 'high'
  summary: string // one or two sentences in the requested language
  questions: string[] // up to 3 things the workshop would ask to narrow it down
  model: string // which model produced it
}
