import { useState, type FormEvent } from 'react'
import { fmt, useI18n } from '../i18n'
import { authClient } from './client'
import { refreshViewer, useViewer } from './viewer'
import { Field, Notice } from './ui'

type Method = 'code' | 'password'
type Step = 'start' | 'code' | 'up' | 'verify' | 'forgot' | 'reset'
type AuthError = { status?: number; code?: string } | null | undefined

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Sign in or sign up: Google, email code, or email and password. */
export function SignIn() {
  const { t } = useI18n()
  const { google } = useViewer()
  const [method, setMethod] = useState<Method>('code')
  const [step, setStep] = useState<Step>('start')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'email' | 'password' | 'code', string>>>({})
  const a = t.account

  const explain = (err: AuthError): string => {
    if (!err) return a.errors.generic
    if (err.status === 429) return a.errors.rateLimited
    if (err.status === 503) return a.errors.mailDown
    if (err.code === 'TOO_MANY_ATTEMPTS') return a.errors.locked
    if (err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED') return a.errors.invalidCode
    if (err.code === 'INVALID_EMAIL_OR_PASSWORD' || err.status === 401) return a.errors.badLogin
    return a.errors.generic
  }

  const reset = (next: Step, message: string | null = null) => {
    setStep(next)
    setError(null)
    setInfo(message)
    setFieldErrors({})
    setCode('')
  }

  const validate = (need: Array<'name' | 'email' | 'password' | 'code'>): boolean => {
    const found: typeof fieldErrors = {}
    if (need.includes('name') && name.trim().length < 2) found.name = a.errors.name
    if (need.includes('email') && !emailRe.test(email.trim())) found.email = a.errors.email
    if (need.includes('password') && password.length < 10) found.password = a.errors.passwordShort
    if (need.includes('code') && !/^\d{6}$/.test(code.trim())) found.code = a.errors.code
    setFieldErrors(found)
    return Object.keys(found).length === 0
  }

  /** Runs one request with the busy flag and shared error handling. */
  const run = async (task: () => Promise<{ error?: AuthError | null } | { error: null } | void>, onOk: () => void | Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await task()
      if (result && result.error) {
        setError(explain(result.error))
        return
      }
      await onOk()
    } catch {
      setError(a.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  const mail = email.trim().toLowerCase()

  const sendSignInCode = (e?: FormEvent) => {
    e?.preventDefault()
    if (!validate(['email'])) return
    void run(() => authClient.emailOtp.sendVerificationOtp({ email: mail, type: 'sign-in' }), () => reset('code', fmt(a.msgs.codeSent, { email: mail })))
  }

  const submitSignInCode = (e: FormEvent) => {
    e.preventDefault()
    if (!validate(['email', 'code'])) return
    void run(() => authClient.signIn.emailOtp({ email: mail, otp: code.trim() }), () => refreshViewer())
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    if (step === 'up') {
      if (!validate(['name', 'email', 'password'])) return
      void run(() => authClient.signUp.email({ name: name.trim(), email: mail, password }), () => reset('verify', fmt(a.msgs.confirmSent, { email: mail })))
      return
    }
    if (!validate(['email', 'password'])) return
    setBusy(true)
    setError(null)
    void authClient.signIn
      .email({ email: mail, password })
      .then(async ({ error: err }) => {
        if (!err) return refreshViewer()
        if (err.status === 403) reset('verify', a.msgs.unverified)
        else setError(explain(err))
      })
      .catch(() => setError(a.errors.generic))
      .finally(() => setBusy(false))
  }

  const submitVerify = (e: FormEvent) => {
    e.preventDefault()
    if (!validate(['email', 'code'])) return
    void run(() => authClient.emailOtp.verifyEmail({ email: mail, otp: code.trim() }), () => refreshViewer())
  }

  const sendReset = (e?: FormEvent) => {
    e?.preventDefault()
    if (!validate(['email'])) return
    void run(() => authClient.emailOtp.requestPasswordReset({ email: mail }), () => reset('reset', fmt(a.msgs.resetSent, { email: mail })))
  }

  const submitReset = (e: FormEvent) => {
    e.preventDefault()
    if (!validate(['code', 'password'])) return
    void run(() => authClient.emailOtp.resetPassword({ email: mail, otp: code.trim(), password }), () => {
      setPassword('')
      setMethod('password')
      reset('start', a.msgs.resetDone)
    })
  }

  const resend = () => {
    if (step === 'code') sendSignInCode()
    else if (step === 'reset') sendReset()
    else
      void run(() => authClient.emailOtp.sendVerificationOtp({ email: mail, type: 'email-verification' }), () => setInfo(fmt(a.msgs.confirmSent, { email: mail })))
  }

  const emailField = (
    <Field label={a.fields.email} error={fieldErrors.email}>
      {(p) => <input {...p} className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" maxLength={160} />}
    </Field>
  )
  const codeField = (
    <Field label={a.fields.code} error={fieldErrors.code}>
      {(p) => <input {...p} className="field tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" maxLength={6} autoFocus />}
    </Field>
  )
  const passwordField = (label: string, autoComplete: string) => (
    <Field label={label} error={fieldErrors.password} hint={a.passwordHint}>
      {(p) => <input {...p} className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={autoComplete} maxLength={128} />}
    </Field>
  )
  const link = 'text-[14px] font-semibold text-gold underline-offset-4 hover:underline'
  const submit = (label: string) => (
    <button type="submit" className="btn btn-gold w-full" disabled={busy} aria-busy={busy}>
      {label}
    </button>
  )
  const resendBtn = (
    <button type="button" className={link} onClick={resend} disabled={busy}>
      {a.actions.resend}
    </button>
  )
  const messages = (
    <>
      {info && <Notice tone="info">{info}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </>
  )

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="display-2 text-4xl sm:text-5xl">{a.title}</h1>
      <p className="mt-3 text-muted">{a.lead}</p>

      <div className="mt-8 grid gap-5 rounded-[24px] border border-line bg-surface p-5 sm:p-7">
        {google && (
          <>
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => void authClient.signIn.social({ provider: 'google', callbackURL: '/cont' })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4Z" />
                <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1a6.8 6.8 0 0 1-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 23.5Z" />
                <path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3Z" />
                <path fill="#EA4335" d="M12 5.4c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3A6.8 6.8 0 0 1 12 5.4Z" />
              </svg>
              {a.google}
            </button>
            <p className="flex items-center gap-3 text-[13px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{a.or}</p>
          </>
        )}

        <div role="tablist" aria-label={a.title} className="grid grid-cols-2 rounded-full border border-line p-0.5 text-[14px]">
          {(['code', 'password'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              id={`tab-${m}`}
              aria-selected={method === m}
              aria-controls="signin-panel"
              onClick={() => {
                setMethod(m)
                reset('start')
              }}
              className={`h-10 rounded-full font-semibold transition-colors ${method === m ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
            >
              {a.methods[m]}
            </button>
          ))}
        </div>

        <div id="signin-panel" role="tabpanel" aria-labelledby={`tab-${method}`} className="grid gap-4">
          {method === 'code' && step === 'start' && (
            <form className="grid gap-4" onSubmit={sendSignInCode} noValidate>
              {emailField}
              {messages}
              {submit(a.actions.sendCode)}
            </form>
          )}
          {method === 'code' && step === 'code' && (
            <form className="grid gap-4" onSubmit={submitSignInCode} noValidate>
              {info && <Notice tone="info">{info}</Notice>}
              {codeField}
              {error && <Notice tone="error">{error}</Notice>}
              {submit(a.actions.signIn)}
              <div className="flex justify-between">
                {resendBtn}
                <button type="button" className={link} onClick={() => reset('start')}>
                  {a.actions.backToSignIn}
                </button>
              </div>
            </form>
          )}

          {method === 'password' && (step === 'start' || step === 'up') && (
            <form className="grid gap-4" onSubmit={submitPassword} noValidate>
              {step === 'up' && (
                <Field label={a.fields.name} error={fieldErrors.name}>
                  {(p) => <input {...p} className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />}
                </Field>
              )}
              {emailField}
              {passwordField(a.fields.password, step === 'up' ? 'new-password' : 'current-password')}
              {messages}
              {submit(step === 'up' ? a.actions.createAccount : a.actions.signIn)}
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-2">
                <button type="button" className={link} onClick={() => reset(step === 'up' ? 'start' : 'up')}>
                  {step === 'up' ? a.toggles.toSignIn : a.toggles.toSignUp}
                </button>
                {step === 'start' && (
                  <button type="button" className={link} onClick={() => reset('forgot')}>
                    {a.actions.forgot}
                  </button>
                )}
              </div>
            </form>
          )}
          {method === 'password' && step === 'verify' && (
            <form className="grid gap-4" onSubmit={submitVerify} noValidate>
              {info && <Notice tone="info">{info}</Notice>}
              {codeField}
              {error && <Notice tone="error">{error}</Notice>}
              {submit(a.actions.verify)}
              <div className="flex justify-between">
                {resendBtn}
                <button type="button" className={link} onClick={() => reset('start')}>
                  {a.actions.backToSignIn}
                </button>
              </div>
            </form>
          )}
          {method === 'password' && step === 'forgot' && (
            <form className="grid gap-4" onSubmit={sendReset} noValidate>
              {emailField}
              {messages}
              {submit(a.actions.sendCode)}
              <button type="button" className={`${link} justify-self-start`} onClick={() => reset('start')}>
                {a.actions.backToSignIn}
              </button>
            </form>
          )}
          {method === 'password' && step === 'reset' && (
            <form className="grid gap-4" onSubmit={submitReset} noValidate>
              {info && <Notice tone="info">{info}</Notice>}
              {codeField}
              {passwordField(a.fields.newPassword, 'new-password')}
              {error && <Notice tone="error">{error}</Notice>}
              {submit(a.actions.reset)}
              <div className="flex justify-between">
                {resendBtn}
                <button type="button" className={link} onClick={() => reset('start')}>
                  {a.actions.backToSignIn}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
