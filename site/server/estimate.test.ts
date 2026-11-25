import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { createApp, type CreateAppOptions } from './app.ts'
import { labourPrice, rateFor } from '../src/lib/pricing.ts'
import type { Store } from './store.ts'
import type { AiEstimateRequest, BookingRequest } from '../src/types.ts'

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

function estimateRequest(overrides: Partial<AiEstimateRequest> = {}): AiEstimateRequest {
  return {
    lang: 'ro',
    mode: 'shop',
    jobIds: ['laptop-battery'],
    device: { brand: 'Apple', model: 'MacBook Air', year: '2021' },
    issue: 'Battery drains in about an hour after the last system update.',
    ...overrides,
  }
}

type FetchCall = { url: string; init: RequestInit; payload: Record<string, unknown> }

function mockProvider(
  handler: (payload: Record<string, unknown>, call: number) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const payload = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {}
    calls.push({ url: String(input), init: init ?? {}, payload })
    return handler(payload, calls.length)
  }) as typeof fetch
  return { fetchImpl, calls }
}

function modelReply(content: unknown, model = 'mock/model'): Response {
  const message = typeof content === 'string' ? content : JSON.stringify(content)
  return new Response(
    JSON.stringify({ model, choices: [{ message: { role: 'assistant', content: message } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function validModelPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    labourHours: [2, 3],
    fineness: 'micro',
    consumables: 'high',
    parts: [{ name: 'Battery', priceFrom: 200, priceTo: 300 }],
    jobIds: ['laptop-battery'],
    confidence: 'high',
    summary: 'Estimare orientativă pentru înlocuirea bateriei.',
    questions: ['Ce model exact de laptop este?'],
    ...overrides,
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

async function postEstimate(
  base: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}/api/estimate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

function aiOptions(fetchImpl: typeof fetch) {
  return {
    ai: { apiKey: 'test-key', baseUrl: 'https://provider.test/v1', model: 'test/model' },
    aiFetch: fetchImpl,
  }
}

test('estimate is unavailable when AI_API_KEY is not configured', async () => {
  const provider = mockProvider(() => modelReply(validModelPayload()))
  const started = await listen({ ai: { apiKey: null }, aiFetch: provider.fetchImpl })
  try {
    const result = await postEstimate(started.base, estimateRequest())
    assert.equal(result.status, 503)
    assert.deepEqual(result.body, { error: 'ai_unavailable' })
    assert.equal(provider.calls.length, 0)
  } finally {
    await close(started.server)
  }
})

test('estimate rejects a too-short issue with zod issues', async () => {
  const provider = mockProvider(() => modelReply(validModelPayload()))
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const result = await postEstimate(started.base, estimateRequest({ issue: 'scurt' }))
    assert.equal(result.status, 400)
    assert.equal(result.body.error, 'invalid')
    const issues = result.body.issues as Array<{ path: string[] }>
    assert.ok(issues.some((issue) => issue.path.includes('issue')))
    assert.equal(provider.calls.length, 0)
  } finally {
    await close(started.server)
  }
})

test('estimate computes money from pricing.ts and ignores model money fields', async () => {
  const provider = mockProvider(() =>
    modelReply(
      validModelPayload({
        rate: [1, 2],
        labour: [3, 4],
        partsTotal: [5, 6],
        total: [7, 8],
        jobIds: ['laptop-battery', 'made-up-job', 'laptop-battery'],
      }),
      'reported/model',
    ),
  )
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const result = await postEstimate(
      started.base,
      estimateRequest({ deviceValue: 'mid' }),
    )
    assert.equal(result.status, 200)

    const expectedLabour = labourPrice([2, 3], 'micro', 'high', 'mid')
    const expectedRate = rateFor('micro', 'mid')
    assert.deepEqual(result.body.rate, expectedRate)
    assert.deepEqual(result.body.labour, expectedLabour)
    assert.deepEqual(result.body.labourHours, [2, 3])
    assert.deepEqual(result.body.partsTotal, [200, 300])
    assert.deepEqual(result.body.total, [
      expectedLabour[0] + 200,
      expectedLabour[1] + 300,
    ])
    assert.notDeepEqual(result.body.labour, [3, 4])
    assert.notDeepEqual(result.body.total, [7, 8])
    assert.deepEqual(result.body.jobIds, ['laptop-battery'])
    assert.equal(result.body.model, 'reported/model')

    assert.equal(provider.calls.length, 1)
    const call = provider.calls[0]
    assert.equal(call.url, 'https://provider.test/v1/chat/completions')
    assert.equal(call.payload.model, 'test/model')
    assert.equal(call.payload.temperature, 0.2)
    assert.equal(call.payload.max_tokens, 2500)
    assert.deepEqual(call.payload.response_format, { type: 'json_object' })
    assert.deepEqual(call.payload.reasoning, { effort: 'low', exclude: true })

    const headers = call.init.headers as Record<string, string>
    assert.equal(headers.Authorization, 'Bearer test-key')
    assert.equal(headers['X-Title'], 'Norgelis Tech estimate')

    const messages = call.payload.messages as Array<{ role: string; content: string }>
    assert.equal(messages[0].role, 'system')
    assert.match(messages[0].content, /Iași/)
    assert.match(messages[0].content, /laptop-battery/)
    assert.match(messages[1].content, /Battery drains in about an hour/)
  } finally {
    await close(started.server)
  }
})

test('estimate returns 503 on a provider HTTP error', async () => {
  const provider = mockProvider(
    () =>
      new Response(JSON.stringify({ error: { message: 'upstream down' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
  )
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const result = await postEstimate(started.base, estimateRequest())
    assert.equal(result.status, 503)
    assert.deepEqual(result.body, { error: 'ai_unavailable' })
    assert.equal(provider.calls.length, 1)
  } finally {
    await close(started.server)
  }
})

test('estimate retries on invalid model output, then returns 503', async () => {
  const provider = mockProvider(() => modelReply('not json at all'))
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const result = await postEstimate(started.base, estimateRequest())
    assert.equal(result.status, 503)
    assert.deepEqual(result.body, { error: 'ai_unavailable' })
    assert.equal(provider.calls.length, 3)
  } finally {
    await close(started.server)
  }
})

test('estimate drops the reasoning cap, then response_format, when the provider rejects them with 400', async () => {
  const provider = mockProvider((payload) => {
    if (payload.response_format) {
      return new Response(JSON.stringify({ error: { message: 'unsupported' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
    return modelReply(validModelPayload())
  })
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const result = await postEstimate(started.base, estimateRequest())
    assert.equal(result.status, 200)
    assert.equal(provider.calls.length, 3)
    assert.equal('reasoning' in provider.calls[1].payload, false)
    assert.equal('response_format' in provider.calls[2].payload, false)
  } finally {
    await close(started.server)
  }
})

test('estimate swaps reversed labour hours', async () => {
  const provider = mockProvider(() =>
    modelReply(validModelPayload({ labourHours: [3, 1], fineness: 'standard', consumables: 'low' })),
  )
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const result = await postEstimate(started.base, estimateRequest({ deviceValue: 'high' }))
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.labourHours, [1, 3])
    assert.deepEqual(result.body.labour, labourPrice([1, 3], 'standard', 'low', 'high'))
  } finally {
    await close(started.server)
  }
})

test('estimate filters unknown job ids from the model output', async () => {
  const provider = mockProvider(() =>
    modelReply(validModelPayload({ jobIds: ['ghost-job', 'board-console', 'laptop-battery'] })),
  )
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const result = await postEstimate(started.base, estimateRequest())
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.jobIds, ['board-console', 'laptop-battery'])
  } finally {
    await close(started.server)
  }
})

test('estimate has its own rate limit', async () => {
  const provider = mockProvider(() => modelReply(validModelPayload()))
  const started = await listen({
    ...aiOptions(provider.fetchImpl),
    estimateRateLimit: { max: 2, windowMs: 60_000 },
  })
  try {
    const first = await postEstimate(started.base, estimateRequest())
    const second = await postEstimate(started.base, estimateRequest())
    const third = await postEstimate(started.base, estimateRequest())
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(third.status, 429)
    assert.deepEqual(third.body, { error: 'rate_limited' })
  } finally {
    await close(started.server)
  }
})

test('identical estimates are served from the cache without a second provider call', async () => {
  const provider = mockProvider(() => modelReply(validModelPayload()))
  const started = await listen(aiOptions(provider.fetchImpl))
  try {
    const first = await postEstimate(started.base, estimateRequest())
    const second = await postEstimate(started.base, estimateRequest())
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.deepEqual(second.body, first.body)
    assert.equal(provider.calls.length, 1)
  } finally {
    await close(started.server)
  }
})

test('bookings accept deviceValue and a stored aiEstimate', async () => {
  const started = await listen()
  try {
    const booking: BookingRequest = {
      mode: 'shop',
      jobIds: ['laptop-battery'],
      device: { brand: 'Apple', model: 'MacBook Air', year: '2021' },
      deviceValue: 'mid',
      issue: 'Battery drains very fast after the last system update.',
      aiEstimate: {
        labourHours: [1, 2],
        fineness: 'fine',
        consumables: 'medium',
        rate: [150, 150],
        labour: [200, 360],
        parts: [{ name: 'Battery', priceFrom: 200, priceTo: 300 }],
        partsTotal: [200, 300],
        total: [400, 660],
        confidence: 'medium',
        summary: 'O baterie nouă este probabil necesară.',
        questions: [],
        model: 'test/model',
      },
      slot: SLOT,
      contact: { name: 'Andrei Popescu', phone: '+40 721 123 456' },
      estimate: { priceFrom: 150, priceTo: 300, etaHours: [2, 4] },
      lang: 'ro',
    }

    const response = await fetch(`${started.base}/api/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(booking),
    })
    assert.equal(response.status, 201)

    const oversized = await fetch(`${started.base}/api/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...booking,
        aiEstimate: { ...booking.aiEstimate, summary: 'x'.repeat(400) },
      }),
    })
    assert.equal(oversized.status, 400)
  } finally {
    await close(started.server)
  }
})
