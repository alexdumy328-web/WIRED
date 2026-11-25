/** Removes personal data from strings before they reach logs. */

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-])[A-Za-z0-9.-]*\.([A-Za-z]{2,})/g
// Phone-like runs: optional +, 9 or more digits with spaces, dots or dashes between.
const PHONE = /\+?\d[\d\s.-]{7,}\d/g
const BEARER = /\b(Bearer|token|secret|password|otp|code)(["'\s:=]+)[^\s"',;]+/gi
const LONG_SECRET = /\b[A-Za-z0-9_-]{32,}\b/g

export function maskEmail(email: string): string {
  const [user, domain = ''] = email.split('@')
  const tld = domain.includes('.') ? domain.slice(domain.lastIndexOf('.')) : ''
  return `${user.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length <= 3 ? '***' : `+***${digits.slice(-3)}`
}

export function scrubText(input: string): string {
  return input
    .replace(EMAIL, (_m, a: string, b: string, tld: string) => `${a}***@${b}***.${tld}`)
    .replace(BEARER, (_m, label: string, sep: string) => `${label}${sep}[redacted]`)
    .replace(PHONE, (m) => maskPhone(m))
    .replace(LONG_SECRET, '[redacted]')
}

/** Short, PII-free description of an unknown error. */
export function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    const stack = error.stack
      ?.split('\n')
      .slice(1, 6)
      .map((line) => scrubText(line.trim()))
      .join('\n')
    return { name: error.name, message: scrubText(error.message).slice(0, 500), ...(stack ? { stack } : {}) }
  }
  return { name: 'NonError', message: scrubText(String(error)).slice(0, 500) }
}
