import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lang, Localized } from '../types'
import { canStorePreferences, useConsent } from '../lib/consent'
import type { Dict } from './dict'
import ro from './ro'
import en from './en'

const dicts: Record<Lang, Dict> = { ro, en }

type I18n = { lang: Lang; t: Dict; setLang: (l: Lang) => void; L: (v: Localized) => string }
const Ctx = createContext<I18n | null>(null)

function initialLang(): Lang {
  const l = document.documentElement.lang
  return l === 'en' ? 'en' : 'ro'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const { choice } = useConsent()
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    if (!canStorePreferences()) return
    try {
      localStorage.setItem('nt-lang', l)
    } catch {
      /* storage blocked */
    }
  }, [])
  useEffect(() => {
    if (!choice?.preferences) return
    try {
      localStorage.setItem('nt-lang', lang)
    } catch {
      /* storage blocked */
    }
  }, [choice?.preferences, lang])
  useEffect(() => {
    document.documentElement.lang = lang
    const t = dicts[lang]
    document.title = t.meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
  }, [lang])
  const value = useMemo<I18n>(() => ({ lang, t: dicts[lang], setLang, L: (v) => v[lang] }), [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside provider')
  return v
}

/** Fill {name} placeholders. */
export function fmt(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}
