/**
 * Pickup and drop-off pricing, shared by the site and the API (server imports this file).
 * Erasable TypeScript only, no imports with runtime effects.
 *
 * Each trip is shop → customer → shop. Price per trip = fuel + driver time, with a minimum.
 * Fuel = km × consumption × diesel price. Time = driving minutes + a fixed stop at the door.
 */

export const SHOP = { lat: 47.166015, lon: 27.558417, name: 'Norgelis Tech' } as const
/** Iași city centre, used for the "inside Iași" check when geocoding gives no city. */
export const IASI_CENTRE = { lat: 47.1585, lon: 27.6014 } as const
export const IASI_RADIUS_KM = 8

/** Edit these when fuel prices or the van change. The API can override them with env vars. */
export const PICKUP_DEFAULTS = {
  dieselLeiPerL: 7.6, // pump price, lei per litre
  consumptionLPer100: 7.5, // the van, litres per 100 km
  driverLeiPerHour: 25, // driver time (10 km one way ≈ 30 lei per trip)
  stopMinutes: 10, // parking, handing over the device, paperwork
  minTripLei: 25, // smallest charge for one trip
  maxKm: 100, // one-way road distance; beyond this we ask the customer to call
  urgentFactor: 1.5, // "we come today": +50% on transport
} as const
export type PickupRates = { -readonly [K in keyof typeof PICKUP_DEFAULTS]: number }

export type Trips = 'both' | 'pickup' | 'dropoff'
export const tripCount = (t: Trips) => (t === 'both' ? 2 : 1)

export type PickupQuote = {
  oneWayKm: number
  oneWayMin: number
  trips: Trips
  totalKm: number
  fuelLei: number
  timeLei: number
  perTripLei: number
  urgent: boolean
  urgentLei: number // the urgent surcharge included in totalLei
  totalLei: number
  insideIasi: boolean
  tooFar: boolean
  rates: PickupRates
}

const round = (n: number, step = 1) => Math.round(n / step) * step

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * Price for a road distance and duration (one way, from the shop).
 * When no routing is available, pass haversine × 1.3 and 2 min/km.
 */
export function quotePickup(
  oneWayKm: number,
  oneWayMin: number,
  trips: Trips,
  insideIasi: boolean,
  rates: PickupRates = { ...PICKUP_DEFAULTS },
  urgent = false,
): PickupQuote {
  const n = tripCount(trips)
  const tripKm = oneWayKm * 2
  const fuelPerTrip = (tripKm * rates.consumptionLPer100 * rates.dieselLeiPerL) / 100
  const timePerTrip = ((oneWayMin * 2 + rates.stopMinutes) / 60) * rates.driverLeiPerHour
  const base = Math.max(rates.minTripLei, round(fuelPerTrip + timePerTrip, 5))
  const perTrip = urgent ? round(base * rates.urgentFactor, 5) : base
  return {
    oneWayKm: round(oneWayKm, 0.1),
    oneWayMin: Math.round(oneWayMin),
    trips,
    totalKm: round(tripKm * n, 0.1),
    fuelLei: round(fuelPerTrip * n),
    timeLei: round(timePerTrip * n),
    perTripLei: perTrip,
    urgent,
    urgentLei: (perTrip - base) * n,
    totalLei: perTrip * n,
    insideIasi,
    tooFar: oneWayKm > rates.maxKm,
    rates,
  }
}
