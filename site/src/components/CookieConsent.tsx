import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { OPERATOR } from '../data/legal'
import { closeCookieSettings, openCookieSettings, saveConsent, useConsent } from '../lib/consent'
import { inertOutside } from '../lib/inert'
import { linkTo, usePath } from '../lib/router'
import { Close } from './Icons'

function CookieSettingsDialog({ initialPreferences }: { initialPreferences: boolean }) {
  const { t } = useI18n()
  const [prefsDraft, setPrefsDraft] = useState(initialPreferences)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const prefSwitchId = useId()

  useEffect(() => {
    const undo = inertOutside(dialogRef.current)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCookieSettings()
    }
    window.addEventListener('keydown', onKey)
    const frame = requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      undo()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-3 backdrop-blur-xs sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeCookieSettings()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-lenis-prevent
        className="max-h-[90dvh] w-full max-w-[540px] overflow-y-auto rounded-[22px] border border-line bg-surface p-5 text-ink shadow-2xl outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-bold tracking-tight">
              {t.cookies.settingsTitle}
            </h2>
            <p className="mt-1 text-[13px] text-muted">{OPERATOR.legalName}</p>
          </div>
          <button
            type="button"
            onClick={closeCookieSettings}
            aria-label={t.cookies.close}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <Close className="size-4" />
          </button>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          {t.cookies.settingsLead}{' '}
          <a
            href="/confidentialitate"
            onClick={(e) => {
              closeCookieSettings()
              linkTo('/confidentialitate')(e)
            }}
            className="text-ink underline decoration-gold underline-offset-4 hover:text-gold"
          >
            {t.cookies.policyLink}
          </a>
          .
        </p>

        <div className="mt-5 grid gap-3">
          <div className="rounded-[14px] border border-line bg-surface-2/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{t.cookies.necessaryTitle}</span>
              <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-muted">
                {t.cookies.alwaysOn}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t.cookies.necessaryBody}</p>
          </div>

          <div className="rounded-[14px] border border-line bg-surface-2/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={prefSwitchId} className="cursor-pointer font-semibold">
                {t.cookies.preferencesTitle}
              </label>
              <button
                id={prefSwitchId}
                type="button"
                role="switch"
                aria-checked={prefsDraft}
                onClick={() => setPrefsDraft((v) => !v)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                  prefsDraft ? 'border-gold bg-gold' : 'border-line bg-surface'
                }`}
              >
                <span className="sr-only">{t.cookies.preferencesTitle}</span>
                <span
                  className={`pointer-events-none block size-5 rounded-full shadow-xs transition-transform ${
                    prefsDraft ? 'translate-x-6 bg-on-gold' : 'translate-x-1 bg-muted'
                  }`}
                />
              </button>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t.cookies.preferencesBody}</p>
          </div>
        </div>

        <p className="mt-4 text-[13px] text-muted">{t.cookies.noTracking}</p>

        <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button type="button" onClick={() => saveConsent(false)} className="btn btn-ghost min-h-11 px-4 text-[14px]">
            {t.cookies.reject}
          </button>
          <button type="button" onClick={() => saveConsent(prefsDraft)} className="btn btn-ghost min-h-11 px-4 text-[14px]">
            {t.cookies.save}
          </button>
          <button type="button" onClick={() => saveConsent(true)} className="btn btn-gold min-h-11 px-4 text-[14px]">
            {t.cookies.accept}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * GDPR cookie & browser storage consent banner and preferences modal.
 * Hidden on internal staff dashboards (/admin, /dev).
 */
export function CookieConsent() {
  const { t } = useI18n()
  const path = usePath()
  const { choice, dialogOpen } = useConsent()

  const isStaff = /^\/(admin|dev)(\/|$)/.test(path)
  if (isStaff) return null

  if (dialogOpen) {
    return <CookieSettingsDialog initialPreferences={choice?.preferences ?? false} />
  }

  if (choice !== null) return null

  return (
    <aside
      role="region"
      aria-label={t.cookies.bannerLabel}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[780px] rounded-[20px] border border-line bg-surface/95 p-4 text-ink shadow-[0_14px_40px_rgb(0_0_0/0.22)] backdrop-blur-md sm:inset-x-6 sm:bottom-5 sm:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{t.cookies.bannerTitle}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {t.cookies.bannerBody}{' '}
            <a
              href="/confidentialitate"
              onClick={linkTo('/confidentialitate')}
              className="text-ink underline decoration-gold underline-offset-4 hover:text-gold"
            >
              {t.cookies.policyLink}
            </a>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCookieSettings}
            className="min-h-10 rounded-full px-3 text-[13px] font-medium text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-gold"
          >
            {t.cookies.settings}
          </button>
          <button type="button" onClick={() => saveConsent(false)} className="btn btn-ghost min-h-10 px-4 text-[13px]">
            {t.cookies.reject}
          </button>
          <button type="button" onClick={() => saveConsent(true)} className="btn btn-gold min-h-10 px-4 text-[13px]">
            {t.cookies.accept}
          </button>
        </div>
      </div>
    </aside>
  )
}
