import { useEffect, useState } from 'react'
import { fmt, useI18n } from '../i18n'
import { closingTime, isOpenAt, nextOpening } from '../lib/hours'

const tz = 'Europe/Bucharest'

export function OpenStatus({ className = '' }: { className?: string }) {
  const { t, lang } = useI18n()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const locale = lang === 'ro' ? 'ro-RO' : 'en-GB'
  const time = (d: Date) => new Intl.DateTimeFormat(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)
  const day = (d: Date) => new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'long' }).format(d)
  const open = isOpenAt(now)
  let label: string
  if (open) {
    const c = closingTime(now)
    label = fmt(t.status.openNow, { time: c ? time(c) : '' })
  } else {
    const n = nextOpening(now)
    label = fmt(t.status.closedNow, { day: day(n), time: time(n) })
  }
  return (
    <span className={`items-center gap-2 whitespace-nowrap text-sm text-muted ${className || 'inline-flex'}`}>
      <span className="relative flex size-2">
        {open && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:hidden" />}
        <span className={`relative inline-flex size-2 rounded-full ${open ? 'bg-ok' : 'bg-muted'}`} />
      </span>
      {label}
    </span>
  )
}
