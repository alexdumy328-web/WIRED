import { useEffect, useState } from 'react'
import { api } from './api'

/** GET a JSON path; reloads when `path` or `tick` changes. */
export function useFetch<T>(path: string | null, tick = 0) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data: T | null; code: number }>({ status: 'loading', data: null, code: 0 })
  useEffect(() => {
    if (path === null) return
    let live = true
    setState((s) => ({ ...s, status: 'loading' }))
    void api<T>(path).then((result) => {
      if (!live) return
      setState(result.ok ? { status: 'ready', data: result.data, code: result.status } : { status: 'error', data: null, code: result.status })
    })
    return () => {
      live = false
    }
  }, [path, tick])
  return state
}
