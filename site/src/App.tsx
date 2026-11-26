import { lazy, Suspense, useEffect, useState } from 'react'
import Lenis from 'lenis'
import { I18nProvider, useI18n } from './i18n'
import { ThemeProvider, useReducedMotion } from './lib/theme'
import { Header } from './components/Header'
import { TraceField } from './components/TraceField'
import { BookingCta } from './sections/BookingCta'
import { setLenis } from './lib/scroll'
import { useHeroSnap } from './lib/hero-snap'
import { SectionRail } from './components/SectionRail'
import { ActionBar } from './components/ActionBar'
import { CookieConsent } from './components/CookieConsent'
import { pageOf, usePath } from './lib/router'
import { LegalPage } from './pages/LegalPage'
import { Hero } from './sections/Hero'
import { Services } from './sections/Services'
import { Mobile } from './sections/Mobile'
import { Process } from './sections/Process'
import { Status } from './sections/Status'
import { Reviews } from './sections/Reviews'
import { Booking } from './sections/Booking'
import { Faq } from './sections/Faq'
import { Contact, Footer } from './sections/Contact'

/** Lenis smooth scrolling, off with reduced motion. Returns the running instance. */
function useSmoothScroll() {
  const reduced = useReducedMotion()
  const [instance, setInstance] = useState<Lenis | null>(null)
  useEffect(() => {
    if (reduced) return
    const lenis = new Lenis({ lerp: 0.1, anchors: true, prevent: (n) => n.closest?.('[data-lenis-prevent]') != null })
    setLenis(lenis)
    setInstance(lenis)
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      setLenis(null)
      setInstance(null)
      lenis.destroy()
    }
  }, [reduced])
  return instance
}

function Home() {
  const { L } = useI18n()
  return (
    <>
      <a href="#servicii" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
        {L({ ro: 'Sari la conținut', en: 'Skip to content' })}
      </a>
      <TraceField />
      <Header />
      <main className="relative z-10 mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10">
        <Hero />
        <Services />
        <Process />
        <Mobile />
        <Status />
        <Reviews />
        <BookingCta />
        <Faq />
        <Contact />
      </main>
      <Footer />
      <SectionRail />
      <ActionBar />
      <Booking />
    </>
  )
}

const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })))
const OwnerPage = lazy(() => import('./pages/OwnerPage').then((m) => ({ default: m.OwnerPage })))
const DevPage = lazy(() => import('./pages/DevPage').then((m) => ({ default: m.DevPage })))

function Page() {
  const lenis = useSmoothScroll()
  const page = pageOf(usePath())
  useHeroSnap(page === null ? lenis : null)
  const content =
    page === null ? (
      <Home />
    ) : page === '/confidentialitate' ? (
      <LegalPage kind="privacy" />
    ) : page === '/termeni' ? (
      <LegalPage kind="terms" />
    ) : (
      <Suspense fallback={null}>
        {page === '/cont' ? <AccountPage /> : page === '/admin' ? <OwnerPage /> : <DevPage />}
      </Suspense>
    )
  return (
    <>
      {content}
      <CookieConsent />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <Page />
      </I18nProvider>
    </ThemeProvider>
  )
}
