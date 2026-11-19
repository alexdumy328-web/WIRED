import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { linkTo } from '../lib/router'
import { SignIn } from './SignIn'
import { PageShell, Loading, Notice } from './ui'
import { useViewer, type Role } from './viewer'

/** Shows children to the allowed roles; others get a sign-in form or a plain "no access" state. */
export function Guard({ roles, children, wide }: { roles: Role[]; children: (user: NonNullable<ReturnType<typeof useViewer>['user']>) => ReactNode; wide?: boolean }) {
  const { t } = useI18n()
  const { status, user } = useViewer()

  if (status === 'loading') {
    return (
      <PageShell wide={wide}>
        <Loading label={t.account.loading} />
      </PageShell>
    )
  }
  if (status === 'unavailable') {
    return (
      <PageShell wide={wide}>
        <Notice tone="error">{t.account.unavailable}</Notice>
      </PageShell>
    )
  }
  if (!user) {
    return (
      <PageShell wide={wide}>
        <SignIn />
      </PageShell>
    )
  }
  if (!roles.includes(user.role)) {
    return (
      <PageShell wide={wide}>
        <div className="mx-auto max-w-md text-center">
          <h1 className="display-2 text-4xl">{t.account.noAccess.title}</h1>
          <p className="mt-3 text-muted">{t.account.noAccess.body}</p>
          <div className="mt-6 flex justify-center gap-3">
            <a href="/cont" onClick={linkTo('/cont')} className="btn btn-gold">
              {t.account.nav}
            </a>
            <a href="/" onClick={linkTo('/')} className="btn btn-ghost">
              {t.account.noAccess.home}
            </a>
          </div>
        </div>
      </PageShell>
    )
  }
  return <>{children(user)}</>
}
