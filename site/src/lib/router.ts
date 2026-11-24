import { useSyncExternalStore, type MouseEvent } from 'react'

/** A handful of routes: "/", "/cont", "/admin", "/dev", "/confidentialitate", "/termeni". History API, no library. */
const subs = new Set<() => void>()
window.addEventListener('popstate', () => subs.forEach((f) => f()))

export function navigate(path: string) {
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  window.scrollTo(0, 0)
  subs.forEach((f) => f())
}

export function usePath() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => window.location.pathname,
  )
}

/** onClick for <a href> that keeps modifier-clicks (new tab) working. */
export function linkTo(path: string) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(path)
  }
}

/** Pages other than the one-page home. */
export const APP_PAGES = ['/cont', '/admin', '/dev', '/confidentialitate', '/termeni'] as const
export type AppPage = (typeof APP_PAGES)[number]

/** The matching app page for a pathname (trailing slashes ignored), or null for the home page. */
export function pageOf(pathname: string): AppPage | null {
  const clean = pathname.replace(/\/+$/, '')
  return (APP_PAGES as readonly string[]).includes(clean) ? (clean as AppPage) : null
}
