import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { LEGAL_UPDATED, OPERATOR, PRIVACY, TERMS } from '../data/legal'
import { PageShell } from '../auth/ui'
import { linkTo } from '../lib/router'

/** /confidentialitate and /termeni: the privacy policy and the terms, in the visitor's language. */
export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { lang, t } = useI18n()
  const doc = (kind === 'privacy' ? PRIVACY : TERMS)[lang]
  const otherPath = kind === 'privacy' ? '/termeni' : '/confidentialitate'
  const otherTitle = (kind === 'privacy' ? TERMS : PRIVACY)[lang].title
  // The support address is set on the server (SUPPORT_EMAIL), so it can change without a release.
  const [serverEmail, setServerEmail] = useState<string | null>(null)
  useEffect(() => {
    if (OPERATOR.email) return
    let live = true
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { supportEmail?: string | null } | null) => live && setServerEmail(c?.supportEmail ?? null))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  const email = OPERATOR.email || serverEmail
  const updated = new Date(`${LEGAL_UPDATED}T12:00:00`).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <PageShell>
      <article className="mx-auto max-w-[760px]">
        <h1 className="display-2 text-4xl sm:text-5xl">{doc.title}</h1>
        <p className="mt-2 text-[14px] text-muted">{t.legal.updated} {updated}</p>
        <p className="mt-6 text-lg">{doc.lead}</p>

        {doc.sections.map((s) => (
          <section key={s.h} className="mt-9">
            <h2 className="text-xl font-bold">{s.h}</h2>
            {s.p?.map((p) => (
              <p key={p} className="mt-3 leading-relaxed">
                {p}
              </p>
            ))}
            {s.ul && (
              <ul className="mt-3 grid list-disc gap-2 pl-6 leading-relaxed marker:text-gold">
                {s.ul.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="mt-9 rounded-2xl border border-line p-5">
          <h2 className="text-xl font-bold">{t.legal.contact}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
            <dt className="text-muted">{t.legal.operator}</dt>
            <dd>{OPERATOR.legalName || OPERATOR.name}</dd>
            {OPERATOR.cui && (
              <>
                <dt className="text-muted">CUI</dt>
                <dd>{OPERATOR.cui}</dd>
              </>
            )}
            {OPERATOR.regCom && (
              <>
                <dt className="text-muted">Reg. Com.</dt>
                <dd>{OPERATOR.regCom}</dd>
              </>
            )}
            <dt className="text-muted">{t.legal.address}</dt>
            <dd>{OPERATOR.address}</dd>
            <dt className="text-muted">{t.legal.phone}</dt>
            <dd>
              <a className="underline decoration-gold underline-offset-4" href={`tel:${OPERATOR.phone.replace(/\s/g, '')}`}>
                {OPERATOR.phone}
              </a>
            </dd>
            {email && (
              <>
                <dt className="text-muted">Email</dt>
                <dd>
                  <a className="underline decoration-gold underline-offset-4" href={`mailto:${email}`}>
                    {email}
                  </a>
                </dd>
              </>
            )}
          </dl>
        </section>

        <p className="mt-8 text-[15px]">
          <a href={otherPath} onClick={linkTo(otherPath)} className="underline decoration-gold underline-offset-4">
            {otherTitle}
          </a>
          {' · '}
          <a href="/" onClick={linkTo('/')} className="underline decoration-gold underline-offset-4">
            {t.legal.home}
          </a>
        </p>
      </article>
    </PageShell>
  )
}
