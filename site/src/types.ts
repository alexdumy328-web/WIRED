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

/** `unrepairable` is a final verdict: the device goes back unrepaired, like `ready` it waits for hand-back. */
export type BookingStatus = 'received' | 'diagnosis' | 'waiting-parts' | 'repairing' | 'ready' | 'unrepairable' | 'done' | 'cancelled'

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
  /** Where the job came from. Missing on bookings made before walk-ins existed (all online). */
  source?: 'online' | 'walk-in'
  /** The customer record this job belongs to. */
  customerId?: string
  /** Filled at the counter when the device is handed in. Turns the booking into a numbered service sheet. */
  intake?: Intake
  /** Workshop notes on the repair. Internal until printed on the warranty. */
  repair?: RepairNotes
  /** When the device went back to the customer (status became done). */
  deliveredAt?: string
  /** Intake photos, ids into the photos collection. */
  photoIds?: string[]
}

export type Intake = {
  /** Service sheet number, counted per calendar year: 12 in "12/2026". */
  number: number
  year: number
  receivedAt: string
  /** Free text: "Laptop", "Espressor", "Amplificator". */
  deviceType: string
  serial?: string
  /** What came with the device: charger, bag, cables. */
  accessories?: string
  /** Visible state at hand-in: scratches, cracks, missing screws. */
  appearance?: string
  /** Display name of whoever took the device in. */
  by: string
}

export type RepairNotes = {
  diagnosis?: string
  workDone?: string
  partsUsed?: string
}

export type ContactChannel = 'phone' | 'sms' | 'whatsapp' | 'email'

export type Customer = {
  id: string
  name: string
  phone?: string
  email?: string
  /** Company customers: fiscal code and trade register number, printed on documents. */
  company?: { name?: string; cui?: string; regCom?: string }
  address?: string
  notes?: string
  preferred: ContactChannel
  createdAt: string
  updatedAt: string
  archived?: boolean
}

export type WarrantyState = 'active' | 'expiring' | 'expired' | 'void'

export type Warranty = {
  id: string
  /** "G7/2026". */
  label: string
  number: number
  year: number
  bookingCode: string
  sheet?: string
  customerId?: string
  customerName: string
  device: string
  work: string
  months: number
  /** YYYY-MM-DD, shop-local. */
  startsOn: string
  endsOn: string
  issuedAt: string
  issuedBy: string
  voided?: { at: string; by: string; reason: string }
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
