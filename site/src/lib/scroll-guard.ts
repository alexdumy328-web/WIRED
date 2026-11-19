import { useEffect, useRef, useState, type RefObject } from 'react'

type Phase = 'armed' | 'holding' | 'free'

/**
 * Once a form has input, the first scroll gesture that would carry the page away is
 * held and a hint shows. The next gesture goes through. After 2.5 s without scrolling
 * the guard re-arms. A trackpad swipe is many wheel events: events closer than 250 ms
 * belong to the same gesture.
 *
 * Listens in the capture phase on document, so it runs before Lenis (on window).
 */
export function useScrollGuard(ref: RefObject<HTMLElement | null>, active: boolean) {
  const [hint, setHint] = useState(false)
  const phase = useRef<Phase>('armed')
  const last = useRef(0)

  useEffect(() => {
    if (!active) return
    phase.current = 'armed'
    let hideTimer = 0
    let touchY = 0
    let touchHeld = false

    const inView = () => {
      const r = ref.current?.getBoundingClientRect()
      return !!r && r.top < window.innerHeight * 0.8 && r.bottom > window.innerHeight * 0.2
    }
    const showHint = () => {
      setHint(true)
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => setHint(false), 2200)
    }
    const block = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-lenis-prevent]')) return
      const now = performance.now()
      const gap = now - last.current
      last.current = now
      if (!inView()) {
        phase.current = 'armed'
        return
      }
      if (phase.current === 'free' && gap > 2500) phase.current = 'armed'
      if (phase.current === 'armed') {
        phase.current = 'holding'
        showHint()
        return block(e)
      }
      if (phase.current === 'holding') {
        if (gap > 250) {
          phase.current = 'free' // a new gesture after the held one: let it go
          setHint(false)
          return
        }
        return block(e)
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0
      touchHeld = false
      if (phase.current === 'free' && performance.now() - last.current > 2500) phase.current = 'armed'
      if (phase.current === 'holding') {
        phase.current = 'free'
        setHint(false)
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-lenis-prevent], input, textarea, select')) return
      if (Math.abs((e.touches[0]?.clientY ?? 0) - touchY) < 12 && !touchHeld) return
      last.current = performance.now()
      if (!inView()) return
      if (phase.current === 'armed' || touchHeld) {
        if (!touchHeld) showHint()
        phase.current = 'holding'
        touchHeld = true
        block(e)
      }
    }

    document.addEventListener('wheel', onWheel, { capture: true, passive: false })
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    return () => {
      document.removeEventListener('wheel', onWheel, { capture: true })
      document.removeEventListener('touchstart', onTouchStart, { capture: true })
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      window.clearTimeout(hideTimer)
    }
  }, [active, ref])

  return hint
}
