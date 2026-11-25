import { useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { api } from '../auth/api'
import { Guard } from '../auth/Guard'
import { Card, Loading, Notice, PageShell, useDateFormat } from '../auth/ui'
import { useFetch } from '../auth/useFetch'
import type { Role, Viewer } from '../auth/viewer'

type Health = {
  ok: boolean
  mongo: { ok: boolean; ms: number }
  store: string
  environment: string
  mail: string
  slotIndex?: boolean
  google: boolean
  uptimeSeconds: number
  versions: Record<string, string>
}
type EnvVar = { name: string; set: boolean; requiredInProduction: boolean }
type ErrorRow = { at: string; method?: string; path?: string; status?: number; name: string; message: string }
type AuditRow = { at: string; action: string; actor: { id: string; email?: string; role?: string } | null; target?: string; detail?: Record<string, unknown>; ipHash?: string }
type Mail = { id: string; to: string; subject: string; text: string; kind: string; at: string; delivered: string }
type UserRow = { id: string; email: string; name: string; emailVerified: boolean; role: Role; createdAt: string | null }
type Limiter = { name: string; windowMs: number; max: number; allowed: number; blocked: number; tracked: number }

/** /dev: the developer dashboard. Devs only. */
export function DevPage() {
  return (
    <Guard roles={['dev']} wide>
      {(user) => <Dashboard me={user} />}
    </Guard>
  )
}

function Table({ head, children, label }: { head: string[]; children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line" data-lenis-prevent>
      <table aria-label={label} className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
        <thead className="bg-surface-2 text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="display-2 text-2xl">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Dashboard({ me }: { me: Viewer }) {
  const { t } = useI18n()
  const d = t.dev
  const [tick, setTick] = useState(0)

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-2 text-4xl sm:text-5xl">{d.title}</h1>
          <p className="mt-2 text-muted">{d.lead}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setTick(tick + 1)}>
          {d.refresh}
        </button>
      </div>

      <div className="mt-8 grid gap-10">
        <HealthSection tick={tick} />
        <EnvSection tick={tick} />
        <UsersSection tick={tick} me={me} />
        <ErrorsSection tick={tick} />
        <AuditSection tick={tick} />
        <OutboxSection tick={tick} />
        <LimitsSection tick={tick} />
      </div>
    </PageShell>
  )
}

function State({ status, children }: { status: 'loading' | 'ready' | 'error'; children: ReactNode }) {
  const { t } = useI18n()
  if (status === 'loading') return <Loading label={t.account.loading} />
  if (status === 'error') return <Notice tone="error">{t.account.errors.generic}</Notice>
  return <>{children}</>
}

