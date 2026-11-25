import { useEffect, useState } from 'react'
import { fmt, useI18n } from '../i18n'
import { SHOP } from '../sections/Contact'

type DriverStatus = {
  isEnRoute: boolean
  arrived?: boolean
  driverName?: string
  etaMinutes?: number | null
  updatedAt?: string
}

const GENERIC_NAMES = new Set(['sofer', 'șofer', 'driver'])

function firstNameOf(raw?: string): string {
  const first = raw?.trim().split(/\s+/)[0] ?? ''
  if (!first || GENERIC_NAMES.has(first.toLowerCase())) return ''
  return first
}

/**
 * Polls GET /api/bookings/:code/driver and renders a live banner when the driver
 * is en route or has marked arrived at the customer's door.
 */
export function DriverStatusBanner({ code, active = true }: { code: string; active?: boolean }) {
  const { t } = useI18n()
  const [status, setStatus] = useState<DriverStatus | null>(null)

  useEffect(() => {
    if (!active || !code) return
    let stopped = false
    const load = async () => {
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(code)}/driver`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as DriverStatus
        if (!stopped) setStatus(data)
      } catch {
        // Keep last known status silently.
      }
    }
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [code, active])

  if (!active || !status?.isEnRoute) return null

  const driverName = firstNameOf(status.driverName)
  const headline = status.arrived
    ? t.track.driverArrived
    : status.etaMinutes != null
      ? fmt(t.track.driverOnWay, { name: driverName, min: Math.max(1, Math.round(status.etaMinutes)) }).replace(/\s{2,}/g, ' ')
      : fmt(t.track.driverOnWayNoEta, { name: driverName }).replace(/\s{2,}/g, ' ')

  return (
    <div
      role="status"
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-3.5 py-2.5 text-[14px] ${
        status.arrived ? 'border-gold bg-gold/10 text-ink' : 'border-ok/40 bg-ok/10 text-ink'
      }`}
    >
      <span className="flex items-center gap-2.5 font-semibold">
        <span className={`size-2.5 shrink-0 rounded-full ${status.arrived ? 'bg-gold' : 'animate-pulse bg-ok'}`} aria-hidden="true" />
        <span>{headline}</span>
      </span>
      <a href={`tel:${SHOP.phone}`} className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]">
        {t.track.callDriver}
      </a>
    </div>
  )
}
