import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'

/** Tells the server which language to write emails in. */
function withLang(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const lang = document.documentElement.lang === 'en' ? 'en' : 'ro'
  if (input instanceof Request) {
    const headers = new Headers(input.headers)
    headers.set('x-nt-lang', lang)
    return fetch(new Request(input, { headers }))
  }
  const headers = new Headers(init?.headers)
  headers.set('x-nt-lang', lang)
  return fetch(input, { ...init, headers })
}

/** Better Auth client. Same origin: the API is mounted at /api/auth. */
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
  fetchOptions: { customFetchImpl: withLang },
})
