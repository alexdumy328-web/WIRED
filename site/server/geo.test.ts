import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { createApp, type CreateAppOptions } from './app.ts'
import { SHOP, PICKUP_DEFAULTS, haversineKm, quotePickup } from '../src/lib/pickup.ts'
import type { Store } from './store.ts'
import type { BookingRequest } from '../src/types.ts'

const store: Store = {
  kind: 'file',
  async init() {},
  async close() {},
  async insertBooking() {
    return true
  },
  async findByCode() {
    return null
  },
  async hasSlot() {
    return false
  },
  async takenSlots() {
    return []
  },
  async listActive() {
    return []
  },
  async updateStatus() {
    return null
  },
}

const SLOT = '2030-06-03T09:00:00.000Z'
const RATES = { ...PICKUP_DEFAULTS }

type Call = { url: string; init: RequestInit }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function mockUpstream(
  handler: (url: string) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return handler(url)
  }) as typeof fetch
  return { fetchImpl, calls }
}

function photonSearchBody(): unknown {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [27.6014, 47.1585] },
        properties: {
          name: 'Palas',
          street: 'Str. Palas',
          housenumber: '7A',
          city: 'Iași',
          county: 'Iași',
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [27.57, 47.17] },
        properties: { name: 'Gara', city: 'Iași', county: 'Iași' },
      },
    ],
  }
}

function photonReverseBody(city = 'Iași'): unknown {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [27.6, 47.16] },
        properties: {
          street: 'Str. Palas',
          housenumber: '7A',
          city,
          county: 'Iași',
        },
      },
    ],
  }
}

function osrmBody(distance = 5000, duration = 600): unknown {
  return {
    code: 'Ok',
    routes: [
      {
        distance,
        duration,
        geometry: {
          type: 'LineString',
          coordinates: [
            [27.558417, 47.166015],
            [27.6, 47.16],
          ],
        },
      },
    ],
  }
}

async function listen(options: CreateAppOptions = {}): Promise<{ server: Server; base: string }> {
  const app = createApp(store, { adminToken: null, rateLimit: { max: 1000 }, ...options })
  const instance = app.listen(0)
  await once(instance, 'listening')
  const address = instance.address() as AddressInfo
  return { server: instance, base: `http://127.0.0.1:${address.port}` }
}

async function close(instance: Server): Promise<void> {
  instance.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()))
  })
}

async function getJson(
  url: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url)
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

test('geo search maps Photon features to short labels', async () => {
  const upstream = mockUpstream(() => jsonResponse(photonSearchBody()))
  const started = await listen({ upstreamFetch: upstream.fetchImpl })
  try {
    const result = await getJson(`${started.base}/api/geo/search?q=Palas&lang=ro`)
    assert.equal(result.status, 200)
    const results = result.body.results as Array<Record<string, unknown>>
    assert.equal(results.length, 2)
    assert.deepEqual(results[0], {
      label: 'Str. Palas 7A, Iași, Iași',
      lat: 47.1585,
      lon: 27.6014,
      city: 'Iași',
    })
    assert.equal(results[1].label, 'Gara, Iași, Iași')

    const call = upstream.calls[0]
    const url = new URL(call.url)
    assert.equal(url.origin + url.pathname, 'https://photon.komoot.io/api/')
    assert.equal(url.searchParams.get('q'), 'Palas')
    assert.equal(url.searchParams.get('limit'), '6')
    assert.equal(url.searchParams.get('lang'), 'ro')
    assert.equal(url.searchParams.get('lat'), '47.16')
    assert.equal(url.searchParams.get('lon'), '27.59')
    assert.equal(url.searchParams.get('bbox'), '20.2,43.6,29.7,48.3')

    const headers = call.init.headers as Record<string, string>
    assert.equal(headers['User-Agent'], 'NorgelisTech-site/1.0')
  } finally {
    await close(started.server)
  }
})

test('geo search validates q and reports upstream failure', async () => {
  const upstream = mockUpstream(() => jsonResponse({ error: 'down' }, 500))
  const started = await listen({ upstreamFetch: upstream.fetchImpl })
  try {
    const short = await getJson(`${started.base}/api/geo/search?q=ab&lang=ro`)
    assert.equal(short.status, 400)

    const unavailable = await getJson(`${started.base}/api/geo/search?q=Palas&lang=ro`)
    assert.equal(unavailable.status, 502)
    assert.deepEqual(unavailable.body, { error: 'geo_unavailable' })
  } finally {
    await close(started.server)
  }
})

test('geo reverse returns a label and city', async () => {
  const upstream = mockUpstream(() => jsonResponse(photonReverseBody('Iasi')))
  const started = await listen({ upstreamFetch: upstream.fetchImpl })
  try {
    const result = await getJson(`${started.base}/api/geo/reverse?lat=47.16&lon=27.6`)
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, {
      label: 'Str. Palas 7A, Iasi, Iași',
      lat: 47.16,
      lon: 27.6,
      city: 'Iasi',
    })
  } finally {
    await close(started.server)
  }
})

