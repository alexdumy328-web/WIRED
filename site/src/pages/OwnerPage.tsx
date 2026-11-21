import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { useI18n } from '../i18n'
import { Guard } from '../auth/Guard'
import { BookingsTab } from '../auth/owner/BookingsTab'
import { CalendarTab } from '../auth/owner/CalendarTab'
import { CustomersTab } from '../auth/owner/CustomersTab'
import { PickupsTab } from '../auth/owner/PickupsTab'
import { SettingsTab } from '../auth/owner/SettingsTab'
import { StatsTab } from '../auth/owner/StatsTab'
import { TodayTab } from '../auth/owner/TodayTab'
import { WalkInDialog } from '../auth/owner/WalkInDialog'
import { WarrantiesTab } from '../auth/owner/WarrantiesTab'
import { WorkOrderDrawer } from '../auth/owner/WorkOrderDrawer'
import { ChartIcon, ListIcon, PlusIcon, ShieldIcon, SlidersIcon, TodayIcon, UsersIcon, VanIcon, WeekIcon } from '../auth/owner/icons'
import { shopDate } from '../auth/owner/types'
import { useBusy } from '../auth/owner/useBusy'
import { useWorkshopCopy } from '../auth/owner/workshop/copy'
import { PageShell } from '../auth/ui'
import { isManager, type Viewer } from '../auth/viewer'
import { MonthCalendar } from '../components/MonthCalendar'
import type { Customer } from '../types'

const ALL_TABS = ['today', 'bookings', 'customers', 'pickups', 'calendar', 'warranties', 'stats', 'settings'] as const
type Tab = (typeof ALL_TABS)[number]
/** Money, numbers and settings stay with owners; technicians get the workshop. */
const MANAGER_ONLY: Tab[] = ['stats', 'settings']
const ICONS: Record<Tab, ComponentType<{ className?: string }>> = {
  today: TodayIcon,
  bookings: ListIcon,
  customers: UsersIcon,
  pickups: VanIcon,
  calendar: WeekIcon,
  warranties: ShieldIcon,
  stats: ChartIcon,
  settings: SlidersIcon,
}

/** /admin: the workshop dashboard. Technicians, owners and devs. */
export function OwnerPage() {
  return (
    <Guard roles={['technician', 'owner', 'dev']} wide>
      {(user) => <Dashboard user={user} />}
    </Guard>
  )
}

