import type Lenis from 'lenis'

/** The page's Lenis instance, so modals can pause smooth scrolling. */
let lenis: Lenis | null = null
export const setLenis = (l: Lenis | null) => {
  lenis = l
}
export const getLenis = () => lenis

export function lockPage(lock: boolean) {
  if (lock) lenis?.stop()
  else lenis?.start()
  document.documentElement.style.overflow = lock ? 'hidden' : ''
}
