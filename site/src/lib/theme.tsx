import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
type ThemeCtx = { pref: ThemePref; resolved: 'light' | 'dark'; setPref: (p: ThemePref) => void }
const Ctx = createContext<ThemeCtx | null>(null)

const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const t = document.documentElement.dataset.theme
    return t === 'light' || t === 'dark' ? t : 'system'
  })
  const [systemDark, setSystemDark] = useState(() => mq().matches)
  useEffect(() => {
    const m = mq()
    const on = () => setSystemDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  const setPref = (p: ThemePref) => {
    setPrefState(p)
    const root = document.documentElement
    if (p === 'system') delete root.dataset.theme
    else root.dataset.theme = p
    try {
      if (p === 'system') localStorage.removeItem('nt-theme')
      else localStorage.setItem('nt-theme', p)
    } catch {
      /* storage blocked */
    }
  }
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme outside provider')
  return v
}

export function useReducedMotion() {
  const [r, setR] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return r
}
