/**
 * The mark is an N routed like a PCB trace: two legs joined by a 45° run,
 * ending in gold vias. The "draw" prop animates the trace on first paint.
 */
export function LogoMark({ size = 32, draw = false }: { size?: number; draw?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <path
        d="M8 25V10.2c0-.9 1.1-1.4 1.8-.8L22.2 21.6c.7.6 1.8.1 1.8-.8V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={
          draw
            ? { strokeDasharray: 1, strokeDashoffset: 1, animation: 'nt-draw 1.1s cubic-bezier(.65,0,.35,1) .15s forwards' }
            : undefined
        }
      />
      {/* parallel return trace, like a differential pair */}
      <path d="M12.6 25v-6.3" stroke="currentColor" strokeOpacity=".38" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19.4 7v6.3" stroke="currentColor" strokeOpacity=".38" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="25" r="2.9" fill="var(--gold-soft)" />
      <circle cx="24" cy="7" r="2.9" fill="var(--gold-soft)" />
      <circle cx="8" cy="25" r="1.1" fill="var(--bg)" />
      <circle cx="24" cy="7" r="1.1" fill="var(--bg)" />
      <style>{`@keyframes nt-draw{to{stroke-dashoffset:0}}`}</style>
    </svg>
  )
}

export function Logo({ draw = false, compact = false }: { draw?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-ink">
      <LogoMark draw={draw} />
      <span className={`leading-none ${compact ? 'hidden lg:inline' : ''}`} style={{ fontStretch: '120%' }}>
        <span className="font-extrabold tracking-tight">Norgelis</span>
        <span className="font-normal text-muted"> Tech</span>
      </span>
    </span>
  )
}
