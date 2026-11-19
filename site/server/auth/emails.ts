import type { Mail } from './outbox.ts'

export type MailLang = 'ro' | 'en'
export type OtpKind = 'sign-in' | 'email-verification' | 'forget-password'

const SHOP = 'Norgelis Tech'

/** Picks ro or en from an x-nt-lang or Accept-Language header. Romanian is the default. */
export function pickLang(headers: Headers | undefined | null): MailLang {
  const explicit = headers?.get('x-nt-lang')?.trim().toLowerCase()
  if (explicit === 'ro' || explicit === 'en') return explicit
  const accept = headers?.get('accept-language')?.toLowerCase() ?? ''
  const first = accept.split(',')[0]?.trim() ?? ''
  return first.startsWith('en') ? 'en' : 'ro'
}

const copy = {
  ro: {
    'sign-in': { subject: 'Codul tău de autentificare', lead: 'Codul tău de autentificare este' },
    'email-verification': { subject: 'Codul tău de confirmare', lead: 'Codul pentru confirmarea adresei de email este' },
    'forget-password': { subject: 'Codul tău pentru resetarea parolei', lead: 'Codul pentru resetarea parolei este' },
    expires: (minutes: number) => `Codul expiră în ${minutes} minute.`,
    ignore: 'Dacă nu ai cerut tu acest cod, ignoră mesajul.',
  },
  en: {
    'sign-in': { subject: 'Your sign-in code', lead: 'Your sign-in code is' },
    'email-verification': { subject: 'Your confirmation code', lead: 'Your email confirmation code is' },
    'forget-password': { subject: 'Your password reset code', lead: 'Your password reset code is' },
    expires: (minutes: number) => `The code expires in ${minutes} minutes.`,
    ignore: 'If you did not ask for this code, ignore this message.',
  },
} as const

export function otpMail(to: string, otp: string, type: OtpKind, lang: MailLang, expiresMinutes: number): Mail {
  const c = copy[lang]
  return {
    to,
    kind: `otp:${type}`,
    subject: `${SHOP}: ${c[type].subject}`,
    text: `${c[type].lead} ${otp}\n\n${c.expires(expiresMinutes)} ${c.ignore}\n\n${SHOP}`,
  }
}
