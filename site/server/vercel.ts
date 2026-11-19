/**
 * Vercel Function entry. Bundled by scripts/vercel-build.mjs into
 * .vercel/output/functions/api.func/index.mjs.
 *
 * Production needs MONGODB_URI: Vercel's filesystem is read-only apart from /tmp,
 * and /tmp is per-instance, so the file store there only suits a preview demo.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createApp } from './app.ts'
import { createPlatform } from './platform.ts'
import { FileStore, MongoStore, DEFAULT_DB_NAME, type Store } from './store.ts'

let ready: Promise<ReturnType<typeof createApp>> | null = null

function boot() {
  ready ??= (async () => {
    const uri = process.env.MONGODB_URI?.trim()
    const store: Store = uri ? new MongoStore(uri, process.env.MONGODB_DB?.trim() || DEFAULT_DB_NAME) : new FileStore('/tmp/norgelis')
    if (!uri) console.warn('[api] MONGODB_URI is unset: bookings live in /tmp and disappear when the instance recycles')
    await store.init()
    // Behind Vercel's proxy, trust X-Forwarded-For so the rate limit sees the client IP.
    const platform = store instanceof MongoStore ? await createPlatform({ db: store.getDb(), storeKind: store.kind }) : undefined
    const app = createApp(store, { platform })
    app.set('trust proxy', true)
    return app
  })().catch((err) => {
    ready = null // retry on the next request instead of caching the failure
    throw err
  })
  return ready
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // config.json rewrites /api/<path> to /api?__path=<path>; restore the original URL for Express.
  const url = new URL(req.url ?? '/', 'http://local')
  const p = url.searchParams.get('__path')
  if (p !== null) {
    url.searchParams.delete('__path')
    const qs = url.searchParams.toString()
    req.url = `/api/${p}${qs ? `?${qs}` : ''}`
  }
  try {
    const app = await boot()
    app(req as never, res as never)
  } catch (err) {
    console.error('[api] boot failed', err)
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'unavailable' }))
  }
}
