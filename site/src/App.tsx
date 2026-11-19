import { useEffect } from 'react'
import Lenis from 'lenis'
import { I18nProvider, useI18n } from './i18n'
import { ThemeProvider, useReducedMotion } from './lib/theme'
import { sceneState } from './three/contract'
import { Header } from './components/Header'
import { SceneLayer } from './components/SceneLayer'
import { Hero } from './sections/Hero'
import { Services } from './sections/Services'
import { Mobile } from './sections/Mobile'
import { Process } from './sections/Process'
import { Status } from './sections/Status'
import { Workshop } from './sections/Workshop'
import { Reviews } from './sections/Reviews'
import { Booking } from './sections/Booking'
import { Faq } from './sections/Faq'
import { Contact, Footer } from './sections/Contact'

function useSmoothScroll() {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced) return
    const lenis = new Lenis({ lerp: 0.1, anchors: { offset: -64 }, prevent: (n) => n.closest?.('[data-lenis-prevent]') != null })
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [reduced])
  useEffect(() => {
    if (reduced) return
    const on = (e: PointerEvent) => {
      sceneState.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      sceneState.pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', on, { passive: true })
    return () => window.removeEventListener('pointermove', on)
  }, [reduced])
}

function Page() {
  useSmoothScroll()
  const { L } = useI18n()
  return (
    <>
      <a href="#servicii" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
        {L({ ro: 'Sari la conținut', en: 'Skip to content' })}
      </a>
      <SceneLayer />
      <Header />
      <main className="relative">
        <Hero />
        <Services />
        <Process />
        <Mobile />
        <Status />
        <Workshop />
        <Reviews />
        <Booking />
        <Faq />
        <Contact />
      </main>
      <Footer />
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
