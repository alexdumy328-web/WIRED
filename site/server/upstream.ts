/** Shared upstream HTTP helper: short timeout, identifying User-Agent, JSON only. */
export const UPSTREAM_USER_AGENT = 'NorgelisTech-site/1.0'
export const UPSTREAM_TIMEOUT_MS = 6000

export type JsonResult = { ok: true; data: unknown } | { ok: false }

export async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
): Promise<JsonResult> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('upstream timeout'))
    }, timeoutMs)
  })

  try {
    const response = await Promise.race([
      fetchImpl(url, {
        headers: {
          'User-Agent': UPSTREAM_USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      }),
      timeout,
    ])

    const ok =
      typeof response.ok === 'boolean'
        ? response.ok
        : typeof response.status === 'number'
          ? response.status >= 200 && response.status < 300
          : true
    if (!ok) return { ok: false }

    const text =
      typeof response.text === 'function'
        ? await Promise.race([response.text(), timeout])
        : JSON.stringify(await response.json())

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return { ok: false }
    }
    return { ok: true, data }
  } catch {
    // Timeout, DNS, connection reset, invalid body: callers decide the fallback.
    return { ok: false }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
