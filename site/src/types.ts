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
  slot: string // ISO datetime of the chosen start
  location?: string // required when mode === 'mobile'
  contact: { name: string; phone: string; email?: string }
  estimate: { priceFrom: number; priceTo: number; etaHours: [number, number] }
  lang: Lang
}

export type Booking = BookingRequest & {
  code: string // short human code like "NT-4K7Q"
  status: BookingStatus
  createdAt: string
  updatedAt: string
}
