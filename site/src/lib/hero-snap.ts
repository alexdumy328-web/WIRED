import { useEffect } from 'react'
import type Lenis from 'lenis'

/** Fraction of the hero-to-Services distance a scroll must cover before it settles on Services. */
const PULL = 0.15
/** Quiet time after the last wheel or touch input before the page settles. */
const IDLE_MS = 180

/**
 * Gentle snap between the hero and Services only. When the reader stops part way between them,
 * the page settles on the one they were heading to. It runs only with Lenis (so never with reduced
 * motion), and never once the page is past the top of Services, so long lists scroll freely.
 */
export function useHeroSnap(lenis: Lenis | null) {
  useEffect(() => {
    if (!lenis) return
    let timer = 0
    let snapping = false
    let dir = 0
    let lastY = window.scrollY
    const settle = () => {
      const services = document.getElementById('servicii')
      if (!services || snapping || lenis.isStopped) return
      // Where Lenis is heading, so the snap starts without waiting for its easing to finish.
      const y = lenis.targetScroll
      const end = services.getBoundingClientRect().top + window.scrollY - (Number.parseFloat(getComputedStyle(services).scrollMarginTop) || 0)
      if (y <= 4 || y >= end - 4) return
      const down = dir > 0 ? y > end * PULL : y > end * (1 - PULL)
      snapping = true
      const done = () => (snapping = false)
      lenis.scrollTo(down ? end : 0, { duration: 0.8, onComplete: done })
      window.setTimeout(done, 1100)
    }
    const later = () => {
      window.clearTimeout(timer)
      if (!snapping) timer = window.setTimeout(settle, IDLE_MS)
    }
    // Wheel and touch input: the reader's own scrolling.
    const offInput = lenis.on('virtual-scroll', ({ deltaY }) => {
      if (deltaY) dir = Math.sign(deltaY)
      later()
    })
    // Native scrolling (touch momentum, keyboard, scrollbar) reaches Lenis only as scroll events.
    const offScroll = lenis.on('scroll', () => {
      const y = window.scrollY
      if (lenis.isScrolling === 'native') {
        if (y !== lastY) dir = Math.sign(y - lastY)
        later()
      }
      lastY = y
    })
    return () => {
      offInput()
      offScroll()
      window.clearTimeout(timer)
    }
  }, [lenis])
}
