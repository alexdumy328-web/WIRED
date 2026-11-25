export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string; data: unknown }

/** JSON call to our API. Never throws: network failures come back as status 0. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    let data: unknown = null
    try {
      data = await response.json()
    } catch {
      /* empty or non-JSON body */
    }
    if (response.ok) return { ok: true, status: response.status, data: data as T }
    const error = typeof data === 'object' && data !== null && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : 'error'
    return { ok: false, status: response.status, error, data }
  } catch {
    return { ok: false, status: 0, error: 'network', data: null }
  }
}
