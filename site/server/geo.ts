/** Photon geocoding for the pickup form. Labels are built from the feature properties. */
import { TtlCache } from './cache.ts'
import { fetchJson } from './upstream.ts'

export const ROMANIA_BBOX = {
  minLon: 20.2,
  minLat: 43.6,
  maxLon: 29.7,
  maxLat: 48.3,
} as const

export function inRomania(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= ROMANIA_BBOX.minLat &&
    lat <= ROMANIA_BBOX.maxLat &&
    lon >= ROMANIA_BBOX.minLon &&
    lon <= ROMANIA_BBOX.maxLon
  )
}

export type GeoPlace = { label: string; lat: number; lon: number; city?: string }

export type GeoService = {
  /** null means the upstream call failed; an empty array means no matches. */
  search(q: string, lang: 'ro' | 'en'): Promise<GeoPlace[] | null>
  reverse(lat: number, lon: number, lang: 'ro' | 'en'): Promise<GeoPlace | null>
}

const SEARCH_TTL_MS = 60 * 60 * 1000
const REVERSE_TTL_MS = 60 * 60 * 1000
const PHOTON_SEARCH_URL = 'https://photon.komoot.io/api/'
const PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse'
const SEARCH_LIMIT = 6

function textProperty(properties: Record<string, unknown>, key: string): string | undefined {
  const value = properties[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function localityOf(properties: Record<string, unknown>): string | undefined {
  return (
    textProperty(properties, 'city') ??
    textProperty(properties, 'town') ??
    textProperty(properties, 'village') ??
    textProperty(properties, 'municipality') ??
    textProperty(properties, 'locality')
  )
}

function countyOf(properties: Record<string, unknown>): string | undefined {
  return textProperty(properties, 'county') ?? textProperty(properties, 'state')
}

/** "street housenumber, locality, county", de-duplicated and without empty parts. */
function labelOf(properties: Record<string, unknown>, fallback: string): string {
  const street = textProperty(properties, 'street')
  const houseNumber = textProperty(properties, 'housenumber')
  const name = textProperty(properties, 'name')
  const locality = localityOf(properties)
  const county = countyOf(properties)

  const road = street
    ? [street, houseNumber].filter((part): part is string => Boolean(part)).join(' ')
    : name && name !== locality
      ? name
      : ''

  const parts = [road, locality, county].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(', ') : fallback
}

function featureToPlace(feature: unknown): GeoPlace | null {
  if (typeof feature !== 'object' || feature === null) return null
  const record = feature as Record<string, unknown>

  const geometry = record.geometry
  if (typeof geometry !== 'object' || geometry === null) return null
  const coordinates = (geometry as Record<string, unknown>).coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null

  const lon = Number(coordinates[0])
  const lat = Number(coordinates[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const rawProperties = record.properties
  const properties =
    typeof rawProperties === 'object' && rawProperties !== null
      ? (rawProperties as Record<string, unknown>)
      : {}

  const city = localityOf(properties)
  const label = labelOf(properties, `${lat.toFixed(5)}, ${lon.toFixed(5)}`)

  return city ? { label, lat, lon, city } : { label, lat, lon }
}

function featuresOf(data: unknown): unknown[] | null {
  if (typeof data !== 'object' || data === null) return null
  const features = (data as Record<string, unknown>).features
  return Array.isArray(features) ? features : null
}

export function isIasiCity(city: string): boolean {
  const normalized = city
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
  return normalized === 'iasi'
}

export function createGeoService(fetchImpl: typeof fetch): GeoService {
  const cache = new TtlCache(500)

  return {
    async search(q: string, lang: 'ro' | 'en'): Promise<GeoPlace[] | null> {
      const key = `search:${lang}:${q.trim().toLowerCase()}`
      const cached = cache.get<GeoPlace[]>(key)
      if (cached) return cached

      const url = `${PHOTON_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}&lang=${lang}&lat=47.16&lon=27.59&bbox=${ROMANIA_BBOX.minLon},${ROMANIA_BBOX.minLat},${ROMANIA_BBOX.maxLon},${ROMANIA_BBOX.maxLat}`
      const result = await fetchJson(url, fetchImpl)
      if (!result.ok) return null

      const features = featuresOf(result.data)
      if (!features) return null

      const places: GeoPlace[] = []
      for (const feature of features) {
        const place = featureToPlace(feature)
        if (place) places.push(place)
      }

      cache.set(key, places, SEARCH_TTL_MS)
      return places
    },

    async reverse(lat: number, lon: number, lang: 'ro' | 'en'): Promise<GeoPlace | null> {
      const key = `reverse:${lang}:${lat.toFixed(5)},${lon.toFixed(5)}`
      const cached = cache.get<GeoPlace>(key)
      if (cached) return cached

      const url = `${PHOTON_REVERSE_URL}?lat=${lat}&lon=${lon}&lang=${lang}`
      const result = await fetchJson(url, fetchImpl)
      if (!result.ok) return null

      const features = featuresOf(result.data)
      if (!features) return null

      const place = features.length > 0 ? featureToPlace(features[0]) : null
      const resolved: GeoPlace = place ?? {
        label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        lat,
        lon,
      }

      cache.set(key, resolved, REVERSE_TTL_MS)
      return resolved
    },
  }
}