test('pickup quote uses OSRM distance and duration with quotePickup', async () => {
  const upstream = mockUpstream((url) => {
    if (url.startsWith('https://photon.komoot.io/reverse')) {
      return jsonResponse(photonReverseBody('Iași'))
    }
    return jsonResponse(osrmBody(5000, 600))
  })
  const started = await listen({ upstreamFetch: upstream.fetchImpl, pickupRates: RATES })
  try {
    const result = await getJson(
      `${started.base}/api/pickup/quote?lat=47.16&lon=27.6&trips=both`,
    )
    assert.equal(result.status, 200)

    const expected = quotePickup(5, 10, 'both', true, RATES)
    assert.equal(result.body.totalLei, expected.totalLei)
    assert.equal(result.body.oneWayKm, 5)
    assert.equal(result.body.oneWayMin, 10)
    assert.equal(result.body.insideIasi, true)
    assert.equal(result.body.routed, true)
    assert.deepEqual(result.body.geometry, [
      [47.166015, 27.558417],
      [47.16, 27.6],
    ])

    const osrmCall = upstream.calls.find((call) =>
      call.url.startsWith('https://router.project-osrm.org/'),
    )
    assert.ok(osrmCall)
    const osrmUrl = new URL(osrmCall.url)
    assert.equal(
      osrmUrl.pathname,
      '/route/v1/driving/27.558417,47.166015;27.6,47.16',
    )
    assert.equal(osrmUrl.searchParams.get('overview'), 'simplified')
    assert.equal(osrmUrl.searchParams.get('geometries'), 'geojson')
    const headers = osrmCall.init.headers as Record<string, string>
    assert.equal(headers['User-Agent'], 'NorgelisTech-site/1.0')
  } finally {
    await close(started.server)
  }
})

test('pickup quote applies the urgent factor when urgent=1', async () => {
  const upstream = mockUpstream((url) => {
    if (url.startsWith('https://photon.komoot.io/reverse')) {
      return jsonResponse(photonReverseBody('Iași'))
    }
    return jsonResponse(osrmBody(5000, 600))
  })
  const started = await listen({ upstreamFetch: upstream.fetchImpl, pickupRates: RATES })
  try {
    const normal = await getJson(
      `${started.base}/api/pickup/quote?lat=47.16&lon=27.6&trips=both`,
    )
    const urgent = await getJson(
      `${started.base}/api/pickup/quote?lat=47.16&lon=27.6&trips=both&urgent=1`,
    )
    const notUrgent = await getJson(
      `${started.base}/api/pickup/quote?lat=47.16&lon=27.6&trips=both&urgent=0`,
    )

    assert.equal(normal.status, 200)
    assert.equal(urgent.status, 200)
    assert.equal(notUrgent.status, 200)
    assert.equal(normal.body.urgent, false)
    assert.equal(urgent.body.urgent, true)
    assert.equal(notUrgent.body.urgent, false)

    const normalPerTrip = normal.body.perTripLei as number
    const urgentPerTrip = urgent.body.perTripLei as number
    assert.equal(urgentPerTrip, Math.round((normalPerTrip * 1.5) / 5) * 5)

    // urgent is part of the route cache key, so it is a separate OSRM lookup.
    const routeCalls = upstream.calls.filter((call) =>
      call.url.startsWith('https://router.project-osrm.org/'),
    )
    assert.equal(routeCalls.length, 2)
  } finally {
    await close(started.server)
  }
})

test('pickup quote falls back to haversine when OSRM fails', async () => {
  const upstream = mockUpstream((url) => {
    if (url.startsWith('https://photon.komoot.io/reverse')) {
      return jsonResponse(photonReverseBody('Iași'))
    }
    return jsonResponse({ error: 'osrm down' }, 503)
  })
  const started = await listen({ upstreamFetch: upstream.fetchImpl, pickupRates: RATES })
  try {
    const result = await getJson(
      `${started.base}/api/pickup/quote?lat=47.16&lon=27.6&trips=pickup`,
    )
    assert.equal(result.status, 200)

    const fallbackKm = haversineKm(SHOP, { lat: 47.16, lon: 27.6 }) * 1.3
    const expected = quotePickup(fallbackKm, fallbackKm * 2, 'pickup', true, RATES)
    assert.equal(result.body.totalLei, expected.totalLei)
    assert.equal(result.body.oneWayKm, expected.oneWayKm)
    assert.equal(result.body.routed, false)
    assert.equal(result.body.geometry, null)
  } finally {
    await close(started.server)
  }
})