function HealthSection({ tick }: { tick: number }) {
  const { t } = useI18n()
  const h = t.dev.health
  const { status, data } = useFetch<Health>('/api/dev/health', tick)
  const uptime = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min` : `${s} s`)
  return (
    <Section id="dev-health" title={t.dev.sections.health}>
      <State status={status}>
        {data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [h.mongo, data.mongo.ok ? `${h.ok}, ${data.mongo.ms} ms` : h.down, data.mongo.ok],
              [h.store, data.store, true],
              [h.environment, data.environment, true],
              [h.mail, data.mail, data.mail !== 'none'],
              [h.google, data.google ? h.on : h.off, data.google],
              [h.slotIndex, data.slotIndex ? h.on : h.off, data.slotIndex === true],
              [h.uptime, uptime(data.uptimeSeconds), true],
            ].map(([label, value, good]) => (
              <Card key={String(label)} className="!p-4">
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <span className={`size-2 rounded-full ${good ? 'bg-ok' : 'bg-danger'}`} aria-hidden="true" />
                  {String(label)}
                </p>
                <p className="mt-1 text-lg font-bold">{String(value)}</p>
              </Card>
            ))}
            <Card className="!p-4 sm:col-span-2 lg:col-span-4">
              <p className="text-[13px] text-muted">{h.versions}</p>
              <p className="mt-1 font-mono text-[14px]">
                {Object.entries(data.versions)
                  .map(([name, version]) => `${name} ${version}`)
                  .join('  ·  ')}
              </p>
            </Card>
          </div>
        )}
      </State>
    </Section>
  )
}

function EnvSection({ tick }: { tick: number }) {
  const { t } = useI18n()
  const e = t.dev.env
  const { status, data } = useFetch<{ variables: EnvVar[] }>('/api/dev/env', tick)
  return (
    <Section id="dev-env" title={t.dev.sections.env}>
      <State status={status}>
        <Table label={t.dev.sections.env} head={[e.name, e.status, e.needed]}>
          {data?.variables.map((v) => (
            <tr key={v.name} className="border-t border-line">
              <td className="px-3 py-2 font-mono">{v.name}</td>
              <td className={`px-3 py-2 font-semibold ${v.set ? 'text-ok' : 'text-muted'}`}>{v.set ? e.set : e.unset}</td>
              <td className="px-3 py-2 text-muted">{v.requiredInProduction ? '•' : ''}</td>
            </tr>
          ))}
        </Table>
      </State>
    </Section>
  )
}

function UsersSection({ tick, me }: { tick: number; me: Viewer }) {
  const { t } = useI18n()
  const u = t.dev.users
  const fmtDate = useDateFormat()
  const [q, setQ] = useState('')
  const [reload, setReload] = useState(0)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const { status, data } = useFetch<{ total: number; users: UserRow[] }>(`/api/dev/users?limit=100${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`, tick + reload)

  const change = async (user: UserRow, role: Role) => {
    setMessage(null)
    const result = await api(`/api/dev/users/${encodeURIComponent(user.id)}/role`, { method: 'PATCH', body: { role } })
    setMessage(result.ok ? { tone: 'ok', text: u.saved } : { tone: 'error', text: result.status === 400 ? u.self : u.error })
    setReload((n) => n + 1)
  }

  return (
    <Section id="dev-users" title={t.dev.sections.users}>
      <label className="grid max-w-sm gap-1 text-[13px] font-semibold">
        {u.search}
        <input className="field font-normal" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
      </label>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <State status={status}>
        <Table label={t.dev.sections.users} head={[u.email, u.name, u.role, u.verified, u.created]}>
          {data?.users.map((user) => (
            <tr key={user.id} className="border-t border-line">
              <td className="px-3 py-2">{user.email}</td>
              <td className="px-3 py-2">{user.name}</td>
              <td className="px-3 py-2">
                <select
                  className="field !min-h-9 !py-1"
                  aria-label={`${u.role}: ${user.email}`}
                  value={user.role}
                  disabled={user.id === me.id}
                  title={user.id === me.id ? u.self : undefined}
                  onChange={(e) => void change(user, e.target.value as Role)}
                >
                  {(['customer', 'driver', 'technician', 'owner', 'dev'] as const).map((r) => (
                    <option key={r} value={r}>
                      {t.account.roles[r]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">{user.emailVerified ? t.account.profile.verified : t.account.profile.notVerified}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted">{user.createdAt ? fmtDate.date(user.createdAt) : ''}</td>
            </tr>
          ))}
        </Table>
      </State>
    </Section>
  )
}

function ErrorsSection({ tick }: { tick: number }) {
  const { t } = useI18n()
  const e = t.dev.errors
  const fmtDate = useDateFormat()
  const { status, data } = useFetch<{ errors: ErrorRow[] }>('/api/dev/errors', tick)
  return (
    <Section id="dev-errors" title={t.dev.sections.errors}>
      <State status={status}>
        {data?.errors.length === 0 ? (
          <p className="text-muted">{e.empty}</p>
        ) : (
          <Table label={t.dev.sections.errors} head={[e.when, e.where, e.message]}>
            {data?.errors.map((row, i) => (
              <tr key={`${row.at}-${i}`} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate.dateTime(row.at)}</td>
                <td className="px-3 py-2 font-mono">{[row.method, row.path, row.status].filter(Boolean).join(' ')}</td>
                <td className="px-3 py-2 font-mono">
                  {row.name}: {row.message}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </State>
    </Section>
  )
}

function AuditSection({ tick }: { tick: number }) {
  const { t } = useI18n()
  const a = t.dev.audit
  const fmtDate = useDateFormat()
  const { status, data } = useFetch<{ entries: AuditRow[] }>('/api/dev/audit?limit=100', tick)
  return (
    <Section id="dev-audit" title={t.dev.sections.audit}>
      <State status={status}>
        {data?.entries.length === 0 ? (
          <p className="text-muted">{a.empty}</p>
        ) : (
          <Table label={t.dev.sections.audit} head={[a.when, a.action, a.who, a.target, a.detail]}>
            {data?.entries.map((row, i) => (
              <tr key={`${row.at}-${i}`} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate.dateTime(row.at)}</td>
                <td className="px-3 py-2 font-mono">{row.action}</td>
                <td className="px-3 py-2">{row.actor?.email ?? row.actor?.id ?? '-'}</td>
                <td className="px-3 py-2 font-mono">{row.target ?? ''}</td>
                <td className="px-3 py-2 font-mono text-muted">{row.detail ? JSON.stringify(row.detail) : ''}</td>
              </tr>
            ))}
          </Table>
        )}
      </State>
    </Section>
  )
}

function OutboxSection({ tick }: { tick: number }) {
  const { t } = useI18n()
  const o = t.dev.outbox
  const fmtDate = useDateFormat()
  const { status, data, code } = useFetch<{ messages: Mail[] }>('/api/dev/outbox', tick)
  return (
    <Section id="dev-outbox" title={t.dev.sections.outbox}>
      {status === 'error' && code === 404 ? (
        <p className="text-muted">{o.devOnly}</p>
      ) : (
        <State status={status}>
          {data?.messages.length === 0 ? (
            <p className="text-muted">{o.empty}</p>
          ) : (
            <Table label={t.dev.sections.outbox} head={[o.when, o.to, o.subject, o.kind]}>
              {data?.messages.map((m) => (
                <tr key={m.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate.dateTime(m.at)}</td>
                  <td className="px-3 py-2">{m.to}</td>
                  <td className="px-3 py-2">
                    <details>
                      <summary className="cursor-pointer">{m.subject}</summary>
                      <pre className="mt-2 whitespace-pre-wrap font-mono text-muted">{m.text}</pre>
                    </details>
                  </td>
                  <td className="px-3 py-2 font-mono">{m.kind}</td>
                </tr>
              ))}
            </Table>
          )}
        </State>
      )}
    </Section>
  )
}

function LimitsSection({ tick }: { tick: number }) {
  const { t } = useI18n()
  const l = t.dev.limits
  const { status, data } = useFetch<{ limiters: Limiter[] }>('/api/dev/rate-limits', tick)
  return (
    <Section id="dev-limits" title={t.dev.sections.limits}>
      <State status={status}>
        <Table label={t.dev.sections.limits} head={[l.name, l.window, l.max, l.allowed, l.blocked, l.tracked]}>
          {data?.limiters.map((row) => (
            <tr key={row.name} className="border-t border-line">
              <td className="px-3 py-2 font-mono">{row.name}</td>
              <td className="px-3 py-2">{row.windowMs / 1000} s</td>
              <td className="px-3 py-2">{row.max}</td>
              <td className="px-3 py-2">{row.allowed}</td>
              <td className={`px-3 py-2 ${row.blocked > 0 ? 'font-semibold text-gold' : ''}`}>{row.blocked}</td>
              <td className="px-3 py-2">{row.tracked}</td>
            </tr>
          ))}
        </Table>
      </State>
    </Section>
  )
}
