import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { AdminHeader, Header } from '../components/Header'
import { usePath } from '../lib/router'
import type { BookingStatus } from '../types'

/** Page frame for /cont, /admin and /dev: the site header and a centred column. */
export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  // The dashboards get their own work-tool bar instead of the customer site header.
  const admin = /^\/(admin|dev)(\/|$)/.test(usePath())
  return (
    <>
      {admin ? <AdminHeader /> : <Header />}
      <main id="main" className={`mx-auto min-h-dvh px-4 pb-24 pt-24 sm:px-6 ${wide ? 'max-w-[1360px]' : 'max-w-[1080px]'}`}>
        {children}
      </main>
    </>
  )
}

/** Label, control and error, linked for screen readers. */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode }) {
  const id = useId()
  const note = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}
      </label>
      {children({ id, 'aria-describedby': note, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'ok' | 'error' | 'info'; children: ReactNode }) {
  const color = tone === 'error' ? 'border-danger text-danger' : tone === 'ok' ? 'border-ok text-ok' : 'border-line text-muted'
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[10px] border px-3.5 py-2.5 text-[14px] ${color}`}>
      {children}
    </p>
  )
}

/** Status dot per stage. Violet and rose are kept for statuses; gold, green and blue mean the kind of job. */
export const STATUS_DOT: Record<BookingStatus, string> = {
  received: 'bg-muted',
  diagnosis: 'border-2 border-violet',
  'waiting-parts': 'bg-rose',
  repairing: 'bg-violet',
  ready: 'bg-ok',
  unrepairable: 'border-2 border-rose',
  done: 'bg-ink/40',
  cancelled: 'border border-muted',
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useI18n()
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 text-[13px] font-semibold">
      <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {t.track.statuses[status]}
    </span>
  )
}

export function useDateFormat() {
  const { lang } = useI18n()
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const opts = { timeZone: 'Europe/Bucharest' } as const
  return {
    dateTime: (iso: string) => new Intl.DateTimeFormat(locale, { ...opts, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
    date: (iso: string) => new Intl.DateTimeFormat(locale, { ...opts, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)),
    time: (iso: string) => new Intl.DateTimeFormat(locale, { ...opts, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),
    weekday: (date: string) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`)),
  }
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[18px] border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>
}

export function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="py-10 text-center text-muted">
      {label}
    </p>
  )
}
