/** Pickup quote: OSRM road distance when available, haversine fallback otherwise. */
import {
  IASI_CENTRE,
  IASI_RADIUS_KM,
  PICKUP_DEFAULTS,
  SHOP,
  haversineKm,
  quotePickup,
} from '../src/lib/pickup.ts'
import type { PickupQuote, PickupRates, Trips } from '../src/lib/pickup.ts'
import { TtlCache } from './cache.ts'
import { isIasiCity, type GeoService } from './geo.ts'
import { fetchJson } from './upstream.ts'

const ROUTE_TTL_MS = 24 * 60 * 60 * 1000
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

export type PickupQuoteResponse = PickupQuote & {
  routed: boolean
  geometry: [number, number][] | null
}

export type PickupService = {
  quote(lat: number, lon: number, trips: Trips, urgent: boolean): Promise<PickupQuoteResponse>
}

const RATE_ENV: Record<keyof PickupRates, string> = {
  dieselLeiPerL: 'PICKUP_DIESEL_LEI_PER_L',
  consumptionLPer100: 'PICKUP_CONSUMPTION_L_PER_100',
  driverLeiPerHour: 'PICKUP_DRIVER_LEI_PER_HOUR',
  stopMinutes: 'PICKUP_STOP_MINUTES',
  minTripLei: 'PICKUP_MIN_TRIP_LEI',
  maxKm: 'PICKUP_MAX_KM',
  urgentFactor: 'PICKUP_URGENT_FACTOR',
}

function usableRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** PICKUP_DEFAULTS, then numeric env overrides, then explicit options (for tests). */
export function resolvePickupRates(overrides: Partial<PickupRates> = {}): PickupRates {
  const rates: PickupRates = { ...PICKUP_DEFAULTS }

  for (const key of Object.keys(RATE_ENV) as Array<keyof PickupRates>) {
    const raw = process.env[RATE_ENV[key]]
    if (raw === undefined || raw.trim() === '') continue
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 0) rates[key] = value
  }

  for (const key of Object.keys(overrides) as Array<keyof PickupRates>) {
    const value = overrides[key]
    if (usableRate(value)) rates[key] = value
  }

  return rates
}

type Route = {
  km: number
  min: number
  geometry: [number, number][] | null
}

function geometryOf(value: unknown): [number, number][] | null {
  if (typeof value !== 'object' || value === null) return null
  const coordinates = (value as Record<string, unknown>).coordinates
  if (!Array.isArray(coordinates)) return null

  const pairs: [number, number][] = []
  for (const pair of coordinates) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    const lon = Number(pair[0])
    const lat = Number(pair[1])
    if (Number.isFinite(lat) && Number.isFinite(lon)) pairs.push([lat, lon])
  }
  return pairs.length > 0 ? pairs : null
}

async function fetchRoute(
  fetchImpl: typeof fetch,
  lat: number,
  lon: number,
): Promise<Route | null> {
  const url = `${OSRM_URL}/${SHOP.lon},${SHOP.lat};${lon},${lat}?overview=simplified&geometries=geojson`
  const result = await fetchJson(url, fetchImpl)
  if (!result.ok) return null

  const body = result.data
  if (typeof body !== 'object' || body === null) return null
  const routes = (body as Record<string, unknown>).routes
  if (!Array.isArray(routes) || routes.length === 0) return null

  const first = routes[0]
  if (typeof first !== 'object' || first === null) return null
  const route = first as Record<string, unknown>

  const distance = Number(route.distance)
  const duration = Number(route.duration)
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(duration) ||
    distance < 0 ||
    duration < 0
  ) {
    return null
  }

  return {
    km: distance / 1000,
    min: duration / 60,
    geometry: geometryOf(route.geometry),
  }
}

export function createPickupService(
  fetchImpl: typeof fetch,
  /** Fixed rates, or a getter so the owner's settings apply without a restart. */
  rates: PickupRates | (() => PickupRates | Promise<PickupRates>),
  geo: GeoService,
): PickupService {
  const cache = new TtlCache(500)

  return {
    async quote(
      lat: number,
      lon: number,
      trips: Trips,
      urgent: boolean,
    ): Promise<PickupQuoteResponse> {
      const point = { lat, lon }
      const key = `route:${lat.toFixed(5)},${lon.toFixed(5)}:${urgent ? 'urgent' : 'normal'}`

      let route = cache.get<Route>(key)
      if (!route) {
        route = await fetchRoute(fetchImpl, lat, lon)
        if (route) cache.set(key, route, ROUTE_TTL_MS)
      }

      // OSRM down: a road factor on the great-circle distance, 2 min per km.
      const fallbackKm = haversineKm(SHOP, point) * 1.3
      const effective = route ?? { km: fallbackKm, min: fallbackKm * 2, geometry: null }

      const reverse = await geo.reverse(lat, lon, 'ro')
      const insideIasi = reverse?.city
        ? isIasiCity(reverse.city)
        : haversineKm(IASI_CENTRE, point) <= IASI_RADIUS_KM

      const current = typeof rates === 'function' ? await rates() : rates
      const quote = quotePickup(effective.km, effective.min, trips, insideIasi, current, urgent)
      return {
        ...quote,
        routed: route !== null,
        geometry: route ? route.geometry : null,
      }
    },
  }
}
