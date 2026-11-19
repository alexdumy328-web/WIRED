import { useMemo } from 'react'

/** Deterministic pseudo-random numbers so the pattern is the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

type Trace = { d: string; end: [number, number]; dur: number; delay: number }

/** PCB-style routes: straight runs joined by 45° bends, ending in a via. */
function makeTraces(n: number): Trace[] {
  const r = rng(7)
  const W = 1600
  const H = 1000
  const out: Trace[] = []
  for (let i = 0; i < n; i++) {
    let x = Math.round(r() * W)
    let y = Math.round(r() * H)
    const pts: [number, number][] = [[x, y]]
    let dir = Math.floor(r() * 4) * 2 // 0,2,4,6 = right, down, left, up (multiples of 45°)
    const segs = 3 + Math.floor(r() * 3)
    for (let s = 0; s < segs; s++) {
      const len = 60 + r() * 220
      const a = (dir * Math.PI) / 4
      x = Math.round(x + Math.cos(a) * len)
      y = Math.round(y + Math.sin(a) * len)
      pts.push([x, y])
      dir = (dir + (r() < 0.5 ? 1 : 7)) % 8 // turn ±45°
    }
    out.push({
      d: 'M' + pts.map((p) => p.join(' ')).join('L'),
      end: pts[pts.length - 1],
      dur: 7 + r() * 9,
      delay: -r() * 16,
    })
  }
  return out
}

/** Fixed, faint circuit traces behind the page with gold signals running along them. */
export function TraceField() {
  const traces = useMemo(() => makeTraces(26), [])
  return (
    <svg className="pointer-events-none fixed inset-0 z-0 size-full" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {traces.map((t, i) => (
          <g key={i}>
            <path d={t.d} stroke="var(--line)" strokeWidth="1.5" opacity="0.9" />
            <path
              d={t.d}
              stroke="var(--gold-soft)"
              strokeWidth="2"
              pathLength={1000}
              strokeDasharray="34 966"
              className="nt-signal"
              style={{ animationDuration: `${t.dur}s`, animationDelay: `${t.delay}s` }}
            />
            <circle cx={t.end[0]} cy={t.end[1]} r="4" stroke="var(--line)" strokeWidth="1.5" />
          </g>
        ))}
      </g>
    </svg>
  )
}
