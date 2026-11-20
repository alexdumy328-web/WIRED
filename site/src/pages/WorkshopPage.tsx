import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '../i18n'
import { partLabels } from '../i18n/parts'
import { linkTo } from '../lib/router'
import { useSceneView } from '../lib/scene-view'
import { focus } from '../lib/stations'
import { MODEL_PARTS, sceneState, STOPS, type ModelId, type StopId } from '../three/contract'
import { ShopPanel } from '../components/Scene3D'
import { Logo } from '../components/Logo'
import { Arrow } from '../components/Icons'

/** Device shown at each station when you pick it on this page. */
const stationModel: Partial<Record<StopId, ModelId>> = {
  bench: 'board',
  laptop: 'laptop',
  coffee: 'coffee',
  door: 'auto',
}

const ss = sceneState as typeof sceneState & { tour?: boolean }

/** Full-screen interactive workshop: orbit around, pick a bench, take its device apart. */
export function WorkshopPage() {
  const { t, lang } = useI18n()
  const { stop } = useSceneView()
  const [model, setModel] = useState<ModelId | null>(null)
  const [exploded, setExploded] = useState(true)
  const [tour, setTour] = useState(false)
  const labels = partLabels(lang)
  const aside = useRef<HTMLElement>(null)
  // Tell the 3D view which parts of it the panel and top bar cover, so part labels stay in the open.
  const [safe, setSafe] = useState({ l: 0, b: 0 })
  useEffect(() => {
    const el = aside.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const wide = window.innerWidth >= 640
      setSafe(wide ? { l: Math.round(r.right + 8), b: 0 } : { l: 0, b: Math.round(window.innerHeight - r.top + 8) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    focus('overview')
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = ''
      ss.tour = false
      focus('overview')
    }
  }, [])

  const go = (id: StopId) => {
    const m = stationModel[id] ?? null
    setModel(m)
    setExploded(true)
    focus(id, m)
    setTour(false)
    ss.tour = false
  }
  const toggleExplode = () => {
    const next = !exploded
    setExploded(next)
    sceneState.explode = next && model ? 1 : 0
  }
  const toggleTour = () => {
    const next = !tour
    setTour(next)
    ss.tour = next
  }

  return (
    <div className="fixed inset-0 bg-bg" style={{ '--nt-safe-l': `${safe.l}px`, '--nt-safe-b': `${safe.b}px`, '--nt-safe-t': '64px' } as CSSProperties}>
      <ShopPanel className="absolute inset-0" interactive onSelect={go} />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3 sm:p-5">
        <a href="/" onClick={linkTo('/')} className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-bg/85 py-1.5 pl-2 pr-4 backdrop-blur">
          <Arrow className="size-4 rotate-180" />
          <span className="text-[14px] font-semibold">{t.workshopPage.back}</span>
        </a>
        <span className="pointer-events-auto hidden rounded-full border border-line bg-bg/85 px-3 py-1.5 backdrop-blur sm:block">
          <Logo />
        </span>
      </div>

      {/* Panel: stations and parts. Left column on desktop, bottom sheet on phones. */}
      <aside ref={aside} className="absolute inset-x-3 bottom-3 max-h-[46svh] overflow-y-auto rounded-[24px] border border-line bg-bg/90 p-4 backdrop-blur sm:inset-x-auto sm:bottom-5 sm:left-5 sm:top-20 sm:max-h-none sm:w-[22rem] sm:p-5" data-lenis-prevent>
        <h1 className="display-2 text-2xl sm:text-3xl">{t.workshopPage.title}</h1>
        <p className="mt-2 text-[14px] text-muted">{t.workshopPage.lead}</p>

        <p className="mt-5 text-[13px] font-semibold text-muted">{t.workshopPage.stations}</p>
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:grid sm:overflow-visible">
          {STOPS.map((id) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                onClick={() => go(id)}
                aria-pressed={stop === id}
                className={`flex w-full items-center gap-3 rounded-full border px-3.5 py-2 text-left text-[14px] transition-colors sm:rounded-[14px] ${
                  stop === id ? 'border-gold bg-surface font-semibold' : 'border-line hover:border-muted'
                }`}
              >
                <span className={`grid size-3 shrink-0 place-items-center rounded-full border-2 ${stop === id ? 'border-gold' : 'border-line'}`}>
                  <span className={`size-1 rounded-full ${stop === id ? 'bg-gold' : ''}`} />
                </span>
                {t.workshopPage.stationNames[id]}
              </button>
            </li>
          ))}
        </ul>

        <AnimatePresence>
          {model && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-muted">{t.workshopPage.parts}</p>
                <button type="button" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]" onClick={toggleExplode}>
                  {exploded ? t.workshopPage.assemble : t.workshopPage.explode}
                </button>
              </div>
              <p className="mt-1 text-[12px] text-muted">{t.workshopPage.partsHint}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {MODEL_PARTS[model].map((part) => (
                  <li key={part}>
                    <button
                      type="button"
                      onPointerEnter={() => (sceneState.highlight = part)}
                      onPointerLeave={() => (sceneState.highlight = null)}
                      onFocus={() => (sceneState.highlight = part)}
                      onBlur={() => (sceneState.highlight = null)}
                      className="rounded-full border border-line px-3 py-1.5 text-[13px] transition-colors hover:border-gold hover:text-gold"
                    >
                      {labels[`${model}.${part}`] ?? part}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" className={`btn h-10 min-h-0 ${tour ? 'btn-gold' : 'btn-ghost'}`} onClick={toggleTour} aria-pressed={tour}>
            {tour ? t.workshopPage.stopTour : t.workshopPage.tour}
          </button>
          <p className="text-[12px] text-muted">{t.workshopPage.controls}</p>
        </div>
      </aside>
    </div>
  )
}
