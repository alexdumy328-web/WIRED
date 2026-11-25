import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

type Busy = Record<string, { total: number; pickups: number }>

/** Bookings per day for whatever range a calendar shows; feeds the dots under each day. */
export function useBusy(version = 0) {
  const [days, setDays] = useState<Busy>({})
  const range = useRef<[string, string] | null>(null)
  const seq = useRef(0)

  const fetchRange = useCallback((from: string, to: string) => {
    const mine = ++seq.current
    void api<{ days: Busy }>(`/api/admin/busy?from=${from}&to=${to}`).then((r) => {
      if (r.ok && mine === seq.current) setDays(r.data.days)
    })
  }, [])

  const load = useCallback(
    (from: string, to: string) => {
      if (range.current?.[0] === from && range.current[1] === to) return
      range.current = [from, to]
      fetchRange(from, to)
    },
    [fetchRange],
  )

  // A saved booking can move or cancel a slot: reload the range on screen.
  useEffect(() => {
    if (version && range.current) fetchRange(...range.current)
  }, [version, fetchRange])

  const marks = Object.fromEntries(Object.entries(days).map(([d, v]) => [d, v.total]))
  const pickupMarks = Object.fromEntries(Object.entries(days).filter(([, v]) => v.pickups > 0).map(([d, v]) => [d, v.pickups]))
  return { days, marks, pickupMarks, load }
}
