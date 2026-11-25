import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { SHOP } from '../lib/pickup.ts'
import type { PickupQuote, Trips } from '../lib/pickup.ts'
import { useTheme } from '../lib/theme.tsx'
import { shopIcon, TILE_ATTRIBUTION, TILE_URL } from './map-icons.ts'

export type PickupValue = {
  address: string
  lat: number
  lon: number
  trips: Trips
  quote: PickupQuote | null
}

export type PickupMapLabels = {
  search: string
  searchPlaceholder: string
  noResults: string
  searchError: string
  useMyLocation: string
  dragHint: string
  trips: Record<Trips, string>
  distance: string // "{km} km one way, about {min} min"
  fuel: string
  time: string
  total: string
  perTrip: string // "{price} lei per trip"
  insideIasi: string
  outsideIasi: string
  tooFar: string
  estimated: string // estimated = shown when routed is false
  quoteError: string
  shop: string
  urgent: string
}

type QuoteResponse = PickupQuote & {
  routed: boolean
  geometry: [number, number][] | null
}

function formatNumber(n: number, lang: 'ro' | 'en'): string {
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)
}

function formatMoney(n: number, lang: 'ro' | 'en'): string {
  return `${formatNumber(n, lang)} lei`
}

function MapInvalidator() {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 150)
    return () => clearTimeout(timer)
  }, [map])
  return null
}

function MapInteractionHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lon: number) => void
}) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (!map.scrollWheelZoom.enabled()) {
        map.scrollWheelZoom.enable()
      }
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })

  return null
}

