import { existsSync } from 'node:fs'
import path from 'node:path'
import { createApp } from './app.ts'
import { createStoreFromEnv } from './store.ts'

const rawPort = process.env.PORT ?? '8787'
const port = Number(rawPort)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${rawPort}`)
}

const store = await createStoreFromEnv()
await store.init()

const distDir = path.join(import.meta.dirname, '..', 'dist')
const serveStatic = process.env.SERVE_STATIC === '1' && existsSync(path.join(distDir, 'index.html'))

const app = createApp(store, { distDir: serveStatic ? distDir : undefined })

const server = app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port} (store: ${store.kind})`)
  if (serveStatic) console.log(`[api] serving static build from ${distDir}`)
  if (!process.env.ADMIN_TOKEN) console.log('[api] ADMIN_TOKEN is unset: status updates are disabled')
})

let closing = false
async function shutdown(signal: string): Promise<void> {
  if (closing) return
  closing = true
  console.log(`[api] ${signal} received, shutting down`)
  server.close()
  server.closeAllConnections()
  await store.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
