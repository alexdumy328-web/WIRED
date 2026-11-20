import { useState } from 'react'
import { useI18n } from '../i18n'
import { Guard } from '../auth/Guard'
import { BookingDrawer } from '../auth/owner/BookingDrawer'
import { BookingsTab } from '../auth/owner/BookingsTab'
import { CalendarTab } from '../auth/owner/CalendarTab'
import { PickupsTab } from '../auth/owner/PickupsTab'
import { SettingsTab } from '../auth/owner/SettingsTab'
import { StatsTab } from '../auth/owner/StatsTab'
import { PageShell } from '../auth/ui'

const TABS = ['bookings', 'pickups', 'calendar', 'stats', 'settings'] as const
type Tab = (typeof TABS)[number]

/** /admin: the owner dashboard. Owners and devs only. */
export function OwnerPage() {
  return (
    <Guard roles={['owner', 'dev']} wide>
      {() => <Dashboard />}
    </Guard>
  )
}

function Dashboard() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('bookings')
  // The new-booking email links to /admin?cod=NT-XXXX; open that booking once.
  const [linked] = useState(() => {
    const c = new URLSearchParams(window.location.search).get('cod')?.trim().toUpperCase() ?? ''
    return /^NT-[A-Z0-9]{4}$/.test(c) ? c : null
  })
  const [calendarCode, setCalendarCode] = useState<string | null>(null)
  // Bumped when the drawer saves, so the calendar and pickups reload what changed.
  const [version, setVersion] = useState(0)

  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = TABS[(index + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
    setTab(next)
    document.getElementById(`owner-tab-${next}`)?.focus()
  }

  return (
    <PageShell wide>
      <h1 className="display-2 text-4xl sm:text-5xl">{t.owner.title}</h1>
      <p className="mt-2 text-muted">{t.owner.lead}</p>

      <div role="tablist" aria-label={t.owner.title} className="mt-6 flex gap-1 overflow-x-auto border-b border-line" data-lenis-prevent>
        {TABS.map((name, i) => (
          <button
            key={name}
            id={`owner-tab-${name}`}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={`owner-panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 font-semibold transition-colors ${tab === name ? 'border-gold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.owner.tabs[name]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`owner-panel-${tab}`} aria-labelledby={`owner-tab-${tab}`} className="mt-6">
        {tab === 'bookings' && <BookingsTab initialCode={linked} />}
        {tab === 'pickups' && <PickupsTab onOpen={setCalendarCode} version={version} />}
        {tab === 'calendar' && <CalendarTab onOpen={setCalendarCode} version={version} />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
      {calendarCode && <BookingDrawer code={calendarCode} onClose={() => setCalendarCode(null)} onChanged={() => setVersion((v) => v + 1)} />}
    </PageShell>
  )
}