test('pickup quote rejects coordinates outside Romania and bad trips', async () => {
  const upstream = mockUpstream(() => jsonResponse(photonReverseBody()))
  const started = await listen({ upstreamFetch: upstream.fetchImpl, pickupRates: RATES })
  try {
    const outside = await getJson(`${started.base}/api/pickup/quote?lat=48.85&lon=2.35`)
    assert.equal(outside.status, 400)

    const badTrips = await getJson(
      `${started.base}/api/pickup/quote?lat=47.16&lon=27.6&trips=roundtrip`,
    )
    assert.equal(badTrips.status, 400)

    const badNumber = await getJson(`${started.base}/api/pickup/quote?lat=abc&lon=27.6`)
    assert.equal(badNumber.status, 400)
    assert.equal(upstream.calls.length, 0)
  } finally {
    await close(started.server)
  }
})

test('geo search and pickup route caches prevent repeat upstream calls', async () => {
  const upstream = mockUpstream((url) => {
    if (url.startsWith('https://photon.komoot.io/api/')) {
      return jsonResponse(photonSearchBody())
    }
    if (url.startsWith('https://photon.komoot.io/reverse')) {
      return jsonResponse(photonReverseBody('Iași'))
    }
    return jsonResponse(osrmBody())
  })
  const started = await listen({ upstreamFetch: upstream.fetchImpl, pickupRates: RATES })
  try {
    const firstSearch = await getJson(`${started.base}/api/geo/search?q=Palas&lang=ro`)
    const secondSearch = await getJson(`${started.base}/api/geo/search?q=Palas&lang=ro`)
    assert.equal(firstSearch.status, 200)
    assert.deepEqual(secondSearch.body, firstSearch.body)

    const firstQuote = await getJson(
      `${started.base}/api/pickup/quote?lat=47.16&lon=27.6&trips=both`,
    )
    const secondQuote = await getJson(
      `${started.base}/api/pickup/quote?lat=47.1600001&lon=27.6000001&trips=both`,
    )
    assert.equal(firstQuote.status, 200)
    assert.deepEqual(secondQuote.body, firstQuote.body)

    const searchCalls = upstream.calls.filter((call) =>
      call.url.startsWith('https://photon.komoot.io/api/'),
    )
    const routeCalls = upstream.calls.filter((call) =>
      call.url.startsWith('https://router.project-osrm.org/'),
    )
    assert.equal(searchCalls.length, 1)
    assert.equal(routeCalls.length, 1)
  } finally {
    await close(started.server)
  }
})

test('geo and pickup routes are rate limited per IP', async () => {
  const upstream = mockUpstream(() => jsonResponse(photonSearchBody()))
  const started = await listen({
    upstreamFetch: upstream.fetchImpl,
    upstreamRateLimit: { max: 2, windowMs: 60_000 },
  })
  try {
    const first = await getJson(`${started.base}/api/geo/search?q=Palas&lang=ro`)
    const second = await getJson(`${started.base}/api/geo/search?q=Palas&lang=ro`)
    const third = await getJson(`${started.base}/api/geo/search?q=Palas&lang=ro`)
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(third.status, 429)
    assert.deepEqual(third.body, { error: 'rate_limited' })
  } finally {
    await close(started.server)
  }
})

function booking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    mode: 'shop',
    jobIds: ['laptop-battery'],
    device: { brand: 'Apple', model: 'MacBook Air', year: '2021' },
    issue: 'Battery drains very fast after the last system update.',
    slot: SLOT,
    contact: { name: 'Andrei Popescu', phone: '+40 721 123 456' },
    estimate: { priceFrom: 150, priceTo: 300, etaHours: [2, 4] },
    lang: 'ro',
    ...overrides,
  }
}

test('bookings reject pickup on mobile and accept it on shop', async () => {
  const started = await listen()
  try {
    const mobile = await fetch(`${started.base}/api/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...booking({ mode: 'mobile', location: 'Str. Palas 7A, Iași' }),
        pickup: {
          address: 'Str. Palas 7A, Iași',
          lat: 47.1585,
          lon: 27.6014,
          trips: 'both',
          quote: { totalLei: 120, oneWayKm: 5 },
        },
      }),
    })
    assert.equal(mobile.status, 400)
    const mobileBody = (await mobile.json()) as { issues?: Array<{ path: string[] }> }
    assert.ok(mobileBody.issues?.some((issue) => issue.path.includes('pickup')))

    const shop = await fetch(`${started.base}/api/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...booking(),
        pickup: {
          address: 'Str. Palas 7A, Iași',
          lat: 47.1585,
          lon: 27.6014,
          trips: 'both',
          urgent: true,
          quote: { totalLei: 120, oneWayKm: 5, urgentLei: 20 },
        },
      }),
    })
    assert.equal(shop.status, 201)
  } finally {
    await close(started.server)
  }
})
