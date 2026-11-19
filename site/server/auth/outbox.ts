import type { Db } from 'mongodb'
import { describeError, maskEmail } from '../security/scrub.ts'

export type Mail = {
  to: string
  subject: string
  text: string
  /** What the message is for, e.g. "otp:sign-in". Shown in the dev dashboard. */
  kind: string
}

export type OutboxItem = Mail & { id: string; at: string; delivered: 'sent' | 'stored' | 'failed' }

export type Mailer = {
  readonly provider: 'resend' | 'outbox' | 'none'
  /** Sends one message. Throws MailUnavailableError when nothing can deliver it. */
  send(mail: Mail): Promise<void>
  /** Latest dev outbox messages (empty in production). */
  list(limit?: number): Promise<OutboxItem[]>
}

export class MailUnavailableError extends Error {
  constructor() {
    super('mail_unavailable')
    this.name = 'MailUnavailableError'
  }
}

export type MailerOptions = {
  db: Db | null
  env: Record<string, string | undefined>
  production: boolean
  fetchImpl?: typeof fetch
  /** Silence console output (tests). */
  quiet?: boolean
}

const OUTBOX = 'dev_outbox'
const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Email through the Resend HTTP API when RESEND_API_KEY and MAIL_FROM are set. Without a
 * provider, development stores messages in the `dev_outbox` collection (TTL 1 h) and logs a
 * masked line; production answers with MailUnavailableError (HTTP 503). In development every
 * message is also copied to the outbox so the dev dashboard can show it.
 */
export function createMailer(options: MailerOptions): Mailer {
  const apiKey = options.env.RESEND_API_KEY?.trim()
  const from = options.env.MAIL_FROM?.trim()
  const configured = Boolean(apiKey && from)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const log = (line: string) => {
    if (!options.quiet) console.log(line)
  }
  let indexReady: Promise<unknown> | null = null

  async function store(mail: Mail, delivered: OutboxItem['delivered']): Promise<void> {
    if (!options.db) return
    const collection = options.db.collection(OUTBOX)
    indexReady ??= collection.createIndex({ at: 1 }, { expireAfterSeconds: 3600, name: 'ttl_1h' }).catch(() => undefined)
    await indexReady
    await collection.insertOne({ ...mail, at: new Date(), delivered })
  }

  async function viaResend(mail: Mail): Promise<boolean> {
    try {
      const response = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) log(`[mail] provider answered ${response.status} for ${maskEmail(mail.to)} (${mail.kind})`)
      return response.ok
    } catch (error) {
      log(`[mail] provider error for ${maskEmail(mail.to)}: ${describeError(error).message.slice(0, 120)}`)
      return false
    }
  }

  return {
    provider: configured ? 'resend' : options.production ? 'none' : 'outbox',

    async send(mail) {
      if (options.production) {
        if (!configured) throw new MailUnavailableError()
        if (!(await viaResend(mail))) throw new MailUnavailableError()
        return
      }
      // Development: the outbox always gets a copy; the provider is a bonus when configured.
      const delivered = configured ? ((await viaResend(mail)) ? 'sent' : 'failed') : 'stored'
      await store(mail, delivered)
      log(`[mail] ${mail.kind} to ${maskEmail(mail.to)} (${delivered}, see dev outbox)`)
    },

    async list(limit = 50) {
      if (options.production || !options.db) return []
      const docs = await options.db.collection(OUTBOX).find({}).sort({ at: -1 }).limit(Math.min(limit, 200)).toArray()
      return docs.map((doc) => ({
        id: String(doc._id),
        to: String(doc.to),
        subject: String(doc.subject),
        text: String(doc.text),
        kind: String(doc.kind),
        at: new Date(doc.at as Date).toISOString(),
        delivered: doc.delivered as OutboxItem['delivered'],
      }))
    },
  }
}
