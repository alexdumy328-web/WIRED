import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '../i18n'
import { useTheme, type ThemePref } from '../lib/theme'
import { Logo } from './Logo'
import { Auto, Close, Menu, Moon, Sun } from './Icons'
import { OpenStatus } from './OpenStatus'
import { Roll } from './Chrome'

const order: ThemePref[] = ['system', 'light', 'dark']

export function Header() {
  const { t, lang, setLang } = useI18n()
  const { pref, setPref } = useTheme()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open])

  const links = [
    ['#servicii', t.nav.services],
    ['#auto', t.nav.mobile],
    ['#proces', t.nav.process],
    ['#atelier', t.nav.workshop],
    ['#recenzii', t.nav.reviews],
    ['#intrebari', t.nav.faq],
  ] as const

  const nextTheme = order[(order.indexOf(pref) + 1) % order.length]
  const themeLabel = { system: t.nav.themeSystem, light: t.nav.themeLight, dark: t.nav.themeDark }
  const ThemeIcon = pref === 'system' ? Auto : pref === 'light' ? Sun : Moon

  const langSwitch = (
    <div role="group" aria-label={t.nav.language} className="flex rounded-full border border-line p-0.5 text-sm">
      {(['ro', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`h-8 min-w-10 rounded-full px-2.5 font-semibold transition-colors ${lang === l ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
  const themeBtn = (
    <button
      type="button"
      onClick={() => setPref(nextTheme)}
      className="grid size-9 place-items-center rounded-full border border-line text-muted transition-colors hover:text-ink"
      aria-label={`${themeLabel[pref]}. ${themeLabel[nextTheme]}?`}
      title={themeLabel[pref]}
    >
      <ThemeIcon className="size-[18px]" />
    </button>
  )

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300 ${scrolled ? 'scrim border-b border-line' : 'border-b border-transparent'}`}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-4 sm:px-6">
        <a href="#top" className="rounded-md" aria-label="Norgelis Tech">
          <Logo draw />
        </a>
        <nav className="ml-4 hidden items-center gap-5 whitespace-nowrap text-[15px] lg:flex">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="text-muted transition-colors hover:text-ink">
              <Roll text={label} />
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <OpenStatus className="mr-2 hidden min-[1560px]:inline-flex" />
          <a href="#status" className="hidden whitespace-nowrap text-[15px] text-muted hover:text-ink xl:inline">
            {t.nav.track}
          </a>
          <div className="hidden items-center gap-2 sm:flex">
            {langSwitch}
            {themeBtn}
          </div>
          <a href="#programare" className="btn btn-gold hidden h-10 min-h-0 sm:inline-flex">
            {t.nav.book}
          </a>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-line lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t.nav.openMenu}
            aria-expanded={open}
          >
            <Menu />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-bg px-4 pb-8 sm:px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex h-16 items-center justify-between">
              <Logo />
              <button type="button" className="grid size-10 place-items-center rounded-full border border-line" onClick={() => setOpen(false)} aria-label={t.nav.closeMenu}>
                <Close />
              </button>
            </div>
            <nav className="mt-6 flex flex-col">
              {[...links, ['#status', t.nav.track] as const].map(([href, label], i) => (
                <motion.a
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="display-2 border-b border-line py-4 text-3xl"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i, duration: 0.3 }}
                >
                  {label}
                </motion.a>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-5">
              <OpenStatus className="inline-flex" />
              <div className="flex items-center gap-3">
                {langSwitch}
                {themeBtn}
              </div>
              <a href="#programare" onClick={() => setOpen(false)} className="btn btn-gold w-full">
                {t.nav.book}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