function MapBoundsController({
  point,
  geometry,
}: {
  point: { lat: number; lon: number } | null
  geometry?: [number, number][] | null
}) {
  const map = useMap()
  const lastFitRef = useRef<string>('')

  useEffect(() => {
    if (!point) return
    const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)},${geometry ? geometry.length : 0}`
    if (lastFitRef.current === key) return
    lastFitRef.current = key

    const points: [number, number][] = [
      [SHOP.lat, SHOP.lon],
      [point.lat, point.lon],
    ]
    if (geometry && geometry.length > 0) {
      for (const p of geometry) {
        points.push(p)
      }
    }
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, {
      padding: [45, 45],
      maxZoom: 15,
      animate: true,
    })
  }, [map, point, geometry])

  return null
}

export default function PickupMap(props: {
  value: PickupValue | null
  onChange: (v: PickupValue) => void
  lang: 'ro' | 'en'
  labels: PickupMapLabels
  urgent?: boolean
  className?: string
}): JSX.Element {
  const { value, onChange, lang, labels, urgent = false, className } = props
  const { resolved } = useTheme()
  const searchId = useId()
  const listboxId = useId()

  const [address, setAddress] = useState(value?.address ?? '')
  const [searchQuery, setSearchQuery] = useState(value?.address ?? '')
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(
    value && Number.isFinite(value.lat) && Number.isFinite(value.lon) && (value.lat !== 0 || value.lon !== 0)
      ? { lat: value.lat, lon: value.lon }
      : null
  )
  const [trips, setTrips] = useState<Trips>(value?.trips ?? 'both')
  const [quote, setQuote] = useState<QuoteResponse | null>(
    value?.quote
      ? {
          ...value.quote,
          routed: true,
          geometry: null,
        }
      : null
  )
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState(false)

  const [searchResults, setSearchResults] = useState<
    Array<{ label: string; lat: number; lon: number; city?: string }>
  >([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [isLocating, setIsLocating] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const quoteReqIdRef = useRef(0)
  const searchAbortRef = useRef<AbortController | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const latestQuoteRef = useRef<QuoteResponse | null>(quote)
  latestQuoteRef.current = quote
  const addressRef = useRef(address)
  addressRef.current = address
  const tripsRef = useRef(trips)
  tripsRef.current = trips
  const urgentRef = useRef(urgent)
  urgentRef.current = urgent

  const triggerQuote = useCallback(
    async (lat: number, lon: number, t: Trips, urg: boolean, addr: string) => {
      const reqId = ++quoteReqIdRef.current
      setQuoteLoading(true)
      setQuoteError(false)

      try {
        const url = `/api/pickup/quote?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&trips=${encodeURIComponent(t)}${urg ? '&urgent=1' : ''}`
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`Quote failed with status ${res.status}`)
        }
        const data = (await res.json()) as QuoteResponse
        if (reqId === quoteReqIdRef.current) {
          setQuote(data)
          setQuoteLoading(false)
          latestQuoteRef.current = data
          onChangeRef.current({
            address: addr,
            lat,
            lon,
            trips: t,
            quote: data,
          })
        }
      } catch {
        if (reqId === quoteReqIdRef.current) {
          setQuote(null)
          setQuoteLoading(false)
          setQuoteError(true)
          latestQuoteRef.current = null
          onChangeRef.current({
            address: addr,
            lat,
            lon,
            trips: t,
            quote: null,
          })
        }
      }
    },
    []
  )

  // Restore on mount if value is provided
  const mountedRef = useRef(false)
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    if (
      value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lon) &&
      (value.lat !== 0 || value.lon !== 0)
    ) {
      setPoint({ lat: value.lat, lon: value.lon })
      setAddress(value.address ?? '')
      setSearchQuery(value.address ?? '')
      const initialTrips = value.trips ?? 'both'
      setTrips(initialTrips)
      triggerQuote(value.lat, value.lon, initialTrips, urgent, value.address ?? '')
    }
  }, [value, urgent, triggerQuote])

  // React to urgent prop changing
  const prevUrgentRef = useRef(urgent)
  useEffect(() => {
    if (prevUrgentRef.current !== urgent) {
      prevUrgentRef.current = urgent
      if (point) {
        triggerQuote(point.lat, point.lon, trips, urgent, address)
      }
    }
  }, [urgent, point, trips, address, triggerQuote])

  // Sync with value prop if updated from outside
  const lastValuePropRef = useRef(value)
  useEffect(() => {
    if (!mountedRef.current) return
    if (value === lastValuePropRef.current) return
    lastValuePropRef.current = value

    if (!value) {
      setPoint(null)
      setAddress('')
      setSearchQuery('')
      setQuote(null)
      return
    }

    const posChanged = !point || point.lat !== value.lat || point.lon !== value.lon
    const tripsChanged = trips !== value.trips
    const addressChanged = address !== value.address

    if (posChanged) {
      setPoint({ lat: value.lat, lon: value.lon })
    }
    if (addressChanged) {
      setAddress(value.address)
      setSearchQuery(value.address)
    }
    if (tripsChanged) {
      setTrips(value.trips)
    }
    if (posChanged || tripsChanged) {
      triggerQuote(value.lat, value.lon, value.trips, urgent, value.address)
    }
  }, [value, point, trips, address, urgent, triggerQuote])

  // Debounced search autocomplete
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 3) {
      setSearchResults([])
      setIsSearching(false)
      setSearchError(false)
      return
    }

    const timer = setTimeout(async () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort()
      }
      const ac = new AbortController()
      searchAbortRef.current = ac

      setIsSearching(true)
      setSearchError(false)

      try {
        const res = await fetch(
          `/api/geo/search?q=${encodeURIComponent(trimmed)}&lang=${encodeURIComponent(lang)}`,
          { signal: ac.signal }
        )
        if (!res.ok) {
          throw new Error(`Search error ${res.status}`)
        }
        const data = (await res.json()) as {
          results: Array<{ label: string; lat: number; lon: number; city?: string }>
        }
        setSearchResults(data.results ?? [])
        setDropdownOpen(true)
        setHighlightedIndex(-1)
        setIsSearching(false)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setSearchError(true)
          setSearchResults([])
          setDropdownOpen(true)
          setIsSearching(false)
        }
      }
    }, 350)

    return () => {
      clearTimeout(timer)
    }
  }, [searchQuery, lang])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  const handlePointChosen = useCallback(
    async (lat: number, lon: number) => {
      setPoint({ lat, lon })
      triggerQuote(lat, lon, tripsRef.current, urgentRef.current, addressRef.current)

      try {
        const res = await fetch(
          `/api/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=${encodeURIComponent(lang)}`
        )
        if (res.ok) {
          const data = (await res.json()) as {
            label: string
            lat: number
            lon: number
            city?: string
          }
          if (data.label) {
            setAddress(data.label)
            setSearchQuery(data.label)
            onChangeRef.current({
              address: data.label,
              lat,
              lon,
              trips: tripsRef.current,
              quote: latestQuoteRef.current,
            })
            return
          }
        }
      } catch {
        // Fall back gracefully
      }

      const fallback = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
      setAddress(fallback)
      setSearchQuery(fallback)
      onChangeRef.current({
        address: fallback,
        lat,
        lon,
        trips: tripsRef.current,
        quote: latestQuoteRef.current,
      })
    },
    [lang, triggerQuote]
  )

  const handleSelectResult = (item: { label: string; lat: number; lon: number }) => {
    setAddress(item.label)
    setSearchQuery(item.label)
    setPoint({ lat: item.lat, lon: item.lon })
    setDropdownOpen(false)
    setHighlightedIndex(-1)
    triggerQuote(item.lat, item.lon, trips, urgent, item.label)
  }

  const handleUseMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false)
        handlePointChosen(pos.coords.latitude, pos.coords.longitude)
      },
      (err) => {
        setIsLocating(false)
        console.warn('Geolocation error:', err)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [handlePointChosen])

  const handleTripsChange = (t: Trips) => {
    setTrips(t)
    if (point) {
      triggerQuote(point.lat, point.lon, t, urgent, address)
    }
    onChangeRef.current({
      address,
      lat: point?.lat ?? 0,
      lon: point?.lon ?? 0,
      trips: t,
      quote: latestQuoteRef.current,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen) {
      if (e.key === 'ArrowDown' && searchResults.length > 0) {
        setDropdownOpen(true)
        setHighlightedIndex(0)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1))
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        e.preventDefault()
        handleSelectResult(searchResults[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDropdownOpen(false)
      setHighlightedIndex(-1)
    }
  }

  const shop = useMemo(() => shopIcon(), [])

  const customerIcon = useMemo(() => {
    return L.divIcon({
      className: 'nt-customer-icon',
      html: `
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(217, 169, 63, 0.25);
          border: 2.5px solid #d9a93f;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 12px rgba(0,0,0,0.4);
          cursor: grab;
        ">
          <div style="
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #d9a93f;
            box-shadow: 0 0 6px #d9a93f;
          "></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
  }, [])

  const markerEventHandlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const marker = e.target as L.Marker
        const latLng = marker.getLatLng()
        handlePointChosen(latLng.lat, latLng.lng)
      },
    }),
    [handlePointChosen]
  )

  const polylinePositions = useMemo<[number, number][]>(() => {
    if (!point) return []
    if (quote?.routed && quote.geometry && quote.geometry.length > 0) {
      return quote.geometry
    }
    return [
      [SHOP.lat, SHOP.lon],
      [point.lat, point.lon],
    ]
  }, [point, quote])

  const isDashed = !quote?.routed || !quote?.geometry || quote.geometry.length === 0
  // Standard OpenStreetMap tiles (no key). In dark mode a CSS filter on the tile pane darkens them.

  return (
    <div className={`grid gap-3.5 ${className ?? ''}`} ref={containerRef}>
      {/* Search Bar + Use My Location */}
      <div className="relative">
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor={searchId} className="text-[14px] font-semibold text-ink">
            {labels.search}
          </label>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={isLocating}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gold transition-opacity hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLocating ? (
              <span className="size-3 animate-spin rounded-full border-2 border-line border-t-gold" />
            ) : (
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
            )}
            <span>{labels.useMyLocation}</span>
          </button>
        </div>

        <div className="relative">
          <input
            id={searchId}
            type="text"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={
              highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
            }
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setDropdownOpen(true)
            }}
            onFocus={() => {
              if (searchResults.length > 0 || isSearching || searchError) {
                setDropdownOpen(true)
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={labels.searchPlaceholder}
            className="field pr-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSearchResults([])
                setDropdownOpen(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
              aria-label={lang === 'ro' ? 'Șterge adresa' : 'Clear address'}
            >
              <svg className="size-4" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Combobox Dropdown */}
        {dropdownOpen && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-[1050] mt-1.5 max-h-60 overflow-y-auto rounded-[14px] border border-line bg-surface py-1 shadow-2xl"
          >
            {isSearching ? (
              <li className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-muted">
                <span className="size-3 animate-spin rounded-full border-2 border-line border-t-gold" />
                <span>{labels.search}...</span>
              </li>
            ) : searchError ? (
              <li className="px-3.5 py-2.5 text-xs text-danger">{labels.searchError}</li>
            ) : searchResults.length === 0 ? (
              <li className="px-3.5 py-2.5 text-xs text-muted">{labels.noResults}</li>
            ) : (
              searchResults.map((result, i) => (
                <li
                  key={`${result.lat}-${result.lon}-${i}`}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={i === highlightedIndex}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelectResult(result)
                  }}
                  className={`cursor-pointer px-3.5 py-2 text-sm transition-colors ${
                    i === highlightedIndex ? 'bg-surface-2 text-ink font-medium' : 'text-ink hover:bg-surface-2/60'
                  }`}
                >
                  <div className="truncate">{result.label}</div>
                  {result.city && (
                    <div className="text-[11px] text-muted">{result.city}</div>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Map Container */}
      <div className="relative h-[300px] overflow-hidden rounded-[18px] border border-line md:h-[360px] isolate">
        <MapContainer
          center={[SHOP.lat, SHOP.lon]}
          zoom={12}
          scrollWheelZoom={false}
          zoomControl={true}
          className="size-full"
        >
          <TileLayer
            key={resolved}
            url={TILE_URL}
            attribution={TILE_ATTRIBUTION}
            className={resolved === 'dark' ? 'nt-tiles-dark' : 'nt-tiles-light'}
            maxZoom={19}
          />
          <MapInvalidator />
          <MapInteractionHandler onMapClick={handlePointChosen} />
          <MapBoundsController point={point} geometry={quote?.geometry} />

          {/* Shop Marker */}
          <Marker position={[SHOP.lat, SHOP.lon]} icon={shop}>
            <Tooltip direction="top" offset={[0, -14]} permanent={false}>
              {labels.shop}
            </Tooltip>
          </Marker>

          {/* Customer Marker */}
          {point && (
            <Marker
              position={[point.lat, point.lon]}
              icon={customerIcon}
              draggable={true}
              eventHandlers={markerEventHandlers}
            >
              <Tooltip direction="top" offset={[0, -16]} permanent={false}>
                {labels.dragHint}
              </Tooltip>
            </Marker>
          )}

          {/* Route Polyline */}
          {point && polylinePositions.length > 0 && (
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#d9a93f',
                weight: 4,
                opacity: 0.85,
                dashArray: isDashed ? '6, 8' : undefined,
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Trips Segmented Control */}
      <div
        className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2/60 p-1"
        role="radiogroup"
        aria-label={lang === 'ro' ? 'Drumuri' : 'Trips'}
      >
        {(['both', 'pickup', 'dropoff'] as const).map((t) => {
          const active = trips === t
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleTripsChange(t)}
              className={`cursor-pointer rounded-lg px-2 py-2 text-center text-[13px] font-semibold transition-all sm:px-3 ${
                active
                  ? 'border border-line/60 bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {labels.trips[t]}
            </button>
          )
        })}
      </div>

      {/* Quote Panel */}
      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4 transition-colors sm:p-5">
        {!point ? (
          <div className="py-2 text-center text-sm text-muted">
            {labels.searchPlaceholder}
          </div>
        ) : quoteLoading && !quote ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
            <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-gold" />
            <span>{labels.search}...</span>
          </div>
        ) : quoteError ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {labels.quoteError}
          </div>
        ) : quote ? (
          quote.tooFar ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs text-muted sm:text-sm">
                <span>
                  {labels.distance
                    .replace('{km}', String(quote.oneWayKm))
                    .replace('{min}', String(quote.oneWayMin))}
                </span>
                <span className="inline-flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
                  {quote.insideIasi ? labels.insideIasi : labels.outsideIasi}
                </span>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/60 p-3.5 text-sm font-semibold text-ink">
                {labels.tooFar}
              </div>
            </div>
          ) : (
            <>
              {/* Distance and Location Tag */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted sm:text-sm">
                <div className="flex items-center gap-2">
                  <span>
                    {labels.distance
                      .replace('{km}', String(quote.oneWayKm))
                      .replace('{min}', String(quote.oneWayMin))}
                  </span>
                  {!quote.routed && (
                    <span className="text-[12px] italic text-muted">
                      ({labels.estimated})
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
                  {quote.insideIasi ? labels.insideIasi : labels.outsideIasi}
                </span>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-line/60 bg-surface-2/40 p-2.5 text-xs sm:text-[13px]">
                <div>
                  <span className="text-muted">{labels.fuel}: </span>
                  <span className="font-semibold text-ink">
                    {formatMoney(quote.fuelLei, lang)}
                  </span>
                </div>
                <div>
                  <span className="text-muted">{labels.time}: </span>
                  <span className="font-semibold text-ink">
                    {formatMoney(quote.timeLei, lang)}
                  </span>
                </div>
                {quote.urgent && (
                  <div className="col-span-2 flex items-center justify-between border-t border-line/40 pt-1.5 font-medium text-gold">
                    <span>{labels.urgent}</span>
                    <span className="font-semibold">
                      +{formatMoney(quote.urgentLei, lang)}
                    </span>
                  </div>
                )}
              </div>

              {/* Price Summary */}
              <div className="flex flex-wrap items-end justify-between gap-2 border-t border-line/70 pt-2">
                <div>
                  <span className="block text-xs text-muted">
                    {labels.perTrip.replace(
                      '{price}',
                      formatNumber(quote.perTripLei, lang)
                    )}
                  </span>
                  {quoteLoading && (
                    <span className="text-[11px] text-muted animate-pulse">
                      ...
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-muted sm:text-sm">
                    {labels.total}:
                  </span>
                  <span className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl font-sans">
                    {formatMoney(quote.totalLei, lang)}
                  </span>
                </div>
              </div>
            </>
          )
        ) : null}
      </div>
    </div>
  )
}