function Dashboard({ user }: { user: Viewer }) {
  const { t, lang } = useI18n()
  const c = useWorkshopCopy()
  const manager = isManager(user)
  const TABS = ALL_TABS.filter((name) => manager || !MANAGER_ONLY.includes(name))
  // The new-booking email links to /admin?cod=NT-XXXX; open that job once.
  const [linked] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('cod')?.trim().toUpperCase() ?? ''
    return /^NT-[A-Z0-9]{4}$/.test(code) ? code : null
  })
  const [tab, setTab] = useState<Tab>(linked ? 'bookings' : 'today')
  const [drawerCode, setDrawerCode] = useState<string | null>(linked)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [walkIn, setWalkIn] = useState<{ preset: Customer | null } | null>(null)
  // Bumped when the drawer saves, so every view reloads what changed.
  const [version, setVersion] = useState(0)
  const today = shopDate()
  const [anchor, setAnchor] = useState(today)
  const busy = useBusy(version)

  // Phones: the tab strip scrolls sideways; keep the open tab in sight.
  useEffect(() => {
    document.getElementById(`owner-tab-${tab}`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [tab])

  const changed = useCallback(() => setVersion((v) => v + 1), [])
  const closeDrawer = useCallback(() => setDrawerCode(null), [])
  const closeWalkIn = useCallback(() => setWalkIn(null), [])
  const label = (name: Tab) => (name === 'customers' || name === 'warranties' ? c.tabs[name] : t.owner.tabs[name])

  const go = (next: Tab) => {
    setTab(next)
    document.getElementById(`owner-tab-${next}`)?.focus()
  }
  const onKey = (e: React.KeyboardEvent, index: number) => {
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown'
    if (!back && !fwd) return
    e.preventDefault()
    go(TABS[(index + (fwd ? 1 : TABS.length - 1)) % TABS.length]!)
  }

  const longToday = new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' }).format(new Date())
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/Bucharest' }).format(new Date()))
  const greeting = t.owner.today.greeting[hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening']

  return (
    <PageShell wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div
            role="tablist"
            aria-label={t.owner.title}
            aria-orientation="vertical"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0"
            data-lenis-prevent
          >
            {TABS.map((name, i) => {
              const Icon = ICONS[name]
              const on = tab === name
              return (
                <button
                  key={name}
                  id={`owner-tab-${name}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="owner-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setTab(name)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={`group relative flex shrink-0 items-center gap-2.5 rounded-full border px-3.5 py-2 text-[15px] font-semibold transition-colors lg:rounded-[12px] lg:border-0 lg:px-3 lg:py-2.5 ${
                    on ? 'border-ink bg-ink text-bg lg:bg-surface lg:text-ink lg:shadow-[inset_0_0_0_1px_var(--line)]' : 'border-line text-muted hover:text-ink lg:hover:bg-surface/60'
                  }`}
                >
                  {on && <span className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-gold lg:block" aria-hidden="true" />}
                  <Icon className={`size-[18px] ${on ? 'lg:text-gold' : ''}`} />
                  {label(name)}
                </button>
              )
            })}
          </div>

          <div className="mt-6 hidden rounded-[18px] border border-line bg-surface p-3.5 lg:block">
            <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-muted">{t.owner.jump}</p>
            <MonthCalendar
              lang={lang}
              today={today}
              label={t.owner.jump}
              value={tab === 'calendar' ? anchor : null}
              mode={tab === 'calendar' ? 'week' : 'single'}
              marks={busy.marks}
              onView={busy.load}
              onSelect={(d) => {
                setAnchor(d)
                setTab('calendar')
              }}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-muted first-letter:uppercase">{longToday}</p>
              <h1 className="display-2 mt-1 text-[clamp(2rem,3.4vw,2.75rem)]">{tab === 'today' ? greeting : label(tab)}</h1>
            </div>
            {/* The counter's main action: a device walks in. */}
            <button type="button" className="btn btn-gold gap-2" onClick={() => setWalkIn({ preset: null })}>
              <PlusIcon className="size-[18px]" />
              {c.newSheet}
            </button>
          </header>

          <div role="tabpanel" id="owner-panel" aria-labelledby={`owner-tab-${tab}`}>
            {tab === 'today' && <TodayTab onOpen={setDrawerCode} version={version} onGo={(next) => setTab(next)} />}
            {tab === 'bookings' && <BookingsTab version={version} onOpen={setDrawerCode} />}
            {tab === 'customers' && (
              <CustomersTab selected={customerId} onSelect={setCustomerId} onOpen={setDrawerCode} onNewSheet={(preset) => setWalkIn({ preset })} manager={manager} version={version} />
            )}
            {tab === 'warranties' && <WarrantiesTab onOpen={setDrawerCode} version={version} />}
            {tab === 'pickups' && <PickupsTab onOpen={setDrawerCode} version={version} />}
            {tab === 'calendar' && <CalendarTab onOpen={setDrawerCode} version={version} anchor={anchor} onAnchor={setAnchor} />}
            {tab === 'stats' && manager && <StatsTab />}
            {tab === 'settings' && manager && <SettingsTab />}
          </div>
        </div>
      </div>
      {drawerCode && (
        <WorkOrderDrawer
          code={drawerCode}
          manager={manager}
          onClose={closeDrawer}
          onChanged={changed}
          onCustomer={(id) => {
            setDrawerCode(null)
            setCustomerId(id)
            setTab('customers')
          }}
        />
      )}
      {walkIn && (
        <WalkInDialog
          preset={walkIn.preset}
          onClose={closeWalkIn}
          onCreated={(booking) => {
            setWalkIn(null)
            changed()
            setDrawerCode(booking.code)
          }}
        />
      )}
    </PageShell>
  )
}
